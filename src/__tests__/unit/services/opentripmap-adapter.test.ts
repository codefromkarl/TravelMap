/**
 * OpenTripMap Adapter 单元测试
 *
 * Mock 所有 HTTP 请求，验证景点搜索的响应解析和错误降级。
 */

import { HttpResponse, http } from "msw";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clearTestConfig, setTestConfig } from "../../../services/config.js";
import {
  openTripMapHealthCheck,
  searchOpenTripMap,
} from "../../../services/free-sources/opentripmap-adapter.js";
import { server } from "../../mocks/server.js";

const MOCK_API_KEY = "test-otm-key";

beforeAll(() => {
  setTestConfig({ openTripMapApiKey: MOCK_API_KEY });
});

afterAll(() => {
  clearTestConfig();
});

describe("searchOpenTripMap", () => {
  it("正常搜索返回景点列表", async () => {
    const results = await searchOpenTripMap({
      city: "北京",
      cityLocation: { latitude: 39.9042, longitude: 116.4074 },
    });

    expect(results.length).toBeGreaterThan(0);

    const gugong = results.find((r) => r.nameZh.includes("故宫"));
    expect(gugong).toBeDefined();
    expect(gugong!.source).toBe("opentripmap");
    expect(gugong!.category).toBeTruthy();
  });

  it("输出字段正确映射", async () => {
    const results = await searchOpenTripMap({
      city: "北京",
      cityLocation: { latitude: 39.9042, longitude: 116.4074 },
    });

    expect(results.length).toBeGreaterThan(0);
    const first = results[0]!;
    expect(first.nameZh.length).toBeGreaterThan(0);
    expect(first.source).toBe("opentripmap");
    expect(first.confidence).toMatch(/^(high|medium|low)$/);
  });

  it("无坐标时通过 geoname 获取", async () => {
    const results = await searchOpenTripMap({ city: "北京" });
    // geoname mock 返回坐标后走 radius 搜索
    expect(results.length).toBeGreaterThan(0);
  });

  it("API Key 未配置时返回空数组", async () => {
    clearTestConfig();
    try {
      const results = await searchOpenTripMap({ city: "北京" });
      expect(results).toEqual([]);
    } finally {
      setTestConfig({ openTripMapApiKey: MOCK_API_KEY });
    }
  });

  it("geoname 返回空时返回空数组", async () => {
    server.use(
      http.get("https://api.opentripmap.com/0.1/zh/places/geoname", () => HttpResponse.json([])),
    );

    const results = await searchOpenTripMap({ city: "不存在的城市xyz" });
    expect(results).toEqual([]);
  });

  it("radius 返回空时返回空数组", async () => {
    server.use(
      http.get("https://api.opentripmap.com/0.1/zh/places/radius", () => HttpResponse.json([])),
    );

    const results = await searchOpenTripMap({
      city: "北京",
      cityLocation: { latitude: 39.9042, longitude: 116.4074 },
    });
    expect(results).toEqual([]);
  });

  it("详情获取失败时跳过该景点", async () => {
    server.use(
      http.get(
        "https://api.opentripmap.com/0.1/zh/places/xid/:xid",
        () => new HttpResponse(null, { status: 500 }),
      ),
    );

    const results = await searchOpenTripMap({
      city: "北京",
      cityLocation: { latitude: 39.9042, longitude: 116.4074 },
    });
    // 详情全部失败，无有效景点
    expect(results).toEqual([]);
  });

  it("非景点类型（hotels/foods/shops）被过滤", async () => {
    server.use(
      http.get("https://api.opentripmap.com/0.1/zh/places/radius", () =>
        HttpResponse.json([
          {
            name: "测试酒店",
            xid: "hotel_1",
            kinds: "hotels",
            rate: "2",
            point: { lat: 39.9, lon: 116.4 },
          },
          {
            name: "测试餐厅",
            xid: "food_1",
            kinds: "foods",
            rate: "2",
            point: { lat: 39.9, lon: 116.4 },
          },
          {
            name: "测试博物馆",
            xid: "museum_1",
            kinds: "museums,historic",
            rate: "3",
            point: { lat: 39.9, lon: 116.4 },
          },
        ]),
      ),
      http.get("https://api.opentripmap.com/0.1/zh/places/xid/:xid", ({ params }) => {
        const details: Record<string, Record<string, unknown>> = {
          hotel_1: { name: "测试酒店", kinds: "hotels", rate: "2" },
          food_1: { name: "测试餐厅", kinds: "foods", rate: "2" },
          museum_1: { name: "测试博物馆", kinds: "museums,historic", rate: "3" },
        };
        return HttpResponse.json(details[params.xid as string] ?? {});
      }),
    );

    const results = await searchOpenTripMap({
      city: "北京",
      cityLocation: { latitude: 39.9042, longitude: 116.4074 },
    });

    expect(results.length).toBe(1);
    expect(results[0]!.nameZh).toBe("测试博物馆");
  });
});

describe("openTripMapHealthCheck", () => {
  it("API Key 未配置时返回 false", async () => {
    clearTestConfig();
    try {
      const healthy = await openTripMapHealthCheck();
      expect(healthy).toBe(false);
    } finally {
      setTestConfig({ openTripMapApiKey: MOCK_API_KEY });
    }
  });
});
