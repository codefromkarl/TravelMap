/**
 * 天气查询服务 — 单元测试
 */

import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { searchWeather } from "../../../services/weather-service.js";
import { createEnvStub } from "../../helpers/env.js";
import { server } from "../../mocks/server.js";

const env = createEnvStub();

describe("searchWeather", () => {
  // ─── Mock 路径 ──────────────────────────────────────────

  describe("mock fallback (no API key)", () => {
    it("应返回 mock 天气数据", async () => {
      env.unset("OPENWEATHER_API_KEY");

      const { weather, source } = await searchWeather({ city: "北京" });

      expect(source).toBe("mock");
      expect(weather.length).toBeGreaterThan(0);
    });

    it("应按指定天数返回", async () => {
      env.unset("OPENWEATHER_API_KEY");

      const { weather } = await searchWeather({ city: "北京", days: 3 });

      expect(weather).toHaveLength(3);
    });

    it("默认应返回 7 天预报", async () => {
      env.unset("OPENWEATHER_API_KEY");

      const { weather } = await searchWeather({ city: "北京" });

      expect(weather).toHaveLength(7);
    });

    it("每天的数据应包含必要字段", async () => {
      env.unset("OPENWEATHER_API_KEY");

      const { weather } = await searchWeather({ city: "北京", days: 1 });
      const day = weather[0];

      expect(day).toHaveProperty("date");
      expect(day).toHaveProperty("city");
      expect(day).toHaveProperty("dayWeather");
      expect(day).toHaveProperty("nightWeather");
      expect(day).toHaveProperty("dayTemp");
      expect(day).toHaveProperty("nightTemp");
      expect(day.city).toBe("北京");
    });
  });

  // ─── OpenWeatherMap 路径 ─────────────────────────────────

  describe("OpenWeatherMap API", () => {
    it("应解析 OWM 响应为 WeatherInfo[]", async () => {
      env.set("OPENWEATHER_API_KEY", "test-key");

      const { weather, source } = await searchWeather({ city: "北京", days: 1 });

      expect(source).toBe("openweathermap");
      expect(weather.length).toBeGreaterThanOrEqual(1);
      expect(weather[0].city).toBe("北京");
    });

    it("API 报错时应降级到 mock", async () => {
      env.set("OPENWEATHER_API_KEY", "test-key");

      server.use(
        http.get("https://api.openweathermap.org/geo/1.0/direct", () => {
          return HttpResponse.json([]);
        }),
      );

      const { source } = await searchWeather({ city: "不存在的城市" });
      expect(source).toBe("mock");
    });

    it("OWM 5xx 时应降级到 mock", async () => {
      env.set("OPENWEATHER_API_KEY", "test-key");

      server.use(
        http.get("https://api.openweathermap.org/geo/1.0/direct", () => {
          return new HttpResponse(null, { status: 502 });
        }),
      );

      const { weather, source } = await searchWeather({ city: "北京", days: 1 });
      expect(source).toBe("mock");
      expect(weather.length).toBeGreaterThanOrEqual(1);
      expect(weather[0].city).toBe("北京");
    });

    it("网络超时时应降级到 mock", async () => {
      env.set("OPENWEATHER_API_KEY", "test-key");

      server.use(
        http.get("https://api.openweathermap.org/geo/1.0/direct", () => {
          return HttpResponse.error();
        }),
      );

      const { weather, source } = await searchWeather({ city: "北京", days: 1 });
      expect(source).toBe("mock");
      expect(weather.length).toBeGreaterThanOrEqual(1);
    });
  });
});
