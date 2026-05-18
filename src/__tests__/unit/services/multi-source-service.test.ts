import { beforeEach, describe, expect, it } from "vitest";
import {
  clearSearchCache,
  searchAttractionsMultiSource,
} from "../../../services/multi-source-service.js";

describe("searchAttractionsMultiSource", () => {
  beforeEach(() => {
    clearSearchCache();
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  it("应返回融合后的景点（含 UGC）", async () => {
    const result = await searchAttractionsMultiSource({ city: "北京" });
    expect(result.attractions.length).toBeGreaterThan(0);
    expect(result.sources).toContain("mock");
    expect(result.sources).toContain("ugc");
    expect(result.fromCache).toBe(false);
  });

  it("每个景点应有 ugcReviews", async () => {
    const result = await searchAttractionsMultiSource({ city: "北京" });
    for (const a of result.attractions) {
      expect(a.ugcReviews).toBeDefined();
      expect(a.ugcReviews.length).toBeGreaterThan(0);
      expect(a.ugcReviews[0]).toHaveProperty("source");
      expect(a.ugcReviews[0]).toHaveProperty("summary");
      expect(a.ugcReviews[0]).toHaveProperty("tips");
    }
  });

  it("第二次相同查询应命中缓存", async () => {
    const r1 = await searchAttractionsMultiSource({ city: "北京" });
    expect(r1.fromCache).toBe(false);

    const r2 = await searchAttractionsMultiSource({ city: "北京" });
    expect(r2.fromCache).toBe(true);
    expect(r2.attractions).toEqual(r1.attractions);
  });

  it("不同参数应独立缓存", async () => {
    const r1 = await searchAttractionsMultiSource({ city: "北京" });
    const r2 = await searchAttractionsMultiSource({ city: "上海" });
    expect(r2.fromCache).toBe(false);
    expect(r2.attractions).not.toEqual(r1.attractions);
  });

  it("融合后景点应有 sources 字段", async () => {
    const result = await searchAttractionsMultiSource({ city: "北京" });
    for (const a of result.attractions) {
      expect(a.sources).toBeDefined();
      expect(a.sources.length).toBeGreaterThan(0);
    }
  });

  it("景点不应重复", async () => {
    const result = await searchAttractionsMultiSource({ city: "北京" });
    const names = result.attractions.map((a) => a.nameZh);
    const uniqueNames = [...new Set(names)];
    expect(names.length).toBe(uniqueNames.length);
  });

  it("未知城市应返回通用 mock", async () => {
    const result = await searchAttractionsMultiSource({ city: "未知城市" });
    expect(result.attractions.length).toBeGreaterThan(0);
    expect(result.sources).toContain("mock");
  });

  it("UGC 评价应有 rating", async () => {
    const result = await searchAttractionsMultiSource({ city: "北京" });
    const hasRatings = result.attractions.some((a) => a.ugcReviews.some((r) => r.rating != null));
    expect(hasRatings).toBe(true);
  });
});
