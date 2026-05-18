/**
 * 小红书笔记搜索服务 — 统一路由层
 *
 * 聚合 4 个数据源，自动按优先级/成本路由，支持 fallback：
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │                   XhsRouter（统一路由）                    │
 *   │                                                          │
 *   │  Provider 优先级（可配置）：                                │
 *   │  1. rnote      — 小红书专精，$0.008/次，数据最全            │
 *   │  2. justoneapi — 多平台聚合，注册送免费次数                  │
 *   │  3. tikhub     — 多平台，签到获免费额度                     │
 *   │  4. crawler    — NanmiCoder 自部署爬虫，完全免费            │
 *   │                                                          │
 *   │  路由策略：                                               │
 *   │  - 按优先级依次尝试，首个成功即返回                          │
 *   │  - 可通过 XHS_ROUTER_STRATEGY 切换：                       │
 *   │    "priority" (默认) | "cost" | "all"                     │
 *   └──────────────────────────────────────────────────────────┘
 *
 * 环境变量:
 *   XHS_ROUTER_STRATEGY  — 路由策略 priority|cost|all（默认 priority）
 *   XHS_ROUTER_PROVIDERS — 逗号分隔的 provider 列表，覆盖默认优先级
 *                           例: "rnote,justoneapi,tikhub,crawler"
 *
 *   # Rnote（小红书专精）
 *   XHS_RNOTE_TOKEN      — Rnote API Key
 *   XHS_RNOTE_BASE       — 自定义 base URL（可选，默认 https://rnote.dev）
 *
 *   # JustOneAPI（多平台聚合）
 *   XHS_JUSTONEAPI_TOKEN — JustOneAPI Token
 *   XHS_JUSTONEAPI_BASE  — 自定义 base URL（可选）
 *
 *   # TikHub（多平台，签到送额度）
 *   XHS_TIKHUB_TOKEN     — TikHub API Key
 *   XHS_TIKHUB_BASE      — 自定义 base URL（可选）
 *
 *   # Crawler 自部署（NanmiCoder/MediaCrawler）
 *   XHS_CRAWLER_BASE     — 爬虫服务地址（如 http://localhost:8080）
 *   XHS_CRAWLER_TOKEN    — 爬虫服务认证 Token（可选）
 *
 * 兼容旧配置:
 *   XHS_API_TOKEN        — 等同于 XHS_JUSTONEAPI_TOKEN
 *   XHS_API_PROVIDER     — 等同于 XHS_ROUTER_PROVIDERS 单个值
 *   XHS_API_BASE         — 等同于 XHS_JUSTONEAPI_BASE
 */

import { LRUCache } from "lru-cache";
import type { UGCReview } from "./multi-source-service.js";

// ─── 兼容性工具 ───────────────────────────────────────────

/** AbortController + setTimeout 替代 AbortSignal.timeout（兼容 Node < 18.17） */
function createAbortSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

// ─── 类型 ─────────────────────────────────────────────────

type ProviderName = "rnote" | "justoneapi" | "tikhub" | "crawler";

interface ProviderResult {
  provider: ProviderName;
  reviews: UGCReview[];
}

interface ProviderContext {
  token: string;
  baseUrl: string;
}

// ─── 默认配置 ─────────────────────────────────────────────

const DEFAULT_PRIORITY: ProviderName[] = ["rnote", "justoneapi", "tikhub", "crawler"];

const PROVIDER_DEFAULTS: Record<
  ProviderName,
  { baseUrl: string; tokenEnv: string; baseEnv: string }
> = {
  rnote: {
    baseUrl: "https://rnote.dev",
    tokenEnv: "XHS_RNOTE_TOKEN",
    baseEnv: "XHS_RNOTE_BASE",
  },
  justoneapi: {
    baseUrl: "https://api.justoneapi.com",
    tokenEnv: "XHS_JUSTONEAPI_TOKEN",
    baseEnv: "XHS_JUSTONEAPI_BASE",
  },
  tikhub: {
    baseUrl: "https://api.tikhub.io",
    tokenEnv: "XHS_TIKHUB_TOKEN",
    baseEnv: "XHS_TIKHUB_BASE",
  },
  crawler: {
    baseUrl: "http://localhost:8080",
    tokenEnv: "XHS_CRAWLER_TOKEN",
    baseEnv: "XHS_CRAWLER_BASE",
  },
};

