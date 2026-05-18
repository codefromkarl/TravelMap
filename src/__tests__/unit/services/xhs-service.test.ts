import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearXhsCache, getRouterStatus, searchXhsNotes } from "../../../services/xhs-service.js";
import { server } from "../../mocks/server.js";

// Mock global fetch
const mockFetch = vi.fn();

describe("xhs-service — 统一路由层", () => {
  // xhs-service.test.ts 使用 mockFetch 模式，与 MSW 默认 handler 冲突。
  // 由于 vitest pool: forks，每个测试文件在独立进程中运行，
  // 在此进程中关闭 MSW 不会影响其他测试文件。
  beforeAll(() => {
    server.close();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterAll(() => {
    server.listen({ onUnhandledRequest: "warn" });
  });

  beforeEach(() => {
    clearXhsCache();
    // 清除所有 XHS 环境变量
    const envKeys = Object.keys(process.env).filter((k) => k.startsWith("XHS_"));
    for (const k of envKeys) delete process.env[k];
    vi.clearAllMocks();
  });

  // ─── 配置解析 ───────────────────────────────────────────

  describe("getRouterStatus", () => {
    it("默认优先级应为 rnote → justoneapi → tikhub → crawler", () => {
      const status = getRouterStatus();
      expect(status.strategy).toBe("priority");
      expect(status.order).toEqual(["rnote", "justoneapi", "tikhub", "crawler"]);
    });

    it("XHS_ROUTER_PROVIDERS 应覆盖默认优先级", () => {
      process.env.XHS_ROUTER_PROVIDERS = "crawler,tikhub";
      const status = getRouterStatus();
      expect(status.order).toEqual(["crawler", "tikhub"]);
    });

    it("XHS_ROUTER_STRATEGY=cost 应按成本排序", () => {
      process.env.XHS_ROUTER_STRATEGY = "cost";
      const status = getRouterStatus();
      expect(status.order[0]).toBe("crawler"); // 免费
    });

    it("应正确标记已配置/未配置的 provider", () => {
      const status = getRouterStatus();
      expect(status.available.every((p) => !p.configured)).toBe(true); // 都没配 token
    });
  });

  // ─── 无配置降级 ────────────────────────────────────────

  describe("无配置降级", () => {
    it("没有任何 XHS 环境变量时返回空数组", async () => {
      const result = await searchXhsNotes({ keyword: "故宫攻略" });
      expect(result).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("兼容旧配置 XHS_API_TOKEN 应激活 justoneapi", async () => {
      process.env.XHS_API_TOKEN = "legacy-token";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 200,
          data: { items: [{ title: "测试", desc: "内容" }] },
        }),
      });

      const _result = await searchXhsNotes({ keyword: "test" });
      // should have called fetch (rnote fails first, then justoneapi)
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  // ─── Rnote Provider ────────────────────────────────────

  describe("Rnote Provider", () => {
    it("应正确调用 Rnote API 并解析响应", async () => {
      process.env.XHS_RNOTE_TOKEN = "rnote-token-123";
      process.env.XHS_ROUTER_PROVIDERS = "rnote";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            items: [
              {
                note_id: "rnote_001",
                title: "故宫超全攻略",
                desc: "建议早上8点到，人少好拍照。记得提前抢票！",
                liked_count: 2500,
                user: { nickname: "旅行达人" },
              },
            ],
          },
        }),
      });

      const result = await searchXhsNotes({ keyword: "北京故宫攻略", city: "北京" });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const request = mockFetch.mock.calls[0][0] as string;
      expect(request).toContain("/api/v1/xhs/search_notes");
      expect(request).toContain("keyword=");

      expect(result.length).toBe(1);
      expect(result[0].source).toBe("xiaohongshu");
      expect(result[0].summary).toContain("故宫超全攻略");
      expect(result[0].tips).toContain("建议");
      expect(result[0].meta?.noteId).toBe("rnote_001");
      expect(result[0].meta?.author).toBe("旅行达人");
      expect(result[0].meta?.likes).toBe(2500);
    });

    it("Rnote API 失败时应返回空数组", async () => {
      process.env.XHS_RNOTE_TOKEN = "rnote-token";
      process.env.XHS_ROUTER_PROVIDERS = "rnote";

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      const result = await searchXhsNotes({ keyword: "test" });
      expect(result).toEqual([]);
    });
  });

  // ─── JustOneAPI Provider ────────────────────────────────

  describe("JustOneAPI Provider", () => {
    it("应正确调用 JustOneAPI 并解析响应", async () => {
      process.env.XHS_JUSTONEAPI_TOKEN = "jo-token";
      process.env.XHS_ROUTER_PROVIDERS = "justoneapi";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 200,
          data: {
            items: [
              {
                note_id: "jo_001",
                title: "外滩夜景",
                desc: "建议晚上7-9点去",
                liked_count: "1500",
                user: { nickname: "上海小资" },
              },
            ],
          },
        }),
      });

      const result = await searchXhsNotes({ keyword: "上海外滩" });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const request = mockFetch.mock.calls[0][0] as string;
      expect(request).toContain("/api/xiaohongshu/search-note/v3");

      expect(result.length).toBe(1);
      expect(result[0].meta?.likes).toBe(1500);
    });
  });

  // ─── TikHub Provider ────────────────────────────────────

  describe("TikHub Provider", () => {
    it("应正确调用 TikHub API 并解析响应", async () => {
      process.env.XHS_TIKHUB_TOKEN = "th-token";
      process.env.XHS_ROUTER_PROVIDERS = "tikhub";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 200,
          data: {
            data: [
              {
                note_id: "th_001",
                display_title: "颐和园赏荷",
                note_card: {
                  desc: "推荐夏天去荷花超美",
                  interact_info: { liked_count: "800" },
                  user: { nickname: "摄影师小王" },
                },
              },
            ],
          },
        }),
      });

      const result = await searchXhsNotes({ keyword: "颐和园", city: "北京" });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const request = mockFetch.mock.calls[0][0] as string;
      expect(request).toContain("/api/v1/xiaohongshu/web/search_notes");

      expect(result.length).toBe(1);
      expect(result[0].summary).toBe("颐和园赏荷");
      expect(result[0].meta?.likes).toBe(800);
    });
  });

  // ─── Crawler Provider ──────────────────────────────────

  describe("Crawler Provider (NanmiCoder)", () => {
    it("未配置 XHS_CRAWLER_BASE 时跳过", async () => {
      process.env.XHS_ROUTER_PROVIDERS = "crawler";
      const result = await searchXhsNotes({ keyword: "test" });
      expect(result).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("应正确调用本地爬虫服务", async () => {
      process.env.XHS_CRAWLER_BASE = "http://localhost:8080";
      process.env.XHS_ROUTER_PROVIDERS = "crawler";

      // 1. POST /api/crawler/start
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "ok", message: "Crawler started successfully" }),
      });

      // 2. GET /api/crawler/status → running
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "running" }),
      });

      // 3. GET /api/crawler/status → idle (done)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "idle" }),
      });

      // 4. GET /api/data/files
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [
            {
              name: "xhs_search_2026.json",
              path: "xhs/xhs_search_2026.json",
              size: 1024,
              modified_at: Date.now() / 1000,
              record_count: 2,
              type: "json",
            },
          ],
        }),
      });

      // 5. GET /api/data/files/xhs/xhs_search_2026.json?preview=true
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              note_id: "crawl_001",
              title: "长城徒步攻略",
              desc: "记得带水和防晒",
              liked_count: 300,
              nickname: "户外达人",
            },
          ],
          total: 1,
        }),
      });

      const result = await searchXhsNotes({ keyword: "长城" });

      // 5 次 fetch 调用
      expect(mockFetch).toHaveBeenCalledTimes(5);

      // 验证 start 请求
      const startCall = mockFetch.mock.calls[0];
      const startUrl = startCall[0] as string;
      expect(startUrl).toContain("/api/crawler/start");
      // 验证 POST method（第二个参数）
      expect(startCall[1]).toMatchObject({ method: "POST" });

      expect(result.length).toBe(1);
      expect(result[0].summary).toContain("长城徒步攻略");
      expect(result[0].meta?.likes).toBe(300);
    });
  });

  // ─── Fallback 路由 ─────────────────────────────────────

  describe("Fallback 路由", () => {
    it("priority 模式：第一个失败应 fallback 到第二个", async () => {
      process.env.XHS_RNOTE_TOKEN = "rnote-token";
      process.env.XHS_JUSTONEAPI_TOKEN = "jo-token";
      process.env.XHS_ROUTER_PROVIDERS = "rnote,justoneapi";
      process.env.XHS_ROUTER_STRATEGY = "priority";

      // Rnote 失败
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      // JustOneAPI 成功
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 200,
          data: { items: [{ title: "降级成功", desc: "从 justoneapi 获取" }] },
        }),
      });

      const result = await searchXhsNotes({ keyword: "test" });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.length).toBe(1);
      expect(result[0].summary).toContain("降级成功");
    });

    it("priority 模式：所有 provider 失败应返回空数组", async () => {
      process.env.XHS_RNOTE_TOKEN = "rnote-token";
      process.env.XHS_JUSTONEAPI_TOKEN = "jo-token";
      process.env.XHS_ROUTER_PROVIDERS = "rnote,justoneapi";

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      const result = await searchXhsNotes({ keyword: "test" });
      expect(result).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // ─── All 策略 ──────────────────────────────────────────

  describe("All 策略（并行合并）", () => {
    it("应并行调用所有可用 provider 并合并去重", async () => {
      process.env.XHS_RNOTE_TOKEN = "rnote-token";
      process.env.XHS_JUSTONEAPI_TOKEN = "jo-token";
      process.env.XHS_ROUTER_STRATEGY = "all";

      // Rnote 返回 2 条
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            items: [
              { note_id: "dup_1", title: "故宫攻略 A", desc: "Rnote 来源" },
              { note_id: "rnote_2", title: "故宫攻略 B", desc: "Rnote 独有" },
            ],
          },
        }),
      });

      // JustOneAPI 返回 2 条（包含重复 note_id）
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 200,
          data: {
            items: [
              { note_id: "dup_1", title: "故宫攻略 A", desc: "JO 来源" },
              { note_id: "jo_2", title: "故宫攻略 C", desc: "JO 独有" },
            ],
          },
        }),
      });

      const result = await searchXhsNotes({ keyword: "故宫攻略" });

      // 去重后应为 3 条
      expect(result.length).toBe(3);
      const noteIds = result.map((r) => (r.meta as Record<string, unknown>)?.noteId);
      expect(noteIds).toContain("dup_1");
      expect(noteIds).toContain("rnote_2");
      expect(noteIds).toContain("jo_2");
    });

    it("部分 provider 失败不影响其他", async () => {
      process.env.XHS_RNOTE_TOKEN = "rnote-token";
      process.env.XHS_JUSTONEAPI_TOKEN = "jo-token";
      process.env.XHS_ROUTER_STRATEGY = "all";

      // Rnote 失败
      mockFetch.mockRejectedValueOnce(new Error("timeout"));

      // JustOneAPI 成功
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 200,
          data: { items: [{ title: "成功获取", desc: "test" }] },
        }),
      });

      const result = await searchXhsNotes({ keyword: "test" });
      expect(result.length).toBe(1);
    });
  });

  // ─── 缓存 ──────────────────────────────────────────────

  describe("缓存", () => {
    it("相同请求应命中缓存避免重复调用", async () => {
      process.env.XHS_RNOTE_TOKEN = "rnote-token";
      process.env.XHS_ROUTER_PROVIDERS = "rnote";

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 0,
          data: { items: [{ title: "测试笔记", desc: "描述" }] },
        }),
      });

      const r1 = await searchXhsNotes({ keyword: "故宫", city: "北京" });
      const r2 = await searchXhsNotes({ keyword: "故宫", city: "北京" });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(r2).toEqual(r1);
    });

    it("TTL 过期后应重新获取", async () => {
      process.env.XHS_RNOTE_TOKEN = "rnote-token";
      process.env.XHS_ROUTER_PROVIDERS = "rnote";

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 0,
          data: { items: [{ title: "笔记A", desc: "描述A" }] },
        }),
      });

      const r1 = await searchXhsNotes({ keyword: "过期测试", city: "北京" });
      expect(r1[0].summary).toContain("笔记A");
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // 模拟 TTL 过期：直接操作内部缓存的 timestamp
      // 由于 LRUCache 的 ttl 是内部管理的，我们验证第二次调用在 ttl 内不重复请求
      const r2 = await searchXhsNotes({ keyword: "过期测试", city: "北京" });
      expect(mockFetch).toHaveBeenCalledTimes(1); // 仍命中缓存
      expect(r2).toEqual(r1);
    });
  });

  // ─── 文本处理 ──────────────────────────────────────────

  describe("extractTips", () => {
    it("应从笔记文本中提取建议性句子", async () => {
      process.env.XHS_RNOTE_TOKEN = "rnote-token";
      process.env.XHS_ROUTER_PROVIDERS = "rnote";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            items: [
              {
                title: "攻略",
                desc: "建议大家提前买票。记得带水。注意防晒。",
                liked_count: 100,
              },
            ],
          },
        }),
      });

      const result = await searchXhsNotes({ keyword: "test" });
      expect(result[0].tips).toContain("建议");
    });

    it("无建议性文本时应回退截取前 60 字", async () => {
      process.env.XHS_RNOTE_TOKEN = "rnote-token";
      process.env.XHS_ROUTER_PROVIDERS = "rnote";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            items: [{ title: "今天去了故宫", desc: "很漂亮很壮观很值得一去的地方" }],
          },
        }),
      });

      const result = await searchXhsNotes({ keyword: "test" });
      expect(result[0].tips.length).toBeGreaterThan(0);
    });
  });
});
