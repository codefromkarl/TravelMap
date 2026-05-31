/**
 * NominatimGeocodeProvider 单元测试
 */

import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { NominatimGeocodeProvider } from "../../../../services/geo/nominatim-adapter.js";
import { server } from "../../../mocks/server.js";

describe("NominatimGeocodeProvider", () => {
  describe("isAvailable", () => {
    it("总是返回 true（无需 API Key）", () => {
      const provider = new NominatimGeocodeProvider();
      expect(provider.isAvailable()).toBe(true);
    });
  });

  describe("geocode", () => {
    it("成功返回坐标（WGS-84 转 GCJ-02）", async () => {
      const provider = new NominatimGeocodeProvider();
      const result = await provider.geocode("天安门", "北京");

      expect(result.engine).toBe("nominatim");
      expect(result.location.latitude).toBeTypeOf("number");
      expect(result.location.longitude).toBeTypeOf("number");
      // Nominatim 返回 WGS-84，应转换为 GCJ-02
      expect(result.rawLocation).toBeDefined();
      expect(result.rawLocation?.latitude).toBeTypeOf("number");
      expect(result.rawLocation?.longitude).toBeTypeOf("number");
    });

    it("无结果时抛出异常", async () => {
      server.use(
        http.get("https://nominatim.openstreetmap.org/search", () => {
          return HttpResponse.json([]);
        }),
      );

      const provider = new NominatimGeocodeProvider();
      await expect(provider.geocode("不存在的地址", "北京")).rejects.toThrow("Nominatim no result");
    });

    it("网络错误时抛出异常", async () => {
      server.use(
        http.get("https://nominatim.openstreetmap.org/search", () => {
          return HttpResponse.error();
        }),
      );

      const provider = new NominatimGeocodeProvider();
      await expect(provider.geocode("天安门", "北京")).rejects.toThrow();
    });
  });
});
