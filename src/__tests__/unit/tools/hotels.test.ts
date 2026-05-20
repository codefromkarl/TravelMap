/**
 * search_hotels Tool 单元测试
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchHotelsTool } from "../../../tools/hotels.js";
import { createEnvStub } from "../../helpers/env.js";
import { createMockHotel } from "../../mocks/fixtures.js";

const env = createEnvStub();

vi.mock("../../../services/hotel-service.js", () => ({
  searchHotels: vi.fn(async () => ({
    hotels: [
      {
        name: "测试酒店",
        rating: 4.2,
        price: 298,
        priceRange: "¥298",
        address: "杭州西湖区",
        location: { latitude: 30.27, longitude: 120.15 },
        distance: 1200,
        walkMinutes: 15,
        transitAccessible: true,
        tags: ["免费WiFi"],
        source: "mock",
      },
    ],
    source: "mock",
  })),
  clearHotelCache: vi.fn(),
}));

import { searchHotels } from "../../../services/hotel-service.js";

const mockedSearch = vi.mocked(searchHotels);

afterEach(() => {
  env.reset();
  vi.clearAllMocks();
});

describe("search_hotels tool", () => {
  it("应定义正确的 name 和 label", () => {
    expect(searchHotelsTool.name).toBe("search_hotels");
    expect(searchHotelsTool.label).toBe("酒店搜索");
  });

  it("应有完整的 description", () => {
    expect(searchHotelsTool.description).toContain("酒店");
    expect(searchHotelsTool.description).toContain("预算");
    expect(searchHotelsTool.description).toContain("通勤");
  });

  it("costTier 应为 cheap", () => {
    expect(searchHotelsTool.costTier).toBe("cheap");
  });

  it("应有 TypeBox schema 参数定义", () => {
    const params = searchHotelsTool.parameters as Record<string, unknown>;
    expect(params).toBeDefined();
    expect(params.type).toBe("object");
    expect(params.properties).toBeDefined();
  });

  it("应包含 city 参数", () => {
    const props = (searchHotelsTool.parameters as Record<string, unknown>).properties as Record<
      string,
      unknown
    >;
    expect(props.city).toBeDefined();
  });

  // ─── execute 行为测试 ────────────────────────────────────

  describe("execute", () => {
    beforeEach(() => {
      // afterEach 清除 mock 后重置默认 mock 实现
      mockedSearch.mockResolvedValue({
        hotels: [
          createMockHotel({
            name: "测试酒店",
            rating: 4.2,
            address: "杭州西湖区",
            priceRange: "¥298",
            location: { latitude: 30.27, longitude: 120.15 },
            estimatedCost: 298,
          }) as any,
        ],
        source: "mock",
      });
    });

    it("应返回格式化的酒店搜索结果", async () => {
      env.unset("AMAP_WEB_KEY");
      env.unset("GOOGLE_MAPS_API_KEY");

      const result = await searchHotelsTool.execute("tc_1", {
        city: "杭州",
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("杭州");
      expect(text).toContain("酒店搜索结果");

      expect(result.details).toBeDefined();
      expect(result.details.city).toBe("杭州");
      expect(result.details.hotels).toHaveLength(1);
    });

    it("结果应包含酒店详情", async () => {
      const result = await searchHotelsTool.execute("tc_1", {
        city: "杭州",
        latitude: 30.275,
        longitude: 120.155,
      });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("🏨");
      expect(text).toContain("💰");
      expect(text).toContain("⭐");
      expect(text).toContain("步行约");
    });

    it("有 warning 时应展示警告", async () => {
      mockedSearch.mockResolvedValue({
        hotels: [
          {
            name: "Mock酒店",
            rating: 4.0,
            price: 200,
            priceRange: "¥200",
            address: "Test",
            location: { latitude: 30, longitude: 120 },
            distance: 500,
            walkMinutes: 6,
            transitAccessible: true,
            tags: [],
            source: "mock",
          },
        ],
        source: "mock",
        warning: "无 API Key，使用 mock 数据",
      });

      const result = await searchHotelsTool.execute("tc_1", { city: "杭州" });
      const text = (result.content[0] as { text: string }).text;

      expect(text).toContain("⚠️");
      expect(result.details.warning).toBe("无 API Key，使用 mock 数据");
    });

    it("应传递 commuteMode 参数", async () => {
      const result = await searchHotelsTool.execute("tc_1", {
        city: "杭州",
        commuteMode: "transit",
        commuteMinutes: 30,
      });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("公交30分钟内");
    });

    it("服务抛错时应降级返回错误信息", async () => {
      mockedSearch.mockRejectedValue(new Error("服务超时"));

      const result = await searchHotelsTool.execute("tc_1", { city: "杭州" });
      const text = (result.content[0] as { text: string }).text;

      expect(text).toContain("酒店搜索遇到问题");
      expect(text).toContain("服务超时");
      expect(result.details.error).toBe("服务超时");
    });

    it("details 中 hotels 应包含完整字段", async () => {
      const result = await searchHotelsTool.execute("tc_1", {
        city: "杭州",
        latitude: 30.275,
        longitude: 120.155,
      });

      const hotels = result.details.hotels;
      expect(hotels.length).toBeGreaterThan(0);

      const h = hotels[0];
      expect(h).toHaveProperty("name");
      expect(h).toHaveProperty("rating");
      expect(h).toHaveProperty("price");
      expect(h).toHaveProperty("priceRange");
      expect(h).toHaveProperty("address");
      expect(h).toHaveProperty("location");
      expect(h).toHaveProperty("distance");
      expect(h).toHaveProperty("walkMinutes");
      expect(h).toHaveProperty("transitAccessible");
      expect(h).toHaveProperty("tags");
      expect(h).toHaveProperty("source");
    });

    it("真实数据应标注真实来源", async () => {
      mockedSearch.mockResolvedValue({
        hotels: [
          {
            name: "Real Hotel",
            rating: 4.5,
            price: 500,
            priceRange: "¥500",
            address: "Real Address",
            location: { latitude: 30, longitude: 120 },
            distance: 800,
            walkMinutes: 10,
            transitAccessible: true,
            tags: ["有电梯"],
            source: "amap",
          },
        ],
        source: "amap",
      });

      const result = await searchHotelsTool.execute("tc_1", {
        city: "杭州",
        latitude: 30,
        longitude: 120,
      });

      expect(result.details.source).toBe("amap");
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("真实数据");
    });
  });
});
