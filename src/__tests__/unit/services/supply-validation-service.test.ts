/**
 * supply-validation-service 单元测试
 *
 * 覆盖：
 * - 已有精确坐标补给点直接返回
 * - 无 API Key 时跳过验证（不触发网络请求）
 * - 坐标精度标注（exact / unknown）
 * - 价格可信度标注
 * - 批量验证
 * - 覆盖率统计
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeValidationStats,
  validateRouteSupplies,
  validateSupplyPoint,
} from "../../../services/supply-validation-service.js";
import type { SupplyPoint } from "../../../types/route.js";

// Mock dual-map-service 避免真实网络请求
vi.mock("../../../services/dual-map-service.js", () => ({
  dualGeocode: vi.fn(),
  isDomesticCity: vi.fn((city: string) => ["北京", "上海", "杭州", "广州"].some((c) => city.includes(c))),
}));

import { dualGeocode } from "../../../services/dual-map-service.js";
const mockedDualGeocode = vi.mocked(dualGeocode);

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("validateSupplyPoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it("已有精确坐标应直接返回，不调用任何 API", async () => {
    const point: SupplyPoint = {
      name: "西泠印社茶室",
      location: { latitude: 30.2566, longitude: 120.1488 },
      locationAccuracy: "exact",
      type: "cafe",
      description: "龙井茶",
      estimatedCost: 40,
      isRecommended: true,
    };

    const result = await validateSupplyPoint(point, "杭州");
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockedDualGeocode).not.toHaveBeenCalled();
    expect(result.locationAccuracy).toBe("exact");
    expect(result.estimatedCost).toBe(40);
  });

  it("无 API Key 且无坐标时应标记为 unknown，不触发网络", async () => {
    const point: SupplyPoint = {
      name: "某小店",
      type: "shop",
      description: "饮料",
      estimatedCost: 15,
      isRecommended: false,
    };

    const result = await validateSupplyPoint(point, "某市", {
      amapKey: undefined,
      googleKey: undefined,
      timeout: 3000,
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockedDualGeocode).not.toHaveBeenCalled();
    expect(result.locationAccuracy).toBe("unknown");
    expect(result.estimatedCost).toBe(15);
    expect(result.priceConfidence).toBe("estimate");
  });

  it("高德 POI 成功时应返回精确坐标和 API 价格", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "1",
        pois: [
          {
            name: "星巴克",
            location: "120.1500,30.2600",
            address: "北山街1号",
            biz_ext: { cost: "45.5" },
          },
        ],
      }),
    });

    const point: SupplyPoint = {
      name: "星巴克",
      type: "cafe",
      description: "咖啡",
      estimatedCost: 30,
      isRecommended: false,
    };

    const result = await validateSupplyPoint(point, "杭州", {
      amapKey: "test-key",
      timeout: 3000,
    });

    expect(result.locationAccuracy).toBe("exact");
    expect(result.location).toEqual({ latitude: 30.26, longitude: 120.15 });
    expect(result.estimatedCost).toBe(46);
    expect(result.priceConfidence).toBe("api");
    expect(result.dataSource).toContain("amap_poi");
  });

  it("高德 POI 无结果时应降级到 dualGeocode（国内有 key）", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "1", pois: [] }),
    });
    mockedDualGeocode.mockResolvedValue({
      location: { latitude: 30.25, longitude: 120.14 },
      engine: "nominatim",
    });

    const point: SupplyPoint = {
      name: "某茶室",
      type: "cafe",
      description: "茶",
      estimatedCost: 20,
      isRecommended: false,
    };

    const result = await validateSupplyPoint(point, "杭州", {
      amapKey: "test-key",
      timeout: 3000,
    });

    expect(mockedDualGeocode).toHaveBeenCalled();
    expect(result.locationAccuracy).toBe("approximate");
  });

  it("Google Places 成功时应返回精确坐标", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [
          {
            name: "Starbucks",
            geometry: { location: { lat: 51.5, lng: -0.1 } },
            formatted_address: "London",
            price_level: 2,
          },
        ],
      }),
    });

    const point: SupplyPoint = {
      name: "Starbucks",
      type: "cafe",
      description: "coffee",
      estimatedCost: 50,
      isRecommended: false,
    };

    const result = await validateSupplyPoint(point, "London", {
      googleKey: "test-key",
      timeout: 3000,
    });

    console.log("Google Places result:", JSON.stringify(result));
    expect(result.locationAccuracy).toBe("exact");
    expect(result.estimatedCost).toBe(60); // price_level 2 -> ¥60
    expect(result.priceConfidence).toBe("api");
  });
});

describe("validateRouteSupplies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("批量验证应逐个处理", async () => {
    const points: SupplyPoint[] = [
      { name: "A", location: { latitude: 1, longitude: 1 }, locationAccuracy: "exact", type: "shop", description: "", estimatedCost: 10, isRecommended: false },
      { name: "B", type: "shop", description: "", estimatedCost: 10, isRecommended: false },
    ];

    const results = await validateRouteSupplies(points, "某市");
    expect(results).toHaveLength(2);
    expect(results[0].locationAccuracy).toBe("exact");
    expect(results[1].locationAccuracy).toBe("unknown");
  });
});

describe("computeValidationStats", () => {
  it("应正确统计各精度等级数量", () => {
    const points = [
      { name: "A", locationAccuracy: "exact", estimatedCost: 10, priceConfidence: "api", type: "shop", description: "", isRecommended: false },
      { name: "B", locationAccuracy: "approximate", estimatedCost: 10, priceConfidence: "estimate", type: "shop", description: "", isRecommended: false },
      { name: "C", locationAccuracy: "unknown", estimatedCost: 10, priceConfidence: "estimate", type: "shop", description: "", isRecommended: false },
      { name: "D", type: "shop", description: "", estimatedCost: 10, isRecommended: false }, // 无 locationAccuracy
    ];

    const stats = computeValidationStats(points);
    expect(stats.total).toBe(4);
    expect(stats.exact).toBe(1);
    expect(stats.approximate).toBe(1);
    expect(stats.unknown).toBe(2);
    expect(stats.apiPrice).toBe(1);
    expect(stats.estimatePrice).toBe(3);
  });
});
