/**
 * Crawler Provider Adapter — NanmiCoder/MediaCrawler 自部署爬虫
 */

import { fetchWithTimeout } from "../../http-client.js";
import type { UGCReview } from "../../multi-source-service.js";
import type { ProviderContext } from "../types.js";
import { extractTips } from "../utils.js";

interface CrawlerStartResponse {
  status?: string;
  message?: string;
  detail?: string;
}

interface CrawlerDataFile {
  name: string;
  path: string;
  size: number;
  modified_at: number;
  record_count?: number;
  type?: string;
}

interface CrawlerDataResponse {
  files?: CrawlerDataFile[];
}

interface CrawlerFileContent {
  data?: Array<Record<string, unknown>>;
  total?: number;
}

const CRAWLER_POLL_INTERVAL = 3_000;
const CRAWLER_POLL_TIMEOUT = 120_000;

export async function fetchCrawler(keyword: string, ctx: ProviderContext): Promise<UGCReview[]> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (ctx.token) headers.Authorization = `Bearer ${ctx.token}`;

  // 1. 启动爬虫任务
  const startRes = await fetchWithTimeout(`${ctx.baseUrl}/api/crawler/start`, {
    method: "POST",
    timeout: 15_000,
    headers,
    body: JSON.stringify({
      platform: "xhs",
      login_type: "cookie",
      crawler_type: "search",
      keywords: keyword,
      save_option: "json",
      enable_comments: false,
      headless: true,
    }),
  });

  if (!startRes.ok) {
    if (startRes.status === 400) {
      throw new Error("Crawler busy: already running");
    }
    throw new Error(`Crawler start error: ${startRes.status}`);
  }

  const startBody = (await startRes.json()) as CrawlerStartResponse;
  if (startBody.status !== "ok") {
    throw new Error(`Crawler start failed: ${startBody.detail ?? startBody.message}`);
  }

  // 2. 轮询等待爬虫完成
  const startTime = Date.now();
  while (Date.now() - startTime < CRAWLER_POLL_TIMEOUT) {
    await new Promise((r) => setTimeout(r, CRAWLER_POLL_INTERVAL));

    const statusRes = await fetchWithTimeout(`${ctx.baseUrl}/api/crawler/status`, {
      timeout: 5_000,
      headers,
    });
    if (!statusRes.ok) continue;

    const statusBody = (await statusRes.json()) as { status?: string };
    if (statusBody.status === "idle" || statusBody.status === "error") break;
  }

  // 3. 获取爬取结果
  const filesRes = await fetchWithTimeout(
    `${ctx.baseUrl}/api/data/files?platform=xhs&file_type=json`,
    { timeout: 10_000, headers },
  );
  if (!filesRes.ok) throw new Error(`Crawler data files error: ${filesRes.status}`);

  const filesBody = (await filesRes.json()) as CrawlerDataResponse;
  const files = filesBody.files ?? [];
  if (files.length === 0) return [];

  const latest = files.sort((a, b) => b.modified_at - a.modified_at)[0];

  // 4. 读取文件内容
  const contentRes = await fetchWithTimeout(
    `${ctx.baseUrl}/api/data/files/${latest.path}?preview=true&limit=10`,
    { timeout: 10_000, headers },
  );
  if (!contentRes.ok) throw new Error(`Crawler read file error: ${contentRes.status}`);

  const contentBody = (await contentRes.json()) as CrawlerFileContent;
  const items = contentBody.data ?? [];

  // 5. 转换为 UGCReview
  return items
    .filter((item) => {
      const title = String(item.title ?? item.note_id ?? "");
      return title.length > 0;
    })
    .map((item) => ({
      source: "xiaohongshu",
      summary:
        [String(item.title ?? ""), String(item.desc ?? "")].filter(Boolean).join(" — ") ||
        "小红书用户分享",
      rating: undefined,
      tips: extractTips(String(item.desc ?? item.title ?? "")),
      meta: {
        noteId: String(item.note_id ?? ""),
        author: String(item.nickname ?? ""),
        likes: typeof item.liked_count === "number" ? item.liked_count : undefined,
      },
    }));
}
