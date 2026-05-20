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

  describe("免费数据源降级 (no API key)", () => {
    it("应返回北京的景点数据（免费源或 mock）", async () => {
      env.unset("GOOGLE_MAPS_API_KEY");

      const { attractions, source } = await searchAttractions({ city: "北京" });

      // 免费数据源（去哪儿/OTM/Wikivoyage/Wikipedia）始终可用
      // source 映射规则: free_* → "google_places"
      expect(["mock", "google_places"]).toContain(source);
      expect(attractions.length).toBeGreaterThan(0);
      expect(attractions.some((a) => a.nameZh.includes("故宫") || a.nameZh.includes("北京"))).toBe(
        true,
      );
    });

    it("应返回上海的景点数据", async () => {
      env.unset("GOOGLE_MAPS_API_KEY");

      const { attractions, source } = await searchAttractions({ city: "上海" });

      expect(["mock", "google_places"]).toContain(source);
      expect(attractions.length).toBeGreaterThan(0);
      // 免费源返回的景点名称可能不直接包含“上海”，只要有数据即可
    });

    it("未知城市应返回通用数据", async () => {
      env.unset("GOOGLE_MAPS_API_KEY");

      const { attractions, source } = await searchAttractions({ city: "某未知城市" });

      expect(["mock", "google_places"]).toContain(source);
      expect(attractions.length).toBeGreaterThan(0);
    });
  });

  // ─── Google Places API 路径 ─────────────────────────────

  describe("Google Places API", () => {
    it("应解析 Google Places 响应", async () => {
      env.set("GOOGLE_MAPS_API_KEY", "test-key");

      const { attractions, source } = await searchAttractions({ city: "北京" });

      expect(source).toBe("google_places");
      expect(attractions.length).toBeGreaterThanOrEqual(1);
      // MSW mock 返回 "测试景点"，免费源也返回数据
      expect(attractions.some((a) => a.name === "测试景点")).toBe(true);
    });

    it("应将 types 映射为中文分类", async () => {
      env.set("GOOGLE_MAPS_API_KEY", "test-key");

      const { attractions } = await searchAttractions({ city: "北京" });
      // MSW mock 返回的测试景点 types=["tourist_attraction"] 映射为 "景点"
      // 但免费源合并后 category 可能被覆盖（如 "博物馆"）
      const testAttraction = attractions.find((a) => a.name === "测试景点");
      expect(testAttraction).toBeDefined();
      expect([
        "景点",
        "博物馆",
        "公园",
        "宗教场所",
        "主题乐园",
        "艺术画廊",
        "自然风光",
        "购物",
      ]).toContain(testAttraction!.category);
    });

    it("API 报错时应降级到免费源或 mock", async () => {
      env.set("GOOGLE_MAPS_API_KEY", "test-key");

      server.use(
        http.get("https://maps.googleapis.com/maps/api/place/textsearch/json", () => {
          return HttpResponse.json({ status: "REQUEST_DENIED" });
        }),
      );

      const { source, attractions } = await searchAttractions({ city: "北京" });
      expect(["mock", "google_places"]).toContain(source);
      expect(attractions.length).toBeGreaterThan(0);
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
