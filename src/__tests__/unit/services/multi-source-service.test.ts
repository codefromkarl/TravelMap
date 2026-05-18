import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSearchCache,
  searchAttractionsMultiSource,
} from "../../../services/multi-source-service.js";
import { clearXhsCache } from "../../../services/xhs-service.js";

// Mock xhs-service
vi.mock("../../../services/xhs-service.js", () => ({
  batchSearchXhsNotes: vi.fn(),
  clearXhsCache: vi.fn(),
  searchXhsNotes: vi.fn(),
}));

import { batchSearchXhsNotes } from "../../../services/xhs-service.js";

const mockedBatchSearch = vi.mocked(batchSearchXhsNotes);

describe("searchAttractionsMultiSource", () => {
  beforeEach(() => {
    clearSearchCache();
    clearXhsCache();
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.XHS_API_TOKEN;
    vi.clearAllMocks();
  });

  it("应返回融合后的景点（含 UGC mock 降级）", async () => {
    const result = await searchAttractionsMultiSource({ city: "北京" });
    expect(result.attractions.length).toBeGreaterThan(0);
    expect(result.sources).toContain("mock");
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

  // ─── 真实 XHS API 集成测试 ────────────────────────────────

  describe("小红书 API 集成", () => {
    it("当 XHS_API_TOKEN 存在且 API 返回数据时，应包含 xiaohongshu source", async () => {
      process.env.XHS_API_TOKEN = "test-token";

      mockedBatchSearch.mockResolvedValue(
        new Map([
          [
            "故宫博物院",
            [
              {
                source: "xiaohongshu",
                summary: "故宫真的太美了！红墙拍照绝绝子",
                tips: "建议早上8点去，人少好拍照",
              },
            ],
          ],
        ]),
      );

      const result = await searchAttractionsMultiSource({ city: "北京" });

      expect(mockedBatchSearch).toHaveBeenCalledWith(
        "北京",
        expect.arrayContaining(["故宫博物院"]),
      );

      expect(result.sources).toContain("xiaohongshu");

      const gugong = result.attractions.find((a) => a.nameZh === "故宫博物院");
      expect(gugong).toBeDefined();
      expect(gugong!.ugcReviews.some((r) => r.source === "xiaohongshu")).toBe(true);
      expect(gugong!.sources).toContain("xiaohongshu_api");
    });

    it("当 XHS API 失败时，应降级到 mock UGC", async () => {
      process.env.XHS_API_TOKEN = "test-token";

      mockedBatchSearch.mockRejectedValue(new Error("API timeout"));

      const result = await searchAttractionsMultiSource({ city: "北京" });

      // 降级后仍应有数据
      expect(result.attractions.length).toBeGreaterThan(0);
      // 不应包含 xiaohongshu source（API 失败了）
      expect(result.sources).not.toContain("xiaohongshu");
      // 应有 ugc mock 降级
      expect(result.sources).toContain("ugc");
    });

    it("当 XHS API 返回空数据时，应用 mock 填充", async () => {
      process.env.XHS_API_TOKEN = "test-token";

      mockedBatchSearch.mockResolvedValue(new Map());

      const result = await searchAttractionsMultiSource({ city: "北京" });

      // 所有景点应有 UGC reviews（来自 mock）
      for (const a of result.attractions) {
        expect(a.ugcReviews.length).toBeGreaterThan(0);
      }
    });

    it("UGC review 可包含 meta 信息（noteId, author, likes）", async () => {
      process.env.XHS_API_TOKEN = "test-token";

      mockedBatchSearch.mockResolvedValue(
        new Map([
          [
            "故宫博物院",
            [
              {
                source: "xiaohongshu",
                summary: "故宫攻略分享",
                tips: "提前抢票",
                meta: {
                  noteId: "note_123",
                  author: "旅行达人小王",
                  likes: 1200,
                },
              },
            ],
          ],
        ]),
      );

      const result = await searchAttractionsMultiSource({ city: "北京" });
      const gugong = result.attractions.find((a) => a.nameZh === "故宫博物院");

      const xhsReview = gugong!.ugcReviews.find((r) => r.source === "xiaohongshu");
      expect(xhsReview).toBeDefined();
      expect(xhsReview!.meta?.noteId).toBe("note_123");
      expect(xhsReview!.meta?.author).toBe("旅行达人小王");
      expect(xhsReview!.meta?.likes).toBe(1200);
    });
  });
});
