import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSearchCache,
  searchAttractionsMultiSource,
} from "../../../services/multi-source-service.js";
import { clearXhsCache } from "../../../services/xhs-service.js";
import { server } from "../../mocks/server.js";

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

  it("应返回融合后的景点（含免费数据源或 mock 降级）", async () => {
    const result = await searchAttractionsMultiSource({ city: "北京" });
    expect(result.attractions.length).toBeGreaterThan(0);
    // 免费数据源（去哪儿/OTM/Wikivoyage/Wikipedia）始终可用，mock 仅在无任何源时触发
    expect(result.sources.length).toBeGreaterThan(0);
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

  it("未知城市应返回通用 mock 或免费源数据", async () => {
    const result = await searchAttractionsMultiSource({ city: "未知城市" });
    expect(result.attractions.length).toBeGreaterThan(0);
    // 免费源可能仍能返回通用数据，或降级到 mock
    expect(result.sources.length).toBeGreaterThan(0);
  });

  it("UGC 评价应有 rating", async () => {
    const result = await searchAttractionsMultiSource({ city: "北京" });
    const hasRatings = result.attractions.some((a) => a.ugcReviews.some((r) => r.rating != null));
    expect(hasRatings).toBe(true);
  });

  // ─── Google Places 路径 ──────────────────────────────────

  describe("Google Places API", () => {
    it("有 GOOGLE_MAPS_API_KEY 时应调用 Google Places 并返回结构化数据", async () => {
      process.env.GOOGLE_MAPS_API_KEY = "test-google-key";

      const result = await searchAttractionsMultiSource({ city: "杭州" });

      expect(result.sources).toContain("google_places");
      expect(result.attractions.length).toBeGreaterThan(0);

      const first = result.attractions[0];
      expect(first.name).toBeTruthy();
      expect(first.address).toBeTruthy();
      expect(first.location.latitude).toBeDefined();
      expect(first.location.longitude).toBeDefined();
      expect(first.category).toBeTruthy();
    });

    it("Google Places 5xx 时应降级到免费源或 mock", async () => {
      process.env.GOOGLE_MAPS_API_KEY = "test-google-key";

      server.use(
        http.get("https://maps.googleapis.com/maps/api/place/textsearch/json", () => {
          return new HttpResponse(null, { status: 502 });
        }),
      );

      const result = await searchAttractionsMultiSource({ city: "杭州" });

      expect(result.sources).not.toContain("google_places");
      // 降级到免费源或 mock
      expect(result.sources.length).toBeGreaterThan(0);
      expect(result.attractions.length).toBeGreaterThan(0);
    });

    it("Google Places ZERO_RESULTS 时应降级到免费源或 mock", async () => {
      process.env.GOOGLE_MAPS_API_KEY = "test-google-key";

      server.use(
        http.get("https://maps.googleapis.com/maps/api/place/textsearch/json", () => {
          return HttpResponse.json({ status: "ZERO_RESULTS", results: [] });
        }),
      );

      const result = await searchAttractionsMultiSource({ city: "杭州" });

      // ZERO_RESULTS 时 fetchGooglePlaces 返回空数组，不抛错
      expect(result.sources).toContain("google_places");
      // 免费源或 mock 补充
      expect(result.sources.length).toBeGreaterThan(1);
      expect(result.attractions.length).toBeGreaterThan(0);
    });

    it("不同类型应映射到正确 category", async () => {
      process.env.GOOGLE_MAPS_API_KEY = "test-google-key";

      server.use(
        http.get("https://maps.googleapis.com/maps/api/place/textsearch/json", () => {
          return HttpResponse.json({
            status: "OK",
            results: [
              {
                name: "A博物馆",
                formatted_address: "",
                geometry: { location: { lat: 0, lng: 0 } },
                types: ["museum"],
              },
              {
                name: "B公园",
                formatted_address: "",
                geometry: { location: { lat: 0, lng: 0 } },
                types: ["park"],
              },
              {
                name: "C乐园",
                formatted_address: "",
                geometry: { location: { lat: 0, lng: 0 } },
                types: ["amusement_park"],
              },
              {
                name: "D画廊",
                formatted_address: "",
                geometry: { location: { lat: 0, lng: 0 } },
                types: ["art_gallery"],
              },
              {
                name: "E教堂",
                formatted_address: "",
                geometry: { location: { lat: 0, lng: 0 } },
                types: ["place_of_worship"],
              },
            ],
          });
        }),
      );

      const result = await searchAttractionsMultiSource({ city: "杭州" });

      expect(result.attractions.some((a) => a.category === "博物馆")).toBe(true);
      expect(result.attractions.some((a) => a.category === "公园")).toBe(true);
      expect(result.attractions.some((a) => a.category === "主题乐园")).toBe(true);
      expect(result.attractions.some((a) => a.category === "艺术画廊")).toBe(true);
      expect(result.attractions.some((a) => a.category === "宗教场所")).toBe(true);
    });
  });

  // ─── deduplicate 合并逻辑 ────────────────────────────────

  describe("deduplicate 合并", () => {
    it("同名景点应合并 sources 和 ugcReviews", async () => {
      process.env.GOOGLE_MAPS_API_KEY = "test-google-key";

      server.use(
        http.get("https://maps.googleapis.com/maps/api/place/textsearch/json", () => {
          return HttpResponse.json({
            status: "OK",
            results: [
              {
                name: "西湖",
                formatted_address: "杭州",
                geometry: { location: { lat: 30, lng: 120 } },
                types: ["tourist_attraction"],
                editorial_summary: { overview: "官方描述" },
              },
            ],
          });
        }),
      );

      // 第一次调用（Google Places 返回西湖）
      const _r1 = await searchAttractionsMultiSource({ city: "杭州" });
      // 第二次调用同一城市，但不同参数触发不同搜索（通过 keywords 区分）
      // 由于缓存存在，直接清除缓存再模拟不同结果
      clearSearchCache();

      server.use(
        http.get("https://maps.googleapis.com/maps/api/place/textsearch/json", () => {
          return HttpResponse.json({
            status: "OK",
            results: [
              {
                name: "西湖",
                formatted_address: "杭州西湖区",
                geometry: { location: { lat: 30.1, lng: 120.1 } },
                types: ["natural_feature"],
                editorial_summary: { overview: "另一个描述" },
              },
            ],
          });
        }),
      );

      const r2 = await searchAttractionsMultiSource({ city: "杭州", keywords: "西" });

      // 两个结果中应该只有一条西湖（去重后）
      const xihuCount = r2.attractions.filter((a) => a.nameZh === "西湖").length;
      expect(xihuCount).toBe(1);

      const xihu = r2.attractions.find((a) => a.nameZh === "西湖");
      expect(xihu).toBeDefined();
      // 合并后 sources 应包含 structured
      expect(xihu!.sources).toContain("structured");
    });
  });

  // ─── enrichWithUGC 边界路径 ─────────────────────────────

  describe("enrichWithUGC 边界", () => {
    it("当 Google 和 UGC 均无数据时应添加默认 local_knowledge", async () => {
      process.env.GOOGLE_MAPS_API_KEY = "test-google-key";

      // Google 返回一个景点
      server.use(
        http.get("https://maps.googleapis.com/maps/api/place/textsearch/json", () => {
          return HttpResponse.json({
            status: "OK",
            results: [
              {
                name: "某未知景点",
                formatted_address: "火星",
                geometry: { location: { lat: 0, lng: 0 } },
                types: ["tourist_attraction"],
              },
            ],
          });
        }),
      );

      const result = await searchAttractionsMultiSource({ city: "火星" });

      // 火星不在 mock UGC 数据中，且无 XHS token
      const attraction = result.attractions.find((a) => a.nameZh === "某未知景点");
      expect(attraction).toBeDefined();
      expect(attraction!.ugcReviews.length).toBeGreaterThan(0);
      expect(attraction!.ugcReviews.some((r) => r.source === "local_knowledge")).toBe(true);
    });
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
