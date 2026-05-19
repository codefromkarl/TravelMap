/**
 * 小红书笔记搜索服务 — 统一路由层
 *
 * 聚合 4 个数据源，自动按优先级/成本路由，支持 fallback。
 * 路由逻辑已提取到 xhs/router.ts（XhsRouter 类）。
 * 批量搜索使用 utils/concurrent.ts（concurrentMap）。
 *
 * 环境变量见 xhs/router.ts 和 config.ts。
 */

import { LRUCache } from "lru-cache";
import { concurrentMap } from "../utils/concurrent.js";
import type { UGCReview } from "./multi-source-service.js";
import { XhsRouter } from "./xhs/router.js";
import type { ProviderName } from "./xhs/types.js";

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

// ─── 路由器实例 ──────────────────────────────────────────

const router = new XhsRouter();

// ─── 公开 API ─────────────────────────────────────────────

export interface XhsSearchParams {
  keyword: string;
  city?: string;
}

export async function searchXhsNotes(params: XhsSearchParams): Promise<UGCReview[]> {
  router.refresh();
  if (!router.hasAvailableProvider()) return [];

  const cacheKey = `${params.city ?? ""}:${params.keyword}`;
  const cached = noteCache.get(cacheKey);
  if (cached) {
    return cached.reviews;
  }

  const result = await router.routeSearch(params.keyword);
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
  router.refresh();
  if (!router.hasAvailableProvider()) return new Map();

  const results = await concurrentMap(
    attractionNames,
    async (name) => {
      const keyword = `${city} ${name} 旅游攻略`;
      const reviews = await searchXhsNotes({ keyword, city });

      const relevant = reviews.filter((r) => {
        const text = `${r.summary} ${r.tips}`;
        return text.includes(name) || text.includes(city);
      });

      return { name, reviews: relevant.length > 0 ? relevant : reviews.slice(0, 2) };
    },
    3, // concurrency
  );

  const resultMap = new Map<string, UGCReview[]>();
  for (const { name, reviews } of results) {
    resultMap.set(name, reviews);
  }

  return resultMap;
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
  router.refresh();
  return {
    strategy: router.getStrategy(),
    order: router.getProviderOrder(),
    available: router.getProviderStatus(),
  };
}
