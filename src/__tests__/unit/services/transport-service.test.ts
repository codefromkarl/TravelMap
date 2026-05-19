/**
 * transport-service 单元测试
 *
 * 覆盖：
 *   - 高德火车搜索（mock API）
 *   - enrichTransferDays
 *   - mock 降级
 *   - 缓存
 *   - 错误路径
 */

import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TransportOption } from "../../../types/trip.js";
import {
  createMockDayPlan,
  createMockTransportOption,
  createMockTripPlan,
} from "../../mocks/fixtures.js";
import { server } from "../../mocks/server.js";

// Mock trvl-service（trvl CLI 在测试环境不可用）
vi.mock("../../../services/trvl-service.js", () => ({
  isTrvlAvailable: vi.fn().mockResolvedValue(false),
  searchFlights: vi.fn().mockRejectedValue(new Error("trvl not available")),
}));

// Mock config — 提供高德 key
vi.mock("../../../services/config.js", () => ({
  config: new Proxy({} as Record<string, unknown>, {
    get(_, key) {
      if (key === "amapWebKey") return "test-amap-key";
      return undefined;
    },
  }),
}));

// Mock dual-map-service
vi.mock("../../../services/dual-map-service.js", () => ({
  dualGeocode: vi.fn().mockImplementation((_addr: string, city: string) => {
    const coords: Record<string, { latitude: number; longitude: number }> = {
      杭州: { latitude: 30.2741, longitude: 120.1551 },
      上海: { latitude: 31.2304, longitude: 121.4737 },
      北京: { latitude: 39.9042, longitude: 116.4074 },
    };
    const loc = coords[city] ?? { latitude: 31.23, longitude: 121.47 };
    return Promise.resolve({ location: loc, engine: "amap" });
  }),
}));

// 动态导入以使 mock 生效
const { searchIntercityTransport, enrichTransferDays, clearTransportCache } = await import(
  "../../../services/transport-service.js"
);

