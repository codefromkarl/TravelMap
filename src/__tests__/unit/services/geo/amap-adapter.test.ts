/**
 * AmapGeocodeProvider 单元测试
 */

import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { AmapGeocodeProvider } from "../../../../services/geo/amap-adapter.js";
import { server } from "../../../mocks/server.js";

describe("AmapGeocodeProvider", () => {
  describe("isAvailable", () => {
    it("有 API Key 时返回 true", () => {
      const provider = new AmapGeocodeProvider("test-key");
      expect(provider.isAvailable()).toBe(true);
    });

    it("无 API Key 时返回 false", () => {
      const provider = new AmapGeocodeProvider("");
      expect(provider.isAvailable()).toBe(false);
    });
  });

  describe("geocode", () => {
    it("成功返回 GCJ-02 坐标", async () => {
      const provider = new AmapGeocodeProvider("test-key");
      const result = await provider.geocode("天安门", "北京");

      expect(result.engine).toBe("amap");
      expect(result.location.latitude).toBeTypeOf("number");
      expect(result.location.longitude).toBeTypeOf("number");
      expect(result.location.latitude).toBeGreaterThan(0);
      expect(result.location.longitude).toBeGreaterThan(0);
    });

    it("API 返回错误时抛出异常", async () => {
      server.use(
        http.get("https://restapi.amap.com/v3/geocode/geo", () => {
          return HttpResponse.json({ status: "0", geocodes: [] });
        }),
      );

      const provider = new AmapGeocodeProvider("test-key");
      await expect(provider.geocode("不存在的地址", "北京")).rejects.toThrow("Amap no result");
    });

    it("网络错误时抛出异常", async () => {
      server.use(
        http.get("https://restapi.amap.com/v3/geocode/geo", () => {
          return HttpResponse.error();
        }),
      );

      const provider = new AmapGeocodeProvider("test-key");
      await expect(provider.geocode("天安门", "北京")).rejects.toThrow();
    });
  });
});
