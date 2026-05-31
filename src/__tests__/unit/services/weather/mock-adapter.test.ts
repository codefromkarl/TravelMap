/**
 * MockWeatherProvider 单元测试
 */

import { describe, expect, it } from "vitest";
import { MockWeatherProvider } from "../../../../services/weather/mock-adapter.js";

describe("MockWeatherProvider", () => {
  describe("isAvailable", () => {
    it("总是返回 true", () => {
      const provider = new MockWeatherProvider();
      expect(provider.isAvailable()).toBe(true);
    });
  });

  describe("fetchWeather", () => {
    it("返回指定天数的天气数据", async () => {
      const provider = new MockWeatherProvider();
      const result = await provider.fetchWeather({ city: "北京", days: 5 });

      expect(result.source).toBe("mock");
      expect(result.weather).toHaveLength(5);
    });

    it("默认返回 7 天", async () => {
      const provider = new MockWeatherProvider();
      const result = await provider.fetchWeather({ city: "北京" });

      expect(result.weather).toHaveLength(7);
    });

    it("包含所有必要字段", async () => {
      const provider = new MockWeatherProvider();
      const result = await provider.fetchWeather({ city: "北京", days: 1 });

      const weather = result.weather[0];
      expect(weather).toHaveProperty("date");
      expect(weather).toHaveProperty("city", "北京");
      expect(weather).toHaveProperty("dayWeather");
      expect(weather).toHaveProperty("nightWeather");
      expect(weather).toHaveProperty("dayTemp");
      expect(weather).toHaveProperty("nightTemp");
      expect(weather).toHaveProperty("windDirection");
      expect(weather).toHaveProperty("windPower");
    });

    it("温度在合理范围内", async () => {
      const provider = new MockWeatherProvider();
      const result = await provider.fetchWeather({ city: "北京", days: 10 });

      for (const weather of result.weather) {
        expect(weather.dayTemp).toBeGreaterThanOrEqual(20);
        expect(weather.dayTemp).toBeLessThanOrEqual(30);
        expect(weather.nightTemp).toBeLessThan(weather.dayTemp);
      }
    });

    it("日期连续递增", async () => {
      const provider = new MockWeatherProvider();
      const result = await provider.fetchWeather({ city: "北京", days: 5 });

      for (let i = 1; i < result.weather.length; i++) {
        const prevDate = new Date(result.weather[i - 1].date);
        const currDate = new Date(result.weather[i].date);
        const diffDays = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
        expect(diffDays).toBe(1);
      }
    });
  });
});
