/**
 * MSW handlers — 小红书/UGC 相关 API
 *
 * Rnote / JustOneAPI / TikHub / Crawler
 */

import { HttpResponse, http } from "msw";

// ─── Rnote (小红书笔记) ───────────────────────────────────
export const rnoteHandler = http.get("https://rnote.dev/api/v1/xhs/search_notes", () => {
  return HttpResponse.json({
    code: 0,
    data: {
      items: [
        {
          note_id: "test-note-1",
          title: "测试笔记",
          desc: "这是一个测试笔记内容",
          liked_count: 100,
          user: { nickname: "测试用户" },
        },
      ],
    },
  });
});

// ─── JustOneAPI (小红书聚合) ──────────────────────────────
export const justoneapiHandler = http.get(
  "https://api.justoneapi.com/api/xiaohongshu/search-note/v3",
  () => {
    return HttpResponse.json({
      code: 200,
      data: {
        items: [
          {
            note_id: "test-note-2",
            title: "JustOneAPI 测试",
            desc: "聚合平台测试内容",
            liked_count: "50",
            user: { nickname: "聚合用户" },
          },
        ],
      },
    });
  },
);

// ─── TikHub (小红书多平台) ────────────────────────────────
export const tikhubHandler = http.get(
  "https://api.tikhub.io/api/v1/xiaohongshu/web/search_notes",
  () => {
    return HttpResponse.json({
      code: 200,
      data: {
        data: [
          {
            note_id: "test-note-3",
            display_title: "TikHub 测试",
            note_card: {
              desc: "多平台测试内容",
              interact_info: { liked_count: "80" },
              user: { nickname: "TikHub 用户" },
            },
          },
        ],
      },
    });
  },
);

// ─── Crawler (NanmiCoder 自部署爬虫) ──────────────────────
export const crawlerStartHandler = http.post("http://localhost:8080/api/crawler/start", () => {
  return HttpResponse.json({ status: "ok", message: "started" });
});

export const crawlerStatusHandler = http.get("http://localhost:8080/api/crawler/status", () => {
  return HttpResponse.json({ status: "idle" });
});

export const crawlerFilesHandler = http.get("http://localhost:8080/api/data/files", () => {
  return HttpResponse.json({
    files: [
      {
        name: "test.json",
        path: "test.json",
        size: 1024,
        modified_at: Date.now(),
        record_count: 1,
        type: "json",
      },
    ],
  });
});

export const crawlerFileContentHandler = http.get(
  "http://localhost:8080/api/data/files/:path",
  () => {
    return HttpResponse.json({
      data: [
        {
          title: "爬虫测试笔记",
          desc: "本地爬虫抓取内容",
          note_id: "crawler-note-1",
          nickname: "爬虫用户",
          liked_count: 10,
        },
      ],
      total: 1,
    });
  },
);
