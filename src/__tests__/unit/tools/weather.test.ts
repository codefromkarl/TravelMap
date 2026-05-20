/**
 * weather 工具单元测试
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockWeatherInfo } from "../../mocks/fixtures.js";

// Mock weather-service
vi.mock("../../../services/weather-service.js", () => ({
  searchWeather: vi.fn(),
}));

import { searchWeather } from "../../../services/weather-service.js";
import { searchWeatherTool } from "../../../tools/weather.js";

const mockSearchWeather = vi.mocked(searchWeather);

describe("searchWeatherTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const sampleWeather = [
    createMockWeatherInfo({
      date: "2026-05-20",
      city: "杭州",
      dayWeather: "晴",
      nightWeather: "多云",
      dayTemp: 28,
      nightTemp: 18,
      windDirection: "东南风",
      windPower: "3级",
    }),
    createMockWeatherInfo({
      date: "2026-05-21",
      city: "杭州",
      dayWeather: "多云",
      nightWeather: "阴",
      dayTemp: 26,
      nightTemp: 17,
      windDirection: "东风",
      windPower: "2级",
    }),
  ];

  it("应有正确的工具名称", () => {
    expect(searchWeatherTool.name).toBe("search_weather");
  });

  it("应有 cheap costTier", () => {
    expect(searchWeatherTool.costTier).toBe("cheap");
  });

  it("应返回天气预报", async () => {
    mockSearchWeather.mockResolvedValue({
      weather: sampleWeather,
      source: "amap",
    });

    const result = await searchWeatherTool.execute("call-1", { city: "杭州" });

    expect(mockSearchWeather).toHaveBeenCalledWith({ city: "杭州", days: 7 });
    expect(result.details.weather).toHaveLength(2);
    expect(result.details.source).toBe("amap");
    expect((result.content[0] as { type: "text"; text: string }).text).toContain("杭州天气预报");
  });

  it("应显示每日天气详情", async () => {
    mockSearchWeather.mockResolvedValue({
      weather: sampleWeather,
      source: "amap",
    });

    const result = await searchWeatherTool.execute("call-2", { city: "杭州" });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("晴");
    expect(text).toContain("28°C");
    expect(text).toContain("多云");
  });

  it("应支持自定义查询天数", async () => {
    mockSearchWeather.mockResolvedValue({
      weather: sampleWeather.slice(0, 1),
      source: "amap",
    });

    await searchWeatherTool.execute("call-3", { city: "北京", days: 3 });

    expect(mockSearchWeather).toHaveBeenCalledWith({ city: "北京", days: 3 });
  });

  it("应显示数据来源", async () => {
    mockSearchWeather.mockResolvedValue({
      weather: sampleWeather,
      source: "qweather",
    });

    const result = await searchWeatherTool.execute("call-4", { city: "上海" });

    expect((result.content[0] as { type: "text"; text: string }).text).toContain("qweather");
  });

  it("查询失败时应返回降级提示", async () => {
    mockSearchWeather.mockRejectedValue(new Error("API 超时"));

    const result = await searchWeatherTool.execute("call-5", { city: "杭州" });

    expect((result.content[0] as { type: "text"; text: string }).text).toContain(
      "天气查询遇到问题",
    );
    expect((result.content[0] as { type: "text"; text: string }).text).toContain("API 超时");
    expect(result.details.error).toBe("API 超时");
  });

  it("应返回风向风力信息", async () => {
    mockSearchWeather.mockResolvedValue({
      weather: sampleWeather,
      source: "amap",
    });

    const result = await searchWeatherTool.execute("call-6", { city: "杭州" });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("东南风");
    expect(text).toContain("3级");
  });

  it("应处理非 Error 类型的异常", async () => {
    mockSearchWeather.mockRejectedValue("unknown error");

    const result = await searchWeatherTool.execute("call-7", { city: "杭州" });

    expect((result.content[0] as { type: "text"; text: string }).text).toContain(
      "天气查询遇到问题",
    );
    expect(result.details.error).toBeDefined();
  });
});