describe("transport-service", () => {
  beforeEach(() => {
    clearTransportCache();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  // ─── searchIntercityTransport ──────────────────────────

  describe("searchIntercityTransport", () => {
    it("应通过高德 API 返回火车方案", async () => {
      const result = await searchIntercityTransport({
        originCity: "杭州",
        destCity: "上海",
        date: "2026-05-20",
        transportType: "train",
      });

      expect(result.length).toBeGreaterThan(0);

      const g7590 = result.find((r) => r.code === "G7590");
      expect(g7590).toBeDefined();
      expect(g7590!.type).toBe("train");
      expect(g7590!.departureStation).toBe("杭州东站");
      expect(g7590!.arrivalStation).toBe("上海虹桥站");
      expect(g7590!.departureTime).toBe("08:30");
      expect(g7590!.arrivalTime).toBe("09:30");
      expect(g7590!.source).toBe("amap");
      expect(g7590!.price).toBe(73.5);
      expect(g7590!.durationMinutes).toBe(90); // 5400s / 60 = 90min
    });

    it("应对同一班次去重", async () => {
      const result = await searchIntercityTransport({
        originCity: "杭州",
        destCity: "上海",
        date: "2026-05-20",
        transportType: "train",
      });

      const codes = result.map((r) => r.code);
      const uniqueCodes = new Set(codes);
      expect(codes.length).toBe(uniqueCodes.size);
    });

    it("应使用缓存（同参数不重复请求）", async () => {
      const r1 = await searchIntercityTransport({
        originCity: "杭州",
        destCity: "上海",
        date: "2026-05-20",
      });
      const r2 = await searchIntercityTransport({
        originCity: "杭州",
        destCity: "上海",
        date: "2026-05-20",
      });

      expect(r1).toBe(r2); // 同一引用
    });

    it("高德 API 失败时应降级到 mock", async () => {
      // 覆盖 handler 返回错误
      server.use(
        http.get("https://restapi.amap.com/v3/direction/transit/integrated", () => {
          return HttpResponse.json({ status: "0", route: {} });
        }),
      );

      const result = await searchIntercityTransport({
        originCity: "杭州",
        destCity: "上海",
        date: "2026-05-20",
        transportType: "train",
      });

      // 降级到 mock
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]!.source).toBe("mock");
      expect(result[0]!.departureStation).toContain("杭州");
    });

    it("高德 API 网络异常时应降级到 mock", async () => {
      server.use(
        http.get("https://restapi.amap.com/v3/direction/transit/integrated", () => {
          return HttpResponse.error();
        }),
      );

      const result = await searchIntercityTransport({
        originCity: "杭州",
        destCity: "上海",
        date: "2026-05-20",
        transportType: "train",
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result.every((r) => r.source === "mock")).toBe(true);
    });

    it("transportType=flight 时只返回航班方案（mock）", async () => {
      // 高德在此模式不被调用
      const result = await searchIntercityTransport({
        originCity: "杭州",
        destCity: "上海",
        date: "2026-05-20",
        transportType: "flight",
      });

      // trvl 不可用 → mock 降级
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((r) => r.type === "flight")).toBe(true);
    });

    it("transportType=all 时返回所有类型", async () => {
      // 火车来自高德 + 航班来自 trvl（mock 因为不可用）
      const result = await searchIntercityTransport({
        originCity: "杭州",
        destCity: "上海",
        date: "2026-05-20",
        transportType: "all",
      });

      expect(result.length).toBeGreaterThan(0);
      // 高德有火车数据
      const trains = result.filter((r) => r.type === "train");
      expect(trains.length).toBeGreaterThan(0);
    });
  });

  // ─── enrichTransferDays ────────────────────────────────

  describe("enrichTransferDays", () => {
    it("应为移动日填充交通方案", async () => {
      const tripPlan = createMockTripPlan({
        cities: ["杭州", "上海"],
        days: [
          createMockDayPlan({
            dayIndex: 1,
            city: "杭州",
            date: "2026-05-19",
            isTransferDay: false,
          }),
          createMockDayPlan({
            dayIndex: 2,
            city: "上海",
            date: "2026-05-20",
            isTransferDay: true,
            transferInfo: "杭州→上海",
          }),
        ],
      });

      const enriched = await enrichTransferDays(tripPlan);

      const transferDay = enriched.days.find((d) => d.isTransferDay);
      expect(transferDay).toBeDefined();
      // transferInfo 应被替换为格式化方案
      expect(transferDay!.transferInfo).toContain("G7590");
      expect(transferDay!.transferInfo).toContain("杭州东站");
      expect(transferDay!.transferInfo).toContain("上海虹桥站");
    });

    it("无移动日时应返回不变的 TripPlan", async () => {
      const tripPlan = createMockTripPlan({
        days: [createMockDayPlan({ isTransferDay: false })],
      });

      const result = await enrichTransferDays(tripPlan);
      expect(result.days).toEqual(tripPlan.days);
    });

    it("出发城市和目的城市相同时应跳过", async () => {
      const tripPlan = createMockTripPlan({
        cities: ["杭州", "杭州"],
        days: [
          createMockDayPlan({ dayIndex: 1, city: "杭州", isTransferDay: false }),
          createMockDayPlan({
            dayIndex: 2,
            city: "杭州",
            isTransferDay: true,
            transferInfo: "同城市移动",
          }),
        ],
      });

      const result = await enrichTransferDays(tripPlan);
      const transferDay = result.days.find((d) => d.isTransferDay);
      // 不变
      expect(transferDay!.transferInfo).toBe("同城市移动");
    });

    it("移动日为第一天时应用自身城市作为出发地", async () => {
      const tripPlan = createMockTripPlan({
        cities: ["上海"],
        days: [
          createMockDayPlan({
            dayIndex: 1,
            city: "上海",
            date: "2026-05-20",
            isTransferDay: true,
            transferInfo: "出发",
          }),
        ],
      });

      // 第一天无前一天 → originCity = day.city = destCity → 跳过
      const result = await enrichTransferDays(tripPlan);
      const transferDay = result.days.find((d) => d.isTransferDay);
      expect(transferDay!.transferInfo).toBe("出发"); // 未变
    });
  });

  // ─── 缓存行为 ──────────────────────────────────────────

  describe("缓存", () => {
    it("clearTransportCache 应清除缓存", async () => {
      const r1 = await searchIntercityTransport({
        originCity: "杭州",
        destCity: "上海",
        date: "2026-05-20",
      });

      clearTransportCache();

      const r2 = await searchIntercityTransport({
        originCity: "杭州",
        destCity: "上海",
        date: "2026-05-20",
      });

      // 不同引用（重新获取）
      expect(r1).not.toBe(r2);
    });
  });
});
