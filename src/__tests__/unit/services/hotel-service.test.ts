/**
 * hotel-service 单元测试
 *
 * 覆盖：正常搜索 / style 映射 / budget 过滤 / commuteMode 半径映射 /
 *       坐标搜索 vs 城市名搜索 / mock 降级 / Google price_level 映射
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { _test, clearHotelCache, searchHotels } from "../../../services/hotel-service.js";
import { createEnvStub } from "../../helpers/env.js";

const env = createEnvStub();

// Mock 外部依赖
vi.mock("../../../services/config.js", () => ({
  config: new Proxy(
    {},
    {
      get(_, key) {
        const map: Record<string, string | undefined> = {
          amapWebKey: process.env.AMAP_WEB_KEY,
          googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
        };
        return map[key as string];
      },
    },
  ),
}));

vi.mock("../../../services/dual-map-service.js", () => ({
  isDomesticCity: vi.fn((city: string) =>
    ["北京", "上海", "杭州", "成都", "广州", "深圳", "西安", "重庆"].some(
      (c) => city.includes(c) || c.includes(city),
    ),
  ),
  gcj02ToWgs84: vi.fn((lat: number, lng: number) => ({
    latitude: lat - 0.001,
    longitude: lng - 0.001,
  })),
  dualGeocode: vi.fn(async (_address: string, city: string) => ({
    location: {
      latitude: city === "杭州" ? 30.2741 : 31.23,
      longitude: city === "杭州" ? 120.1551 : 121.47,
    },
    engine: "mock",
  })),
}));

vi.mock("../../../services/http-client.js", () => ({
  fetchWithRetry: vi.fn(),
}));

afterEach(() => {
  env.reset();
  vi.clearAllMocks();
  clearHotelCache();
});

// ─── 辅助函数测试 ────────────────────────────────────────

describe("computeRadius", () => {
  it("默认 walk+30min → 3000m", () => {
    expect(_test.computeRadius()).toBe(3000);
  });

  it("walk+15min → 1500m", () => {
    expect(_test.computeRadius("walk", 15)).toBe(1500);
  });

  it("walk+30min → 3000m", () => {
    expect(_test.computeRadius("walk", 30)).toBe(3000);
  });

  it("transit+30min → 8000m", () => {
    expect(_test.computeRadius("transit", 30)).toBe(8000);
  });

  it("any → 15000m", () => {
    expect(_test.computeRadius("any")).toBe(15000);
  });
});

describe("parseBudget", () => {
  it("范围格式 300-500", () => {
    expect(_test.parseBudget("300-500")).toEqual({ min: 300, max: 500 });
  });

  it("单个数字 → 上限", () => {
    expect(_test.parseBudget("200")).toEqual({ min: 0, max: 200 });
  });

  it("无参数 → 空", () => {
    expect(_test.parseBudget()).toEqual({});
  });

  it("无效格式 → 空", () => {
    expect(_test.parseBudget("abc")).toEqual({});
  });
});

describe("filterByBudget", () => {
  const hotels = [
    { name: "A", price: 100, source: "mock" as const },
    { name: "B", price: 300, source: "mock" as const },
    { name: "C", price: 600, source: "mock" as const },
  ];

  it("无 budget 不过滤", () => {
    expect(_test.filterByBudget(hotels as any)).toHaveLength(3);
  });

  it("按上限过滤", () => {
    expect(_test.filterByBudget(hotels as any, "200")).toHaveLength(1);
  });

  it("按范围过滤", () => {
    expect(_test.filterByBudget(hotels as any, "200-500")).toHaveLength(1);
  });

  it("price=0 不被过滤", () => {
    const withZero = [{ name: "X", price: 0, source: "mock" as const }];
    expect(_test.filterByBudget(withZero as any, "100-200")).toHaveLength(1);
  });
});

// ─── 搜索集成测试 ────────────────────────────────────────

describe("searchHotels", () => {
  it("无 API Key 时应 mock 降级", async () => {
    env.unset("AMAP_WEB_KEY");
    env.unset("GOOGLE_MAPS_API_KEY");

    const result = await searchHotels({ city: "杭州" });

    expect(result.source).toBe("mock");
    expect(result.hotels.length).toBeGreaterThan(0);
    expect(result.hotels[0]!.source).toBe("mock");
    expect(result.warning).toContain("mock");
  });

  it("mock 酒店应包含完整字段", async () => {
    env.unset("AMAP_WEB_KEY");
    env.unset("GOOGLE_MAPS_API_KEY");

    const result = await searchHotels({ city: "杭州" });
    const h = result.hotels[0]!;

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

  it("坐标搜索应使用传入 location", async () => {
    env.unset("AMAP_WEB_KEY");
    env.unset("GOOGLE_MAPS_API_KEY");

    const result = await searchHotels({
      city: "杭州",
      location: { latitude: 30.275, longitude: 120.155 },
    });

    expect(result.hotels.length).toBeGreaterThan(0);
    // 不应调用 geocode
    const { dualGeocode } = await import("../../../services/dual-map-service.js");
    expect(dualGeocode).not.toHaveBeenCalled();
  });

  it("城市名搜索应调用 geocode", async () => {
    env.unset("AMAP_WEB_KEY");
    env.unset("GOOGLE_MAPS_API_KEY");

    const result = await searchHotels({ city: "杭州" });

    expect(result.hotels.length).toBeGreaterThan(0);
    const { dualGeocode } = await import("../../../services/dual-map-service.js");
    expect(dualGeocode).toHaveBeenCalled();
  });

  it("budget 参数应过滤 mock 结果", async () => {
    env.unset("AMAP_WEB_KEY");
    env.unset("GOOGLE_MAPS_API_KEY");

    const result = await searchHotels({ city: "杭州", budget: "200" });

    expect(result.hotels.length).toBeGreaterThan(0);
    for (const h of result.hotels) {
      if (h.price > 0) {
        expect(h.price).toBeLessThanOrEqual(200);
      }
    }
  });

  it("结果数量不应超过 10 个", async () => {
    env.unset("AMAP_WEB_KEY");
    env.unset("GOOGLE_MAPS_API_KEY");

    const result = await searchHotels({ city: "杭州" });

    expect(result.hotels.length).toBeLessThanOrEqual(10);
  });

  it("结果应按 distance 排序", async () => {
    env.unset("AMAP_WEB_KEY");
    env.unset("GOOGLE_MAPS_API_KEY");

    const result = await searchHotels({ city: "杭州" });

    for (let i = 1; i < result.hotels.length; i++) {
      expect(result.hotels[i]!.distance).toBeGreaterThanOrEqual(result.hotels[i - 1]!.distance);
    }
  });

  it("步行时间应从 distance 正确计算", async () => {
    env.unset("AMAP_WEB_KEY");
    env.unset("GOOGLE_MAPS_API_KEY");

    const result = await searchHotels({ city: "杭州" });

    for (const h of result.hotels) {
      // 5km/h = 5000m/60min ≈ 83.3m/min
      const expected = Math.ceil(h.distance / (5000 / 60));
      expect(h.walkMinutes).toBe(expected);
    }
  });

  it("公共交通可达标记应正确（< 8km）", async () => {
    env.unset("AMAP_WEB_KEY");
    env.unset("GOOGLE_MAPS_API_KEY");

    const result = await searchHotels({ city: "杭州" });

    for (const h of result.hotels) {
      expect(h.transitAccessible).toBe(h.distance < 8000);
    }
  });
});

// ─── 高德 API 集成测试 ────────────────────────────────────

describe("searchHotels - amap", () => {
  it("有高德 Key 时应调用高德 API", async () => {
    env.set("AMAP_WEB_KEY", "test-amap-key");
    env.unset("GOOGLE_MAPS_API_KEY");

    const { fetchWithRetry } = await import("../../../services/http-client.js");
    const mockedFetch = vi.mocked(fetchWithRetry);
    mockedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "1",
        pois: [
          {
            name: "测试酒店",
            address: "杭州西湖区",
            location: "120.155,30.274",
            rating: "4.5",
            biz_ext: { cost: "298", rating: "4.5" },
            distance: "1200",
            tag: "免费WiFi;免费停车",
          },
        ],
      }),
    } as Response);

    const result = await searchHotels({
      city: "杭州",
      location: { latitude: 30.275, longitude: 120.155 },
    });

    expect(result.source).toBe("amap");
    expect(result.hotels).toHaveLength(1);
    expect(result.hotels[0]!.name).toBe("测试酒店");
    expect(result.hotels[0]!.price).toBe(298);
    expect(result.hotels[0]!.rating).toBe(4.5);
    expect(result.hotels[0]!.tags).toEqual(["免费WiFi", "免费停车"]);
    expect(result.hotels[0]!.source).toBe("amap");
  });

  it("style 参数应映射到高德 keywords", async () => {
    env.set("AMAP_WEB_KEY", "test-amap-key");
    env.unset("GOOGLE_MAPS_API_KEY");

    const { fetchWithRetry } = await import("../../../services/http-client.js");
    const mockedFetch = vi.mocked(fetchWithRetry);
    mockedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: "1", pois: [] }),
    } as Response);

    // mock 降级
    const result = await searchHotels({
      city: "杭州",
      location: { latitude: 30.275, longitude: 120.155 },
      style: "经济型",
    });

    // 检查 fetchWithRetry 被调用时 URL 包含正确的 keywords
    const callUrl = mockedFetch.mock.calls[0]![0] as string;
    expect(callUrl).toContain("keywords=%E5%BF%AB%E6%8D%B7%E9%85%92%E5%BA%97"); // 快捷酒店
    expect(result.warning).toContain("mock");
  });

  it("高德 API 无结果时应降级到 mock", async () => {
    env.set("AMAP_WEB_KEY", "test-amap-key");
    env.unset("GOOGLE_MAPS_API_KEY");

    const { fetchWithRetry } = await import("../../../services/http-client.js");
    vi.mocked(fetchWithRetry).mockResolvedValue({
      ok: true,
      json: async () => ({ status: "1", pois: [] }),
    } as Response);

    const result = await searchHotels({
      city: "杭州",
      location: { latitude: 30.275, longitude: 120.155 },
    });

    expect(result.source).toBe("mock");
    expect(result.warning).toContain("mock");
  });

  it("高德 API 失败时应降级到 mock", async () => {
    env.set("AMAP_WEB_KEY", "test-amap-key");
    env.unset("GOOGLE_MAPS_API_KEY");

    const { fetchWithRetry } = await import("../../../services/http-client.js");
    vi.mocked(fetchWithRetry).mockRejectedValue(new Error("网络超时"));

    const result = await searchHotels({
      city: "杭州",
      location: { latitude: 30.275, longitude: 120.155 },
    });

    expect(result.source).toBe("mock");
    expect(result.warning).toContain("API 调用失败");
  });
});

// ─── Google API 集成测试 ───────────────────────────────────

describe("searchHotels - google", () => {
  it("国外城市应使用 Google Places API", async () => {
    env.unset("AMAP_WEB_KEY");
    env.set("GOOGLE_MAPS_API_KEY", "test-google-key");

    const { fetchWithRetry } = await import("../../../services/http-client.js");
    vi.mocked(fetchWithRetry).mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [
          {
            name: "Test Hotel Tokyo",
            vicinity: "Shibuya, Tokyo",
            geometry: { location: { lat: 35.68, lng: 139.69 } },
            rating: 4.3,
            price_level: 3,
            types: ["lodging"],
          },
        ],
      }),
    } as Response);

    const result = await searchHotels({
      city: "Tokyo",
      location: { latitude: 35.68, longitude: 139.69 },
    });

    expect(result.source).toBe("google");
    expect(result.hotels).toHaveLength(1);
    expect(result.hotels[0]!.name).toBe("Test Hotel Tokyo");
    expect(result.hotels[0]!.price).toBe(500); // price_level 3 → ¥500
    expect(result.hotels[0]!.source).toBe("google");
  });

  it("Google price_level 映射应正确", async () => {
    env.unset("AMAP_WEB_KEY");
    env.set("GOOGLE_MAPS_API_KEY", "test-google-key");

    const { fetchWithRetry } = await import("../../../services/http-client.js");

    const priceLevels = [1, 2, 3, 4];
    const expectedPrices = [100, 300, 500, 800];

    for (let i = 0; i < priceLevels.length; i++) {
      clearHotelCache();
      vi.mocked(fetchWithRetry).mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "OK",
          results: [
            {
              name: `Hotel PL${priceLevels[i]}`,
              vicinity: "Test Address",
              geometry: { location: { lat: 35.68, lng: 139.69 } },
              rating: 4.0,
              price_level: priceLevels[i],
              types: ["lodging"],
            },
          ],
        }),
      } as Response);

      const result = await searchHotels({
        city: "Tokyo",
        location: { latitude: 35.68, longitude: 139.69 },
        commuteMode: "any",
      });

      expect(result.hotels[0]!.price).toBe(expectedPrices[i]);
    }
  });
});

// ─── 缓存测试 ────────────────────────────────────────────

describe("缓存", () => {
  it("相同参数应命中缓存", async () => {
    env.unset("AMAP_WEB_KEY");
    env.unset("GOOGLE_MAPS_API_KEY");

    const result1 = await searchHotels({ city: "杭州" });
    const result2 = await searchHotels({ city: "杭州" });

    expect(result1.hotels).toEqual(result2.hotels);
  });
});
