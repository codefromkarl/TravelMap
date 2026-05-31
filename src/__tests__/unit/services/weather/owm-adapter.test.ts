/**
 * OpenWeatherMapProvider 单元测试
 */

import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { OpenWeatherMapProvider } from "../../../../services/weather/owm-adapter.js";
import { server } from "../../../mocks/server.js";

describe("OpenWeatherMapProvider", () => {
  describe("isAvailable", () => {
    it("有 API Key 时返回 true", () => {
      const provider = new OpenWeatherMapProvider("test-key");
      expect(provider.isAvailable()).toBe(true);
    });

    it("无 API Key 时返回 false", () => {
      const provider = new OpenWeatherMapProvider("");
      expect(provider.isAvailable()).toBe(false);
    });
  });

  describe("fetchWeather", () => {
    it("成功返回天气数据", async () => {
      const provider = new OpenWeatherMapProvider("test-key");
      const result = await provider.fetchWeather({ city: "北京", days: 3 });

      expect(result.source).toBe("openweathermap");
      expect(result.weather.length).toBeGreaterThan(0);
      expect(result.weather[0]).toHaveProperty("date");
      expect(result.weather[0]).toHaveProperty("dayWeather");
      expect(result.weather[0]).toHaveProperty("nightWeather");
      expect(result.weather[0]).toHaveProperty("dayTemp");
      expect(result.weather[0]).toHaveProperty("nightTemp");
      expect(result.weather[0]).toHaveProperty("windDirection");
      expect(result.weather[0]).toHaveProperty("windPower");
    });

    it("翻译英文天气描述", async () => {
      const provider = new OpenWeatherMapProvider("test-key");
      const result = await provider.fetchWeather({ city: "北京", days: 1 });

      // Mock 返回 "clear sky"，应翻译为 "晴"
      expect(result.weather[0].dayWeather).toBe("晴");
    });

    it("请求指定天数", async () => {
      // 覆盖 handler，返回 2 天数据
      const now = new Date();
      const items: Array<{
        dt: number;
        dt_txt: string;
        main: { temp: number; temp_min: number; temp_max: number };
        weather: Array<{ id: number; main: string; description: string; icon: string }>;
        wind: { speed: number; deg: number };
      }> = [];
      for (let day = 0; day < 2; day++) {
        for (let hour = 0; hour < 8; hour++) {
          const dt = new Date(now);
          dt.setDate(dt.getDate() + day);
          dt.setHours(hour * 3);
          items.push({
            dt: Math.floor(dt.getTime() / 1000),
            dt_txt: dt.toISOString().replace("T", " ").slice(0, 19),
            main: { temp: 22, temp_min: 15, temp_max: 25 },
            weather: [{ id: 800, main: "Clear", description: "clear sky", icon: "01d" }],
            wind: { speed: 3, deg: 180 },
          });
        }
      }

      server.use(
        http.get("https://api.openweathermap.org/data/2.5/forecast", () => {
          return HttpResponse.json({
            cod: "200",
            list: items,
            city: { name: "TestCity", country: "CN" },
          });
        }),
      );

      const provider = new OpenWeatherMapProvider("test-key");
      const result = await provider.fetchWeather({ city: "北京", days: 2 });

      expect(result.weather).toHaveLength(2);
    });

    it("API 返回错误时抛出异常", async () => {
      // 覆盖 geocode handler，让 geocode 成功
      server.use(
        http.get("https://api.openweathermap.org/geo/1.0/direct", () => {
          return HttpResponse.json([{ name: "TestCity", lat: 39.91, lon: 116.39, country: "CN" }]);
        }),
        http.get("https://api.openweathermap.org/data/2.5/forecast", () => {
          return new HttpResponse(null, { status: 500 });
        }),
      );

      const provider = new OpenWeatherMapProvider("test-key");
      await expect(provider.fetchWeather({ city: "北京" })).rejects.toThrow("OWM Forecast error");
    });

    it("网络错误时抛出异常", async () => {
      server.use(
        http.get("https://api.openweathermap.org/data/2.5/forecast", () => {
          return HttpResponse.error();
        }),
      );

      const provider = new OpenWeatherMapProvider("test-key");
      await expect(provider.fetchWeather({ city: "北京" })).rejects.toThrow();
    });
  });
});
