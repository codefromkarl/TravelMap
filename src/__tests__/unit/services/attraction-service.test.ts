/**
 * 景点搜索服务 — 单元测试
 *
 * 测试策略：
 *   - Google Places API: 由 MSW mock
 *   - Mock 数据: 无 API Key 时走内存 mock
 *   - 特殊场景: 用 server.use() 覆盖默认 handler
 */

import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { searchAttractions } from "../../../services/attraction-service.js";
import { createEnvStub } from "../../helpers/env.js";
import { server } from "../../mocks/server.js";

const env = createEnvStub();

describe("searchAttractions", () => {
  // ─── Mock 数据路径（无 API Key）─────────────────────────

  describe("mock fallback (no API key)", () => {
    it("应返回北京的 mock 景点数据", async () => {
      env.unset("GOOGLE_MAPS_API_KEY");

      const { attractions, source } = await searchAttractions({ city: "北京" });

      expect(source).toBe("mock");
      expect(attractions.length).toBeGreaterThan(0);
      expect(attractions[0].nameZh).toBe("故宫博物院");
      expect(attractions[0].ticketPrice).toBe(60);
    });

    it("应返回上海的 mock 景点数据", async () => {
      env.unset("GOOGLE_MAPS_API_KEY");

      const { attractions, source } = await searchAttractions({ city: "上海" });

      expect(source).toBe("mock");
      expect(attractions.some((a) => a.nameZh === "外滩")).toBe(true);
    });

    it("未知城市应返回通用 mock", async () => {
      env.unset("GOOGLE_MAPS_API_KEY");

      const { attractions, source } = await searchAttractions({ city: "某未知城市" });

      expect(source).toBe("mock");
      expect(attractions).toHaveLength(1);
      expect(attractions[0].nameZh).toContain("某未知城市");
    });
  });

  // ─── Google Places API 路径 ─────────────────────────────

  describe("Google Places API", () => {
    it("应解析 Google Places 响应", async () => {
      env.set("GOOGLE_MAPS_API_KEY", "test-key");

      const { attractions, source } = await searchAttractions({ city: "北京" });

      expect(source).toBe("google_places");
      expect(attractions).toHaveLength(1);
      expect(attractions[0].name).toBe("测试景点");
      expect(attractions[0].location.latitude).toBe(39.9163);
    });

    it("应将 types 映射为中文分类", async () => {
      env.set("GOOGLE_MAPS_API_KEY", "test-key");

      const { attractions } = await searchAttractions({ city: "北京" });
      expect(attractions[0].category).toBe("景点");
    });

    it("API 报错时应降级到 mock", async () => {
      env.set("GOOGLE_MAPS_API_KEY", "test-key");

      server.use(
        http.get("https://maps.googleapis.com/maps/api/place/textsearch/json", () => {
          return HttpResponse.json({ status: "REQUEST_DENIED" });
        }),
      );

      const { source } = await searchAttractions({ city: "北京" });
      expect(source).toBe("mock");
    });
  });

  // ─── 参数传递 ────────────────────────────────────────────

  describe("参数处理", () => {
    it("应接受偏好和关键词参数", async () => {
      env.unset("GOOGLE_MAPS_API_KEY");

      const result = await searchAttractions({
        city: "北京",
        preferences: ["历史文化", "美食"],
        keywords: "故宫",
      });

      expect(result.attractions).toBeDefined();
    });
  });
});
