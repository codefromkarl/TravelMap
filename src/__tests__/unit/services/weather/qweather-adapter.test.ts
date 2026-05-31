/**
 * QWeatherProvider 单元测试
 */

import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { QWeatherProvider } from "../../../../services/weather/qweather-adapter.js";
import { server } from "../../../mocks/server.js";

describe("QWeatherProvider", () => {
  describe("isAvailable", () => {
    it("有 API Key 时返回 true", () => {
      const provider = new QWeatherProvider({ apiKey: "test-key" });
      expect(provider.isAvailable()).toBe(true);
    });

    it("无 API Key 时返回 false", () => {
      const provider = new QWeatherProvider({ apiKey: "" });
      expect(provider.isAvailable()).toBe(false);
    });
  });

  describe("fetchWeather", () => {
    it("成功返回 7 天天气数据", async () => {
      const provider = new QWeatherProvider({ apiKey: "test-key" });
      const result = await provider.fetchWeather({ city: "北京", days: 7 });

      expect(result.source).toBe("qweather");
      expect(result.weather).toHaveLength(7);
      expect(result.weather[0]).toHaveProperty("date");
      expect(result.weather[0]).toHaveProperty("dayWeather");
      expect(result.weather[0]).toHaveProperty("nightWeather");
      expect(result.weather[0]).toHaveProperty("dayTemp");
      expect(result.weather[0]).toHaveProperty("nightTemp");
      expect(result.weather[0]).toHaveProperty("windDirection");
      expect(result.weather[0]).toHaveProperty("windPower");
    });

    it("请求指定天数", async () => {
      const provider = new QWeatherProvider({ apiKey: "test-key" });
      const result = await provider.fetchWeather({ city: "北京", days: 3 });

      expect(result.weather).toHaveLength(3);
    });

    it("API 返回错误时抛出异常", async () => {
      server.use(
        http.get("https://devapi.qweather.com/v7/weather/7d", () => {
          return HttpResponse.json({ code: "400", daily: [] });
        }),
      );

      const provider = new QWeatherProvider({ apiKey: "test-key" });
      await expect(provider.fetchWeather({ city: "北京" })).rejects.toThrow("QWeather no data");
    });

    it("网络错误时抛出异常", async () => {
      server.use(
        http.get("https://devapi.qweather.com/v7/weather/7d", () => {
          return HttpResponse.error();
        }),
      );

      const provider = new QWeatherProvider({ apiKey: "test-key" });
      await expect(provider.fetchWeather({ city: "北京" })).rejects.toThrow();
    });
  });
});