// ─── 缓存 ─────────────────────────────────────────────────

interface NoteCacheEntry {
  reviews: UGCReview[];
  provider: ProviderName;
  timestamp: number;
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 分钟
const noteCache = new LRUCache<string, NoteCacheEntry>({
  max: 1000,
  ttl: CACHE_TTL_MS,
});

/** 清除笔记缓存（测试用） */
export function clearXhsCache(): void {
  noteCache.clear();
}

// ─── 路由配置 ─────────────────────────────────────────────

function resolveProviders(): ProviderName[] {
  // 新配置: XHS_ROUTER_PROVIDERS
  const explicit = process.env.XHS_ROUTER_PROVIDERS;
  if (explicit) {
    return explicit.split(",").map((p) => p.trim() as ProviderName);
  }

  // 兼容旧配置: XHS_API_PROVIDER
  const legacyProvider = process.env.XHS_API_PROVIDER;
  if (legacyProvider) {
    return [
      legacyProvider as ProviderName,
      ...DEFAULT_PRIORITY.filter((p) => p !== legacyProvider),
    ];
  }

  return DEFAULT_PRIORITY;
}

function getProviderContext(name: ProviderName): ProviderContext | null {
  const defaults = PROVIDER_DEFAULTS[name];

  let token = process.env[defaults.tokenEnv] ?? "";
  let baseUrl = process.env[defaults.baseEnv] ?? defaults.baseUrl;

  // 兼容旧配置（仅 justoneapi）
  if (name === "justoneapi") {
    token = token || process.env.XHS_API_TOKEN || "";
    baseUrl =
      baseUrl === defaults.baseUrl && process.env.XHS_API_BASE ? process.env.XHS_API_BASE : baseUrl;
  }

  // crawler 不需要 token（可选）
  if (name === "crawler" && !process.env[defaults.baseEnv]) {
    return null; // 未配置 crawler 地址则跳过
  }

  // 其他 provider 需要 token
  if (!token && name !== "crawler") return null;

  return { token, baseUrl };
}

function getStrategy(): "priority" | "cost" | "all" {
  return (process.env.XHS_ROUTER_STRATEGY as "priority" | "cost" | "all") ?? "priority";
}

// ─── API 响应类型 ──────────────────────────────────────────

// JustOneAPI
interface JustOneApiNote {
  note_id?: string;
  title?: string;
  desc?: string;
  liked_count?: string | number;
  user?: { nickname?: string };
}
interface JustOneApiResponse {
  code?: number;
  msg?: string;
  data?: { items?: JustOneApiNote[] };
}

// TikHub
interface TikHubNote {
  note_id?: string;
  display_title?: string;
  note_card?: {
    desc?: string;
    interact_info?: { liked_count?: string };
    user?: { nickname?: string };
  };
}
interface TikHubResponse {
  code?: number;
  msg?: string;
  data?: { data?: TikHubNote[] };
}

// Rnote
interface RnoteNote {
  note_id?: string;
  title?: string;
  desc?: string;
  liked_count?: number;
  user?: { nickname?: string };
  tag_list?: { name?: string }[];
}
interface RnoteResponse {
  code?: number;
  msg?: string;
  data?: {
    items?: RnoteNote[];
    has_more?: boolean;
  };
}

// Crawler (NanmiCoder/MediaCrawler — 异步爬虫，启动任务 + 轮询结果)
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

// ─── Provider 实现 ────────────────────────────────────────

async function fetchRnote(keyword: string, ctx: ProviderContext, page = 1): Promise<UGCReview[]> {
  const url = new URL("/api/v1/xhs/search_notes", ctx.baseUrl);
  url.searchParams.set("keyword", keyword);
  url.searchParams.set("page", String(page));
  url.searchParams.set("sort", "popularity_descending");

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${ctx.token}`,
    },
    signal: createAbortSignal(15_000),
  });

  if (!res.ok) throw new Error(`Rnote error: ${res.status}`);

  const body = (await res.json()) as RnoteResponse;
  if (body.code !== 0 && body.code !== 200) {
    throw new Error(`Rnote code: ${body.code}, msg: ${body.msg}`);
  }

  const items = body.data?.items ?? [];
  return items.map((note) => ({
    source: "xiaohongshu",
    summary: [note.title, note.desc].filter(Boolean).join(" — ") || "小红书用户分享",
    rating: undefined,
    tips: extractTips(note.desc ?? note.title ?? ""),
    meta: {
      noteId: note.note_id,
      author: note.user?.nickname,
      likes: note.liked_count,
    },
  }));
}

async function fetchJustOneApi(
  keyword: string,
  ctx: ProviderContext,
  page = 1,
): Promise<UGCReview[]> {
  const url = new URL("/api/xiaohongshu/search-note/v3", ctx.baseUrl);
  url.searchParams.set("token", ctx.token);
  url.searchParams.set("keyword", keyword);
  url.searchParams.set("page", String(page));
  url.searchParams.set("sort", "popularity_descending");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal: createAbortSignal(15_000),
  });

  if (!res.ok) throw new Error(`JustOneAPI error: ${res.status}`);

  const body = (await res.json()) as JustOneApiResponse;
  if (body.code !== 0 && body.code !== 200) {
    throw new Error(`JustOneAPI code: ${body.code}, msg: ${body.msg}`);
  }

  const items = body.data?.items ?? [];
  return items.map((note) => ({
    source: "xiaohongshu",
    summary: [note.title, note.desc].filter(Boolean).join(" — ") || "小红书用户分享",
    rating: undefined,
    tips: extractTips(note.desc ?? note.title ?? ""),
    meta: {
      noteId: note.note_id,
      author: note.user?.nickname,
      likes:
        typeof note.liked_count === "string"
          ? Number.parseInt(note.liked_count, 10)
          : note.liked_count,
    },
  }));
}

async function fetchTikHub(keyword: string, ctx: ProviderContext, page = 1): Promise<UGCReview[]> {
  const url = new URL("/api/v1/xiaohongshu/web/search_notes", ctx.baseUrl);
  url.searchParams.set("keyword", keyword);
  url.searchParams.set("page", String(page));
  url.searchParams.set("sort", "popularity_descending");

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${ctx.token}`,
    },
    signal: createAbortSignal(15_000),
  });

  if (!res.ok) throw new Error(`TikHub error: ${res.status}`);

  const body = (await res.json()) as TikHubResponse;
  if (body.code !== 200 && body.code !== 0) {
    throw new Error(`TikHub code: ${body.code}, msg: ${body.msg}`);
  }

  const items = body.data?.data ?? [];
  return items.map((note) => ({
    source: "xiaohongshu",
    summary: note.display_title ?? note.note_card?.desc ?? "小红书用户分享",
    rating: undefined,
    tips: extractTips(note.note_card?.desc ?? ""),
    meta: {
      noteId: note.note_id,
      author: note.note_card?.user?.nickname,
      likes: note.note_card?.interact_info?.liked_count
        ? Number.parseInt(note.note_card.interact_info.liked_count, 10)
        : undefined,
    },
  }));
}

