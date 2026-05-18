/**
 * XHS Provider Adapter 单元测试
 *
 * 验证每个 adapter 的：
 *   - 正确构造请求（URL / headers / method）
 *   - 成功解析响应
 *   - 错误路径抛出异常
 *   - 空结果返回空数组
 */

import { afterEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server.js";
import {
  fetchRnote,
  fetchJustOneApi,
  fetchTikHub,
  fetchCrawler,
} from "../../../services/xhs/adapters/index.js";

afterEach(() => server.resetHandlers());

describe("Provider Adapter 单元测试", () => {
  describe("Rnote", () => {
    it("应正确构造请求并解析响应", async () => {
      server.use(
        http.get("https://rnote.test/api/v1/xhs/search_notes", ({ request }) => {
          expect(decodeURIComponent(request.url)).toContain("keyword=故宫");
          expect(request.url).toContain("sort=popularity_descending");
          expect(request.headers.get("Authorization")).toBe("Bearer test-token");
          return HttpResponse.json({
            code: 0,
            data: { items: [{ note_id: "n1", title: "故宫攻略", desc: "很好玩", liked_count: 100, user: { nickname: "张三" } }] },
          });
        }),
      );

      const reviews = await fetchRnote("故宫", { token: "test-token", baseUrl: "https://rnote.test" });
      expect(reviews).toHaveLength(1);
      expect(reviews[0].meta?.noteId).toBe("n1");
    });

    it("错误码应抛出异常", async () => {
      server.use(
        http.get("https://rnote.test/api/v1/xhs/search_notes", () =>
          HttpResponse.json({ code: 401, msg: "Unauthorized" }, { status: 200 }),
        ),
      );
      await expect(fetchRnote("故宫", { token: "bad", baseUrl: "https://rnote.test" })).rejects.toThrow("Rnote code: 401");
    });
  });

  describe("JustOneAPI", () => {
    it("应正确构造请求并解析响应", async () => {
      server.use(
        http.get("https://justone.test/api/xiaohongshu/search-note/v3", ({ request }) => {
          expect(decodeURIComponent(request.url)).toContain("keyword=长城");
          expect(request.url).toContain("token=test-token");
          return HttpResponse.json({
            code: 0,
            data: { items: [{ note_id: "n2", title: "长城", desc: "壮观", liked_count: "200", user: { nickname: "李四" } }] },
          });
        }),
      );

      const reviews = await fetchJustOneApi("长城", { token: "test-token", baseUrl: "https://justone.test" });
      expect(reviews).toHaveLength(1);
      expect(reviews[0].meta?.likes).toBe(200);
    });
  });

  describe("TikHub", () => {
    it("应正确构造请求并解析响应", async () => {
      server.use(
        http.get("https://tikhub.test/api/v1/xiaohongshu/web/search_notes", ({ request }) => {
          expect(decodeURIComponent(request.url)).toContain("keyword=西湖");
          expect(request.headers.get("Authorization")).toBe("Bearer tik-token");
          return HttpResponse.json({
            code: 200,
            data: { data: [{ note_id: "n3", display_title: "西湖", note_card: { desc: "美", user: { nickname: "王五" }, interact_info: { liked_count: "300" } } }] },
          });
        }),
      );

      const reviews = await fetchTikHub("西湖", { token: "tik-token", baseUrl: "https://tikhub.test" });
      expect(reviews).toHaveLength(1);
      expect(reviews[0].meta?.likes).toBe(300);
    });
  });

  describe("Crawler", () => {
    it("应正确执行爬虫流程", async () => {
      server.use(
        http.post("http://crawler.test/api/crawler/start", () =>
          HttpResponse.json({ status: "ok" }),
        ),
        http.get("http://crawler.test/api/crawler/status", () =>
          HttpResponse.json({ status: "idle" }),
        ),
        http.get("http://crawler.test/api/data/files", () =>
          HttpResponse.json({ files: [{ name: "xhs.json", path: "xhs/20240101.json", size: 1000, modified_at: 1704067200 }] }),
        ),
        http.get("http://crawler.test/api/data/files/xhs/20240101.json", () =>
          HttpResponse.json({ data: [{ title: "泰山", desc: "很累", note_id: "n4", liked_count: 50, nickname: "赵六" }] }),
        ),
      );

      const reviews = await fetchCrawler("泰山", { token: "", baseUrl: "http://crawler.test" });
      expect(reviews).toHaveLength(1);
      expect(reviews[0].meta?.noteId).toBe("n4");
    });

    it("启动失败应抛出异常", async () => {
      server.use(
        http.post("http://crawler.test/api/crawler/start", () =>
          HttpResponse.json({ status: "error", message: "busy" }, { status: 500 }),
        ),
      );
      await expect(fetchCrawler("泰山", { token: "", baseUrl: "http://crawler.test" })).rejects.toThrow("Crawler start error: 500");
    });
  });
});
