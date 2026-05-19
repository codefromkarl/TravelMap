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
import { config } from "./config.js";
import type { UGCReview } from "./multi-source-service.js";
import { PROVIDER_ADAPTERS } from "./xhs/adapters/index.js";
import type { ProviderContext, ProviderName, ProviderResult } from "./xhs/types.js";

// ─── 缓存 ─────────────────────────────────────────────────

interface CacheEntry {
  reviews: UGCReview[];
  provider: ProviderName;
  timestamp: number;
}

const noteCache = new LRUCache<string, CacheEntry>({
  max: 1000,
  ttl: 1000 * 60 * 30, // 30 min
});

// ─── 配置解析 ─────────────────────────────────────────────

type RouterStrategy = "priority" | "cost" | "all";

const DEFAULT_PRIORITY: ProviderName[] = ["rnote", "justoneapi", "tikhub", "crawler"];

function getStrategy(): RouterStrategy {
  const s = config.xhsRouterStrategy?.toLowerCase();
  if (s === "cost" || s === "all") return s;
  return "priority";
}

function resolveProviders(): ProviderName[] {
  const env = config.xhsRouterProviders ?? config.xhsApiProvider;
  if (!env) return DEFAULT_PRIORITY;
  return env
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter((p): p is ProviderName => ["rnote", "justoneapi", "tikhub", "crawler"].includes(p));
}

function getProviderContext(name: ProviderName): ProviderContext | null {
  switch (name) {
    case "rnote": {
      const token = config.xhsRnoteToken;
      const base = config.xhsRnoteBase ?? "https://rnote.dev";
      return token ? { token, baseUrl: base } : null;
    }
    case "justoneapi": {
      const token = config.xhsJustoneapiToken ?? config.xhsApiToken;
      const base = config.xhsJustoneapiBase ?? config.xhsApiBase ?? "https://api.justoneapi.com";
      return token ? { token, baseUrl: base } : null;
    }
    case "tikhub": {
      const token = config.xhsTikhubToken;
      const base = config.xhsTikhubBase ?? "https://api.tikhub.io";
      return token ? { token, baseUrl: base } : null;
    }
    case "crawler": {
      const base = config.xhsCrawlerBase;
      const token = config.xhsCrawlerToken ?? "";
      return base ? { token, baseUrl: base } : null;
    }
    default:
      return null;
  }
}

// ─── 路由引擎 ─────────────────────────────────────────────

const PROVIDER_COST_ORDER: ProviderName[] = ["crawler", "rnote", "justoneapi", "tikhub"];

function resolveOrder(): ProviderName[] {
  const strategy = getStrategy();

  switch (strategy) {
    case "cost":
      return PROVIDER_COST_ORDER;
    case "all": {
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
        const reviews = await PROVIDER_ADAPTERS[name](keyword, ctx);
        return { provider: name, reviews };
      }),
    );

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
      const reviews = await PROVIDER_ADAPTERS[name](keyword, ctx);
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

export async function searchXhsNotes(params: XhsSearchParams): Promise<UGCReview[]> {
  const providers = resolveOrder();
  const hasProvider = providers.some((p) => getProviderContext(p) !== null);
  if (!hasProvider) return [];

  const cacheKey = `${params.city ?? ""}:${params.keyword}`;
  const cached = noteCache.get(cacheKey);
  if (cached) {
    return cached.reviews;
  }

  const result = await routeSearch(params.keyword);
  if (!result || result.reviews.length === 0) return [];

  noteCache.set(cacheKey, {
    reviews: result.reviews,
    provider: result.provider,
    timestamp: Date.now(),
  });

  return result.reviews;
}

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

// ─── 缓存管理（测试用）────────────────────────────────────

export function clearXhsCache(): void {
  noteCache.clear();
}

// ─── 测试辅助 ─────────────────────────────────────────────

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
