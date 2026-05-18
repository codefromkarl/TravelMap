/**
 * SearchOrchestrator — 单元测试
 *
 * 测试策略:
 *   - mock 底层搜索服务，不调用真实 API
 *   - 验证并行调用、结果注入、格式化输出
 *   - 覆盖搜索失败 fallback 路径
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatSearchResultsCompact,
  formatSearchResultsForAgent,
  injectSearchResults,
  isSearchValid,
  runParallelSearch,
} from "../../../services/search-orchestrator.js";
import { createMockTripRequest } from "../../mocks/fixtures.js";

// mock 底层服务
vi.mock("../../../services/multi-source-service.js", () => ({
  searchAttractionsMultiSource: vi.fn(),
}));

vi.mock("../../../services/weather-service.js", () => ({
  searchWeather: vi.fn(),
}));

vi.mock("../../../services/dual-map-service.js", () => ({
  dualGeocode: vi.fn(),
}));

import { dualGeocode } from "../../../services/dual-map-service.js";
import { searchAttractionsMultiSource } from "../../../services/multi-source-service.js";
import { searchWeather } from "../../../services/weather-service.js";

describe("SearchOrchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("runParallelSearch", () => {
    it("应并行调用景点、天气、地理编码服务", async () => {
      vi.mocked(searchAttractionsMultiSource).mockResolvedValue({
        attractions: [
          {
            name: "Test Attraction",
            nameZh: "测试景点",
            nameEn: "Test Attraction",
            address: "Test Address",
            location: { latitude: 39.9, longitude: 116.4 },
            visitDuration: 120,
            description: "A test attraction",
            category: "景点",
            ticketPrice: 50,
            reservationRequired: false,
            reservationTips: "",
            ugcReviews: [],
            sources: ["structured"],
          },
        ],
        sources: ["structured"],
        fromCache: false,
      });

      vi.mocked(searchWeather).mockResolvedValue({
        weather: [
          {
            date: "2026-07-01",
            city: "北京",
            dayWeather: "晴",
            nightWeather: "多云",
            dayTemp: 30,
            nightTemp: 22,
            windDirection: "东南风",
            windPower: "3级",
          },
        ],
        source: "openweathermap",
      });

      vi.mocked(dualGeocode).mockResolvedValue({
        location: { latitude: 39.9042, longitude: 116.4074 },
        engine: "amap",
      });

      const request = createMockTripRequest();
      const result = await runParallelSearch(request);

      expect(result.attractions).toHaveLength(1);
      expect(result.attractions[0]!.nameZh).toBe("测试景点");
      expect(result.weather).toHaveLength(1);
      expect(result.weather[0]!.dayWeather).toBe("晴");
      expect(result.cityCoords.has("北京")).toBe(true);
      expect(result.sources).toContain("structured");
      expect(result.sources).toContain("openweathermap");

      expect(searchAttractionsMultiSource).toHaveBeenCalledWith(
        expect.objectContaining({ city: "北京" }),
      );
      expect(searchWeather).toHaveBeenCalledWith(expect.objectContaining({ city: "北京" }));
      expect(dualGeocode).toHaveBeenCalledWith("北京", "北京");
    });

    it("多城市请求时应为每个城市调用地理编码", async () => {
      vi.mocked(searchAttractionsMultiSource).mockResolvedValue({
        attractions: [],
        sources: ["mock"],
        fromCache: false,
      });
      vi.mocked(searchWeather).mockResolvedValue({
        weather: [],
        source: "mock",
      });
      vi.mocked(dualGeocode).mockResolvedValue({
        location: { latitude: 39.9, longitude: 116.4 },
        engine: "amap",
      });

      const request = createMockTripRequest({
        cities: [
          { city: "北京", days: 2 },
          { city: "上海", days: 3 },
        ],
        city: "北京",
      });

      const result = await runParallelSearch(request);

      expect(result.cityCoords.size).toBe(2);
      expect(dualGeocode).toHaveBeenCalledTimes(2);
      expect(dualGeocode).toHaveBeenCalledWith("北京", "北京");
      expect(dualGeocode).toHaveBeenCalledWith("上海", "上海");
    });

    it("搜索失败时不应抛错，应返回空结果", async () => {
      vi.mocked(searchAttractionsMultiSource).mockRejectedValue(new Error("API 错误"));
      vi.mocked(searchWeather).mockRejectedValue(new Error("API 错误"));

      const request = createMockTripRequest();
      const result = await runParallelSearch(request);

      expect(result.attractions).toHaveLength(0);
      expect(result.weather).toHaveLength(0);
      expect(result.sources).toContain("failed");
    });

    it("禁用地理编码时不应调用 dualGeocode", async () => {
      vi.mocked(searchAttractionsMultiSource).mockResolvedValue({
        attractions: [],
        sources: ["mock"],
        fromCache: false,
      });
      vi.mocked(searchWeather).mockResolvedValue({
        weather: [],
        source: "mock",
      });

      const request = createMockTripRequest();
      await runParallelSearch(request, { enableGeocode: false });

      expect(dualGeocode).not.toHaveBeenCalled();
    });
  });

  describe("formatSearchResultsForAgent", () => {
    it("应格式化为可读的搜索结果文本", () => {
      const bundle = {
        attractions: [
          {
            name: "Attraction1",
            nameZh: "景点一",
            nameEn: "Attraction1",
            address: "Address1",
            location: { latitude: 39.9, longitude: 116.4 },
            visitDuration: 120,
            description: "Description1",
            category: "博物馆",
            ticketPrice: 50,
            reservationRequired: true,
            reservationTips: "提前 3 天预约",
            ugcReviews: [],
            sources: ["structured"],
          },
        ],
        weather: [
          {
            date: "2026-07-01",
            city: "北京",
            dayWeather: "晴",
            nightWeather: "多云",
            dayTemp: 30,
            nightTemp: 22,
            windDirection: "东南风",
            windPower: "3级",
          },
        ],
        sources: ["structured", "openweathermap"],
        cityCoords: new Map([["北京", { latitude: 39.9042, longitude: 116.4074 }]]),
      };

      const text = formatSearchResultsForAgent(bundle);

      expect(text).toContain("🔍 搜索结果（已由系统预搜索）");
      expect(text).toContain("景点一");
      expect(text).toContain("博物馆");
      expect(text).toContain("晴");
      expect(text).toContain("北京");
      expect(text).toContain("数据来源:");
    });

    it("空结果应输出对应提示", () => {
      const bundle = {
        attractions: [],
        weather: [],
        sources: [],
        cityCoords: new Map(),
      };

      const text = formatSearchResultsForAgent(bundle);

      expect(text).toContain("🔍 搜索结果");
      expect(text).toContain("数据来源:");
    });
  });

  describe("injectSearchResults", () => {
    it("应将搜索结果注入到 base prompt 末尾", () => {
      const basePrompt = "请规划一次旅行。";
      const bundle = {
        attractions: [
          {
            name: "Attraction1",
            nameZh: "景点一",
            nameEn: "Attraction1",
            address: "Address1",
            location: { latitude: 39.9, longitude: 116.4 },
            visitDuration: 120,
            description: "Description1",
            category: "景点",
            ticketPrice: 50,
            reservationRequired: false,
            reservationTips: "",
            ugcReviews: [],
            sources: ["structured"],
          },
        ],
        weather: [],
        sources: ["structured"],
        cityCoords: new Map(),
      };

      const result = injectSearchResults(basePrompt, bundle, "readable");

      expect(result).toContain("请规划一次旅行。");
      expect(result).toContain("🔍 搜索结果（已由系统预搜索）");
      expect(result).toContain("景点一");
      expect(result.startsWith("请规划一次旅行。")).toBe(true);
    });
  });

  describe("formatSearchResultsCompact", () => {
    it("应输出紧凑的管道分隔格式", () => {
      const bundle = {
        attractions: [
          {
            name: "Attraction1",
            nameZh: "景点一",
            nameEn: "Attraction1",
            address: "Address1",
            location: { latitude: 39.9, longitude: 116.4 },
            visitDuration: 120,
            description: "Description1",
            category: "博物馆",
            ticketPrice: 50,
            reservationRequired: true,
            reservationTips: "提前3天",
            ugcReviews: [],
            sources: ["structured"],
          },
        ],
        weather: [
          {
            date: "2026-07-01",
            city: "北京",
            dayWeather: "晴",
            nightWeather: "多云",
            dayTemp: 30,
            nightTemp: 22,
            windDirection: "东南风",
            windPower: "3级",
          },
        ],
        sources: ["structured", "openweathermap"],
        cityCoords: new Map([["北京", { latitude: 39.9042, longitude: 116.4074 }]]),
      };

      const text = formatSearchResultsCompact(bundle);

      expect(text).toContain("[搜索结果]");
      expect(text).toContain("景点(1):");
      expect(text).toContain("景点一|博物馆|50|120|需预约|39.90,116.40");
      expect(text).toContain("天气(1天):");
      expect(text).toContain("2026-07-01|晴|多云|30|22");
      expect(text).toContain("坐标:北京=39.90,116.41");
      expect(text).toContain("来源:structured,openweathermap");
    });

    it("字符数应比 readable 格式少（5个以上景点时）", () => {
      // 生成 5 个景点，模拟真实场景
      const attractions = Array.from({ length: 5 }, (_, i) => ({
        name: `A${i}`,
        nameZh: `景点${i + 1}`,
        nameEn: `Attraction${i + 1}`,
        address: `北京市某区某路${i + 1}号`,
        location: { latitude: 39.9 + i * 0.1, longitude: 116.4 + i * 0.1 },
        visitDuration: 120 + i * 30,
        description: `desc${i}`,
        category: i % 2 === 0 ? "博物馆" : "古迹",
        ticketPrice: 50 + i * 10,
        reservationRequired: i % 2 === 0,
        reservationTips: i % 2 === 0 ? "提前预约" : "",
        ugcReviews: [],
        sources: ["structured"],
      }));

      const bundle = {
        attractions,
        weather: [
          {
            date: "2026-07-01",
            city: "北京",
            dayWeather: "晴",
            nightWeather: "多云",
            dayTemp: 30,
            nightTemp: 22,
            windDirection: "东南风",
            windPower: "3级",
          },
        ],
        sources: ["structured"],
        cityCoords: new Map([["北京", { latitude: 39.9, longitude: 116.4 }]]),
      };

      const compact = formatSearchResultsCompact(bundle);
      const readable = formatSearchResultsForAgent(bundle);

      // 5 个以上景点时 compact 应明显更小
      expect(compact.length).toBeLessThan(readable.length * 0.7);
    });
  });

  describe("isSearchValid", () => {
    it("有景点或天气时应返回 true", () => {
      expect(
        isSearchValid({
          attractions: [
            {
              name: "a",
              nameZh: "a",
              nameEn: "a",
              address: "",
              location: { latitude: 0, longitude: 0 },
              visitDuration: 60,
              description: "",
              category: "",
              ticketPrice: 0,
              reservationRequired: false,
              reservationTips: "",
              ugcReviews: [],
              sources: [],
            },
          ],
          weather: [],
          sources: [],
          cityCoords: new Map(),
        }),
      ).toBe(true);
    });

    it("完全空时应返回 false", () => {
      expect(
        isSearchValid({
          attractions: [],
          weather: [],
          sources: [],
          cityCoords: new Map(),
        }),
      ).toBe(false);
    });
  });
});
