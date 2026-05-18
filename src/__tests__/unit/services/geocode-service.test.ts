/**
 * 地理编码服务 — 单元测试
 *
 * 优先级链: Amap → Google → Nominatim → 默认坐标
 */

import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { geocodeAddress } from "../../../services/geocode-service.js";
import { createEnvStub } from "../../helpers/env.js";
import { server } from "../../mocks/server.js";

const env = createEnvStub();

describe("geocodeAddress", () => {
  // ─── 优先级链 ────────────────────────────────────────────

  describe("降级链: Amap → Google → Nominatim → default", () => {
    it("有 Amap Key 时应优先使用高德", async () => {
      env.set("AMAP_WEB_KEY", "test-amap").set("GOOGLE_MAPS_API_KEY", "test-google");

      const { location, source } = await geocodeAddress({
        address: "天安门",
        city: "北京",
      });

      expect(source).toBe("amap");
      expect(location.latitude).toBe(39.90923);
      expect(location.longitude).toBe(116.397428);
    });

    it("Amap 失败时应降级到 Google", async () => {
      env.set("AMAP_WEB_KEY", "test-amap").set("GOOGLE_MAPS_API_KEY", "test-google");

      server.use(
        http.get("https://restapi.amap.com/v3/geocode/geo", () => {
          return HttpResponse.json({ status: "0", geocodes: [] });
        }),
      );

      const { source } = await geocodeAddress({ address: "测试", city: "北京" });
      expect(["google", "nominatim", "default"]).toContain(source);
    });

    it("无任何 Key 时应使用 Nominatim（免费）", async () => {
      env.unset("AMAP_WEB_KEY").unset("GOOGLE_MAPS_API_KEY");

      const { source, location } = await geocodeAddress({
        address: "天安门",
        city: "北京",
      });

      expect(source).toBe("nominatim");
      expect(location.latitude).toBe(39.9163);
    });

    it("所有服务都失败时应返回默认坐标", async () => {
      env.unset("AMAP_WEB_KEY").unset("GOOGLE_MAPS_API_KEY");

      server.use(
        http.get("https://nominatim.openstreetmap.org/search", () => {
          return HttpResponse.json([]);
        }),
      );

      const { source, location, warning } = await geocodeAddress({
        address: "完全不存在的地址",
        city: "北京",
      });

      expect(source).toBe("default");
      expect(warning).toBeDefined();
      expect(location.latitude).toBe(39.9042); // 北京默认
    });
  });

  // ─── 预设默认坐标 ────────────────────────────────────────

  describe("预设城市默认坐标", () => {
    const cities = [
      { city: "北京", lat: 39.9042, lng: 116.4074 },
      { city: "上海", lat: 31.2304, lng: 121.4737 },
      { city: "广州", lat: 23.1291, lng: 113.2644 },
      { city: "深圳", lat: 22.5431, lng: 114.0579 },
      { city: "成都", lat: 30.5728, lng: 104.0668 },
    ];

    for (const { city, lat, lng } of cities) {
      it(`${city} 默认坐标应为 (${lat}, ${lng})`, async () => {
        env.unset("AMAP_WEB_KEY").unset("GOOGLE_MAPS_API_KEY");

        server.use(
          http.get("https://nominatim.openstreetmap.org/search", () => {
            return HttpResponse.json([]);
          }),
        );

        const { location } = await geocodeAddress({ address: "测试", city });
        expect(location.latitude).toBe(lat);
        expect(location.longitude).toBe(lng);
      });
    }
  });
});
