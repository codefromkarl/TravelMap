/**
 * Crawler Provider Adapter — NanmiCoder/MediaCrawler 自部署爬虫
 */

import { fetchWithTimeout } from "../../http-client.js";
import type { UGCReview } from "../../multi-source-service.js";
import type { ProviderContext } from "../types.js";
import { extractTips } from "../utils.js";

/** 允许的 Crawler base URL 域名模式（自部署爬虫） */
const ALLOWED_CRAWLER_HOSTS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  // 自部署域名模式
  /^[a-z0-9-]+\.local$/,
  /^[a-z0-9-]+\.internal$/,
  // Docker/K8s 内部
  /^[a-z0-9-]+\.default\.svc\.cluster\.local$/,
];

/** 校验 Crawler base URL 是否在允许范围内（防止 SSRF） */
function validateCrawlerUrl(baseUrl: string): void {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(`Crawler base URL 格式无效: ${baseUrl}`);
  }
  const host = url.hostname;
  const allowed = ALLOWED_CRAWLER_HOSTS.some((pattern) =>
    typeof pattern === "string" ? pattern === host : pattern.test(host),
  );
  if (!allowed) {
    throw new Error(
      `Crawler base URL 域名不在白名单中: ${host}。` +
        `请使用 localhost / *.local / *.internal 或内部 K8s 域名。`,
    );
  }
}

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
  // SSRF 防护：校验 base URL
  validateCrawlerUrl(ctx.baseUrl);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  // 仅在有 token 时才添加 Authorization header
  if (ctx.token && ctx.token.length > 0) {
    headers.Authorization = `Bearer ${ctx.token}`;
  }

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

  // 2. 轮询等待爬虫完成（最多 CRAWLER_POLL_TIMEOUT）
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
