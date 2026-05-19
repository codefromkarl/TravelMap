/**
 * 天气查询服务 — 单元测试
 *
 * 覆盖优先级链：和风天气 > 高德天气 > OWM > mock
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
      env.unset("QWEATHER_API_KEY");
      env.unset("AMAP_WEB_KEY");

      const { weather, source } = await searchWeather({ city: "北京" });

      expect(source).toBe("mock");
      expect(weather.length).toBeGreaterThan(0);
    });

    it("应按指定天数返回", async () => {
      env.unset("OPENWEATHER_API_KEY");
      env.unset("QWEATHER_API_KEY");
      env.unset("AMAP_WEB_KEY");

      const { weather } = await searchWeather({ city: "北京", days: 3 });

      expect(weather).toHaveLength(3);
    });

    it("默认应返回 7 天预报", async () => {
      env.unset("OPENWEATHER_API_KEY");
      env.unset("QWEATHER_API_KEY");
      env.unset("AMAP_WEB_KEY");

      const { weather } = await searchWeather({ city: "北京" });

      expect(weather).toHaveLength(7);
    });

    it("每天的数据应包含必要字段", async () => {
      env.unset("OPENWEATHER_API_KEY");
      env.unset("QWEATHER_API_KEY");
      env.unset("AMAP_WEB_KEY");

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

  // ─── 和风天气路径 ─────────────────────────────────────────

  describe("和风天气 (QWeather)", () => {
    it("应优先使用和风天气返回 7 天预报", async () => {
      env.set("QWEATHER_API_KEY", "test-qweather-key");
      env.unset("OPENWEATHER_API_KEY");
      env.unset("AMAP_WEB_KEY");

      const { weather, source } = await searchWeather({ city: "北京", days: 3 });

      expect(source).toBe("qweather");
      expect(weather).toHaveLength(3);
      expect(weather[0]).toHaveProperty("date");
      expect(weather[0]).toHaveProperty("dayWeather");
      expect(weather[0]).toHaveProperty("nightWeather");
      expect(weather[0]).toHaveProperty("dayTemp");
      expect(weather[0]).toHaveProperty("nightTemp");
      expect(weather[0]).toHaveProperty("windDirection");
      expect(weather[0]).toHaveProperty("windPower");
    });

    it("和风天气应直接使用中文天气描述", async () => {
      env.set("QWEATHER_API_KEY", "test-qweather-key");
      env.unset("OPENWEATHER_API_KEY");
      env.unset("AMAP_WEB_KEY");

      const { weather, source } = await searchWeather({ city: "北京", days: 1 });

      expect(source).toBe("qweather");
      // mock handler 返回 "晴" 或 "多云" — 原生中文，不翻译
      expect(["晴", "多云"]).toContain(weather[0].dayWeather);
    });

    it("和风天气失败时应降级到高德天气", async () => {
      env.set("QWEATHER_API_KEY", "test-qweather-key");
      env.set("AMAP_WEB_KEY", "test-amap-key");
      env.unset("OPENWEATHER_API_KEY");

      server.use(
        http.get("https://devapi.qweather.com/v7/weather/7d", () => {
          return HttpResponse.json({ code: "500", daily: [] });
        }),
      );

      const { source } = await searchWeather({ city: "北京" });
      expect(source).toBe("amap");
    });

    it("和风天气网络错误时应降级", async () => {
      env.set("QWEATHER_API_KEY", "test-qweather-key");
      env.unset("AMAP_WEB_KEY");
      env.unset("OPENWEATHER_API_KEY");

      server.use(
        http.get("https://devapi.qweather.com/v7/weather/7d", () => {
          return HttpResponse.error();
        }),
      );

      const { source } = await searchWeather({ city: "北京" });
      expect(source).toBe("mock");
    });

    it("和风天气风力等级应包含'级'", async () => {
      env.set("QWEATHER_API_KEY", "test-qweather-key");
      env.unset("OPENWEATHER_API_KEY");
      env.unset("AMAP_WEB_KEY");

      const { weather, source } = await searchWeather({ city: "北京", days: 1 });

      expect(source).toBe("qweather");
      // windScaleDay="3" 应被转为 "3级"
      expect(weather[0].windPower).toContain("级");
    });
  });

  // ─── 高德天气路径 ─────────────────────────────────────────

  describe("高德天气 (Amap)", () => {
    it("应使用高德天气返回预报", async () => {
      env.unset("QWEATHER_API_KEY");
      env.set("AMAP_WEB_KEY", "test-amap-key");
      env.unset("OPENWEATHER_API_KEY");

      const { weather, source } = await searchWeather({ city: "北京", days: 3 });

      expect(source).toBe("amap");
      expect(weather.length).toBeGreaterThan(0);
      expect(weather[0].city).toBe("北京");
    });

    it("高德天气应直接使用中文天气描述", async () => {
      env.unset("QWEATHER_API_KEY");
      env.set("AMAP_WEB_KEY", "test-amap-key");
      env.unset("OPENWEATHER_API_KEY");

      const { weather, source } = await searchWeather({ city: "北京", days: 1 });

      expect(source).toBe("amap");
      expect(["晴", "多云"]).toContain(weather[0].dayWeather);
    });

    it("高德天气失败时应降级到 OWM", async () => {
      env.unset("QWEATHER_API_KEY");
      env.set("AMAP_WEB_KEY", "test-amap-key");
      env.set("OPENWEATHER_API_KEY", "test-owm-key");

      server.use(
        http.get("https://restapi.amap.com/v3/weather/weatherInfo", () => {
          return HttpResponse.json({ status: "0", forecasts: [] });
        }),
      );

      const { source } = await searchWeather({ city: "北京" });
      expect(source).toBe("openweathermap");
    });

    it("高德 geocode 无 adcode 时应降级", async () => {
      env.unset("QWEATHER_API_KEY");
      env.set("AMAP_WEB_KEY", "test-amap-key");
      env.unset("OPENWEATHER_API_KEY");

      server.use(
        http.get("https://restapi.amap.com/v3/geocode/geo", () => {
          return HttpResponse.json({ status: "1", geocodes: [{ adcode: "" }] });
        }),
      );

      const { source } = await searchWeather({ city: "不存在城市" });
      expect(source).toBe("mock");
    });
  });

  // ─── 降级链测试 ──────────────────────────────────────────

  describe("降级链", () => {
    it("和风失败 → 高德失败 → OWM 成功", async () => {
      env.set("QWEATHER_API_KEY", "test-qweather-key");
      env.set("AMAP_WEB_KEY", "test-amap-key");
      env.set("OPENWEATHER_API_KEY", "test-owm-key");

      server.use(
        http.get("https://devapi.qweather.com/v7/weather/7d", () => {
          return HttpResponse.json({ code: "500", daily: [] });
        }),
        http.get("https://restapi.amap.com/v3/weather/weatherInfo", () => {
          return HttpResponse.json({ status: "0", forecasts: [] });
        }),
      );

      const { source } = await searchWeather({ city: "北京" });
      expect(source).toBe("openweathermap");
    });

    it("全部失败 → mock 降级", async () => {
      env.set("QWEATHER_API_KEY", "test-qweather-key");
      env.set("AMAP_WEB_KEY", "test-amap-key");
      env.set("OPENWEATHER_API_KEY", "test-owm-key");

      server.use(
        http.get("https://devapi.qweather.com/v7/weather/7d", () => {
          return HttpResponse.error();
        }),
        http.get("https://restapi.amap.com/v3/weather/weatherInfo", () => {
          return HttpResponse.error();
        }),
        http.get("https://api.openweathermap.org/geo/1.0/direct", () => {
          return HttpResponse.error();
        }),
      );

      const { weather, source } = await searchWeather({ city: "北京" });
      expect(source).toBe("mock");
      expect(weather.length).toBeGreaterThan(0);
      expect(weather[0].city).toBe("北京");
    });
  });

  // ─── OpenWeatherMap 路径（已有，确保不回归）───────────────

  describe("OpenWeatherMap API", () => {
    it("应解析 OWM 响应为 WeatherInfo[]", async () => {
      env.set("OPENWEATHER_API_KEY", "test-key");
      env.unset("QWEATHER_API_KEY");
      env.unset("AMAP_WEB_KEY");

      const { weather, source } = await searchWeather({ city: "北京", days: 1 });

      expect(source).toBe("openweathermap");
      expect(weather.length).toBeGreaterThanOrEqual(1);
      expect(weather[0].city).toBe("北京");
    });

    it("API 报错时应降级到 mock", async () => {
      env.set("OPENWEATHER_API_KEY", "test-key");
      env.unset("QWEATHER_API_KEY");
      env.unset("AMAP_WEB_KEY");

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
      env.unset("QWEATHER_API_KEY");
      env.unset("AMAP_WEB_KEY");

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
      env.unset("QWEATHER_API_KEY");
      env.unset("AMAP_WEB_KEY");

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
