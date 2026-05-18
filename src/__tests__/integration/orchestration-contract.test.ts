/**
 * 编排契约测试 — 景点→天气→地理编码 并行搜索链路
 *
 * 验证 search-orchestrator 的跨服务数据流结构完整性：
 *   - 输入 TripRequest → 输出 SearchResultsBundle
 *   - attractions: 有景点、有 UGC、有坐标
 *   - weather: 有天气数据
 *   - cityCoords: 所有城市都有坐标
 *   - sources: 标识真实数据来源
 *
 * 不验证具体值，只验证结构存在性。
 */

import { describe, expect, it } from "vitest";
import { runParallelSearch, type SearchResultsBundle } from "../../services/search-orchestrator.js";
import { createMockTripRequest } from "../mocks/fixtures.js";

describe("编排契约: runParallelSearch", () => {
  it("应返回结构完整的 SearchResultsBundle", async () => {
    const request = createMockTripRequest({
      city: "北京",
      cities: [{ city: "北京", days: 3 }],
      travelDays: 3,
      startDate: "2025-06-01",
      endDate: "2025-06-03",
    });

    const bundle = await runParallelSearch(request);

    assertBundleStructure(bundle);
  });

  it("多城市行程应包含所有城市的坐标", async () => {
    const request = createMockTripRequest({
      city: "北京",
      cities: [
        { city: "北京", days: 2 },
        { city: "西安", days: 2 },
      ],
      travelDays: 4,
      startDate: "2025-06-01",
      endDate: "2025-06-04",
    });

    const bundle = await runParallelSearch(request);

    expect(bundle.cityCoords.has("北京")).toBe(true);
    expect(bundle.cityCoords.has("西安")).toBe(true);
    const beijing = bundle.cityCoords.get("北京")!;
    expect(beijing.latitude).toBeDefined();
    expect(beijing.longitude).toBeDefined();
  });

  it("景点应带有 UGC 和来源标识", async () => {
    const request = createMockTripRequest({
      city: "北京",
      cities: [{ city: "北京", days: 2 }],
      travelDays: 2,
    });

    const bundle = await runParallelSearch(request);

    expect(bundle.attractions.length).toBeGreaterThan(0);
    const first = bundle.attractions[0];
    expect(first.ugcReviews).toBeDefined();
    expect(first.sources.length).toBeGreaterThan(0);
    expect(first.location.latitude).toBeDefined();
    expect(first.location.longitude).toBeDefined();
  });

  it("天气数据应包含每日预报", async () => {
    const request = createMockTripRequest({
      city: "北京",
      cities: [{ city: "北京", days: 3 }],
      travelDays: 3,
    });

    const bundle = await runParallelSearch(request);

    expect(bundle.weather.length).toBeGreaterThan(0);
    const day = bundle.weather[0];
    expect(day.city).toBeDefined();
    expect(day.dayWeather).toBeDefined();
    expect(day.dayTemp).toBeDefined();
  });

  it("sources 应标记数据来源", async () => {
    const request = createMockTripRequest({
      city: "北京",
      cities: [{ city: "北京", days: 2 }],
      travelDays: 2,
    });

    const bundle = await runParallelSearch(request);

    expect(bundle.sources.length).toBeGreaterThan(0);
    // 至少包含一个已知来源
    const knownSources = ["google_places", "mock", "openweathermap", "amap", "nominatim"];
    expect(bundle.sources.some((s) => knownSources.includes(s))).toBe(true);
  });
});

/** 断言 Bundle 结构完整性 */
function assertBundleStructure(bundle: SearchResultsBundle): void {
  expect(bundle.attractions).toBeDefined();
  expect(Array.isArray(bundle.attractions)).toBe(true);

  expect(bundle.weather).toBeDefined();
  expect(Array.isArray(bundle.weather)).toBe(true);

  expect(bundle.sources).toBeDefined();
  expect(Array.isArray(bundle.sources)).toBe(true);

  expect(bundle.cityCoords).toBeDefined();
  expect(bundle.cityCoords instanceof Map).toBe(true);
}
