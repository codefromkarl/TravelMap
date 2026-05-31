/**
 * AmapWeatherProvider 单元测试
 */

import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { AmapWeatherProvider } from "../../../../services/weather/amap-adapter.js";
import { server } from "../../../mocks/server.js";

describe("AmapWeatherProvider", () => {
  describe("isAvailable", () => {
    it("有 API Key 时返回 true", () => {
      const provider = new AmapWeatherProvider("test-key");
      expect(provider.isAvailable()).toBe(true);
    });

    it("无 API Key 时返回 false", () => {
      const provider = new AmapWeatherProvider("");
      expect(provider.isAvailable()).toBe(false);
    });
  });

  describe("fetchWeather", () => {
    it("成功返回 3 天天气数据", async () => {
      const provider = new AmapWeatherProvider("test-key");
      const result = await provider.fetchWeather({ city: "北京", days: 3 });

      expect(result.source).toBe("amap");
      expect(result.weather).toHaveLength(3);
      expect(result.weather[0]).toHaveProperty("date");
      expect(result.weather[0]).toHaveProperty("dayWeather");
      expect(result.weather[0]).toHaveProperty("nightWeather");
      expect(result.weather[0]).toHaveProperty("dayTemp");
      expect(result.weather[0]).toHaveProperty("nightTemp");
      expect(result.weather[0]).toHaveProperty("windDirection");
      expect(result.weather[0]).toHaveProperty("windPower");
    });

    it("请求指定天数（最多 3 天）", async () => {
      // 临时覆盖 MSW handler，返回 3 天数据
      server.use(
        http.get("https://restapi.amap.com/v3/weather/weatherInfo", () => {
          const now = new Date();
          const casts = [];
          for (let i = 0; i < 3; i++) {
            const date = new Date(now);
            date.setDate(date.getDate() + i);
            casts.push({
              date: date.toISOString().split("T")[0],
              dayweather: "晴",
              nightweather: "晴",
              daytemp: "26",
              nighttemp: "16",
              daywind: "东南风",
              nightwind: "东南风",
              daypower: "3",
              nightpower: "2",
              week: "",
            });
          }
          return HttpResponse.json({
            status: "1",
            forecasts: [{ city: "北京市", casts }],
          });
        }),
      );

      const provider = new AmapWeatherProvider("test-key");
      const result = await provider.fetchWeather({ city: "北京", days: 5 });

      // 高德天气最多返回 3 天
      expect(result.weather.length).toBeLessThanOrEqual(3);
    });

    it("API 返回错误时抛出异常", async () => {
      server.use(
        http.get("https://restapi.amap.com/v3/weather/weatherInfo", () => {
          return HttpResponse.json({ status: "0", forecasts: [] });
        }),
      );

      const provider = new AmapWeatherProvider("test-key");
      await expect(provider.fetchWeather({ city: "北京" })).rejects.toThrow();
    });

    it("网络错误时抛出异常", async () => {
      server.use(
        http.get("https://restapi.amap.com/v3/weather/weatherInfo", () => {
          return HttpResponse.error();
        }),
      );

      const provider = new AmapWeatherProvider("test-key");
      await expect(provider.fetchWeather({ city: "北京" })).rejects.toThrow();
    });
  });
});
