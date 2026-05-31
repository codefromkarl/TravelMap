/**
 * GoogleGeocodeProvider 单元测试
 */

import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { GoogleGeocodeProvider } from "../../../../services/geo/google-adapter.js";
import { server } from "../../../mocks/server.js";

describe("GoogleGeocodeProvider", () => {
  describe("isAvailable", () => {
    it("有 API Key 时返回 true", () => {
      const provider = new GoogleGeocodeProvider({ key: "test-key" });
      expect(provider.isAvailable()).toBe(true);
    });

    it("无 API Key 时返回 false", () => {
      const provider = new GoogleGeocodeProvider({ key: "" });
      expect(provider.isAvailable()).toBe(false);
    });
  });

  describe("geocode", () => {
    it("成功返回坐标（WGS-84 转 GCJ-02）", async () => {
      const provider = new GoogleGeocodeProvider({ key: "test-key" });
      const result = await provider.geocode("天安门", "北京");

      expect(result.engine).toBe("google");
      expect(result.location.latitude).toBeTypeOf("number");
      expect(result.location.longitude).toBeTypeOf("number");
      // Google 返回 WGS-84，应转换为 GCJ-02
      expect(result.rawLocation).toBeDefined();
      expect(result.rawLocation?.latitude).toBeTypeOf("number");
      expect(result.rawLocation?.longitude).toBeTypeOf("number");
    });

    it("API 返回错误状态时抛出异常", async () => {
      server.use(
        http.get("https://maps.googleapis.com/maps/api/geocode/json", () => {
          return HttpResponse.json({ status: "ZERO_RESULTS", results: [] });
        }),
      );

      const provider = new GoogleGeocodeProvider({ key: "test-key" });
      await expect(provider.geocode("不存在的地址", "北京")).rejects.toThrow("Google no result");
    });

    it("网络错误时抛出异常", async () => {
      server.use(
        http.get("https://maps.googleapis.com/maps/api/geocode/json", () => {
          return HttpResponse.error();
        }),
      );

      const provider = new GoogleGeocodeProvider({ key: "test-key" });
      await expect(provider.geocode("天安门", "北京")).rejects.toThrow();
    });
  });
});