const CRAWLER_POLL_INTERVAL = 3_000; // 3 秒轮询
const CRAWLER_POLL_TIMEOUT = 120_000; // 最长等 120 秒

/**
 * 调用 NanmiCoder/MediaCrawler 本地爬虫服务
 *
 * 流程：POST /api/crawler/start → 轮询 status → GET /api/data/files → 读取 JSON 结果
 *
 * 注意：这是异步爬虫，需要等待任务完成。登录态需提前通过 WebUI 扫码建立。
 */
async function fetchCrawler(keyword: string, ctx: ProviderContext): Promise<UGCReview[]> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (ctx.token) headers.Authorization = `Bearer ${ctx.token}`;

  // 1. 启动爬虫任务
  const startRes = await fetch(`${ctx.baseUrl}/api/crawler/start`, {
    method: "POST",
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
    signal: createAbortSignal(15_000),
  });

  if (!startRes.ok) {
    // 如果爬虫已在运行（400），跳过
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

    const statusRes = await fetch(`${ctx.baseUrl}/api/crawler/status`, {
      headers,
      signal: createAbortSignal(5_000),
    });
    if (!statusRes.ok) continue;

    const statusBody = (await statusRes.json()) as { status?: string };
    if (statusBody.status === "idle" || statusBody.status === "error") break;
  }

  // 3. 获取爬取结果
  const filesRes = await fetch(`${ctx.baseUrl}/api/data/files?platform=xhs&file_type=json`, {
    headers,
    signal: createAbortSignal(10_000),
  });
  if (!filesRes.ok) throw new Error(`Crawler data files error: ${filesRes.status}`);

  const filesBody = (await filesRes.json()) as CrawlerDataResponse;
  const files = filesBody.files ?? [];
  if (files.length === 0) return [];

  // 取最新的文件
  const latest = files.sort((a, b) => b.modified_at - a.modified_at)[0];

  // 4. 读取文件内容
  const contentRes = await fetch(
    `${ctx.baseUrl}/api/data/files/${latest.path}?preview=true&limit=10`,
    { headers, signal: createAbortSignal(10_000) },
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

// ─── Provider 注册表 ──────────────────────────────────────

const PROVIDER_FETCH: Record<
  ProviderName,
  (keyword: string, ctx: ProviderContext) => Promise<UGCReview[]>
> = {
  rnote: fetchRnote,
  justoneapi: fetchJustOneApi,
  tikhub: fetchTikHub,
  crawler: fetchCrawler,
};

const PROVIDER_COST_ORDER: ProviderName[] = ["crawler", "rnote", "justoneapi", "tikhub"];

// ─── 文本处理 ─────────────────────────────────────────────

function extractTips(text: string): string {
  if (!text) return "建议提前查询开放时间和门票信息";

  const tipPatterns = [
    /[^\n。！？]*建议[^\n。！？]+[。！？]?/,
    /[^\n。！？]*记得[^\n。！？]+[。！？]?/,
    /[^\n。！？]*一定要[^\n。！？]+[。！？]?/,
    /[^\n。！？]*注意[^\n。！？]+[。！？]?/,
    /[^\n。！？]*避坑[^\n。！？]+[。！？]?/,
    /[^\n。！？]*千万别[^\n。！？]+[。！？]?/,
    /[^\n。！？]*推荐[^\n。！？]+[。！？]?/,
  ];

  const tips: string[] = [];
  for (const pattern of tipPatterns) {
    const matches = text.match(new RegExp(pattern.source, "g"));
    if (matches) {
      tips.push(...matches.map((m) => m.trim()).filter((t) => t.length > 2 && t.length < 80));
    }
  }

  if (tips.length === 0) {
    return text.slice(0, 60).replace(/[\n#]/g, " ").trim();
  }

  return tips.slice(0, 3).join("；");
}

// ─── 路由引擎 ─────────────────────────────────────────────

function resolveOrder(): ProviderName[] {
  const strategy = getStrategy();

  switch (strategy) {
    case "cost":
      // 按成本排序：免费 → 便宜 → 贵
      return PROVIDER_COST_ORDER;
    case "all": {
      // 并行调用所有可用 provider，合并结果
      const available = resolveProviders().filter((p) => getProviderContext(p) !== null);
      return available.length > 0 ? available : DEFAULT_PRIORITY;
    }
    default:
      return resolveProviders();
  }
}

async function routeSearch(keyword: string): Promise<ProviderResult | null> {
  const order = resolveOrder();
  const strategy = getStrategy();

  // ── all 策略：并行调用，合并去重 ──
  if (strategy === "all") {
    const tasks = order
      .map((name) => {
        const ctx = getProviderContext(name);
        if (!ctx) return null;
        return { name, ctx };
      })
      .filter((t): t is { name: ProviderName; ctx: ProviderContext } => t !== null);

    if (tasks.length === 0) return null;

    const results = await Promise.allSettled(
      tasks.map(async ({ name, ctx }) => {
        const reviews = await PROVIDER_FETCH[name](keyword, ctx);
        return { provider: name, reviews };
      }),
    );

    // 合并成功的去重结果
    const allReviews: UGCReview[] = [];
    const seenNoteIds = new Set<string>();

    for (const r of results) {
      if (r.status !== "fulfilled" || !r.value.reviews.length) continue;
      for (const review of r.value.reviews) {
        const noteId = (review.meta as Record<string, unknown>)?.noteId as string | undefined;
        if (noteId && seenNoteIds.has(noteId)) continue;
        if (noteId) seenNoteIds.add(noteId);
        allReviews.push(review);
      }
    }

    if (allReviews.length === 0) {
      // 全部失败
      const failures = results
        .filter((r): r is PromiseRejectedResult => r.status === "rejected")
        .map((r) => r.reason);
      if (failures.length > 0) {
        console.warn("[XHS Router] 所有 provider 均失败:", failures.map(String));
      }
      return null;
    }

    return { provider: "rnote", reviews: allReviews };
  }

  // ── priority / cost 策略：按序 fallback ──
  for (const name of order) {
    const ctx = getProviderContext(name);
    if (!ctx) continue;

    try {
      const reviews = await PROVIDER_FETCH[name](keyword, ctx);
      if (reviews.length > 0) {
        return { provider: name, reviews };
      }
    } catch (err) {
      console.warn(`[XHS Router] ${name} 失败，尝试下一个:`, err);
    }
  }

  return null;
}

// ─── 公开 API ─────────────────────────────────────────────

export interface XhsSearchParams {
  keyword: string;
  city?: string;
}

/**
 * 搜索小红书笔记，返回 UGC 风格评论
 *
 * 路由逻辑：
 * 1. 检查缓存
 * 2. 按策略（priority/cost/all）选择 provider
 * 3. 依次尝试或并行调用
 * 4. 成功后写入缓存
 * 5. 全部失败返回空数组（调用方降级到 mock）
 */
export async function searchXhsNotes(params: XhsSearchParams): Promise<UGCReview[]> {
  // 检查是否有任何可用 provider
  const providers = resolveOrder();
  const hasProvider = providers.some((p) => getProviderContext(p) !== null);
  if (!hasProvider) return [];

  // 检查缓存
  const cacheKey = `${params.city ?? ""}:${params.keyword}`;
  const cached = noteCache.get(cacheKey);
  if (cached) {
    return cached.reviews;
  }

  // 路由搜索
  const result = await routeSearch(params.keyword);
  if (!result || result.reviews.length === 0) return [];

  // 写入缓存
  noteCache.set(cacheKey, {
    reviews: result.reviews,
    provider: result.provider,
    timestamp: Date.now(),
  });

  return result.reviews;
}

/**
 * 批量为景点搜索小红书笔记
 * 并发控制：最多同时 3 个请求
 */
export async function batchSearchXhsNotes(
  city: string,
  attractionNames: string[],
): Promise<Map<string, UGCReview[]>> {
  const providers = resolveOrder();
  const hasProvider = providers.some((p) => getProviderContext(p) !== null);
  if (!hasProvider) return new Map();

  const result = new Map<string, UGCReview[]>();
  const concurrency = 3;
  const queue = [...attractionNames];

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const name = queue.shift();
      if (!name) break;

      const keyword = `${city} ${name} 旅游攻略`;
      const reviews = await searchXhsNotes({ keyword, city });

      // 过滤：只保留内容相关的（标题/摘要包含景点名或城市名）
      const relevant = reviews.filter((r) => {
        const text = `${r.summary} ${r.tips}`;
        return text.includes(name) || text.includes(city);
      });

      result.set(name, relevant.length > 0 ? relevant : reviews.slice(0, 2));
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, attractionNames.length) }, () =>
    worker(),
  );
  await Promise.all(workers);

  return result;
}

// ─── 测试辅助 ─────────────────────────────────────────────

/** 获取当前路由配置（测试用） */
export function getRouterStatus(): {
  strategy: string;
  order: ProviderName[];
  available: { provider: ProviderName; configured: boolean }[];
} {
  const order = resolveOrder();
  return {
    strategy: getStrategy(),
    order,
    available: order.map((p) => ({
      provider: p,
      configured: getProviderContext(p) !== null,
    })),
  };
}
