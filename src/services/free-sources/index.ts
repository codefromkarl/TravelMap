/**
 * 免费数据源统一入口 — 编排多源搜索 + 融合
 *
 * 数据流：
 *   searchFreeSources(params)
 *     → 并行调用 Wikivoyage / OpenTripMap / 去哪儿 / Wikipedia
 *     → 聚类去重（名称相似度 + 坐标距离）
 *     → 多源信息融合（置信度优先 + 互补填充）
 *     → 返回融合后的 Attraction[]
 */

import type { Attraction } from "../../types/trip.js";
import { dualGeocode } from "../dual-map-service.js";
import { getLogger } from "../logger.js";
import { fuseAttractions, getFusionStats } from "./fusion-engine.js";
import { searchOpenTripMap } from "./opentripmap-adapter.js";
import { searchQunar } from "./qunar-adapter.js";
import type { FreeSourceAttraction, FreeSourceName, FreeSourceSearchParams } from "./types.js";
import { searchWikipedia } from "./wikipedia-adapter.js";
import { searchWikivoyage } from "./wikivoyage-adapter.js";

export type { FreeSourceName };

/** 搜索结果 */
export interface FreeSourceResult {
  /** 融合后的景点 */
  attractions: Attraction[];
  /** 数据来源 */
  sources: FreeSourceName[];
  /** 融合统计 */
  stats: {
    totalRaw: number;
    fusedCount: number;
    dedupRatio: number;
    bySource: Record<string, number>;
  };
  /** 是否来自缓存 */
  fromCache: boolean;
}

// ─── 缓存 ─────────────────────────────────────────────────

import { LRUCache } from "lru-cache";

interface CacheEntry {
  result: FreeSourceResult;
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 分钟
const searchCache = new LRUCache<string, CacheEntry>({
  max: 200,
  ttl: CACHE_TTL_MS,
});

/** 清除缓存（测试用） */
export function clearFreeSourceCache(): void {
  searchCache.clear();
}

function cacheKey(city: string, preferences?: string[]): string {
  return `free:${city}:${preferences?.join(",") ?? ""}`;
}

// ─── 搜索编排 ─────────────────────────────────────────────

export interface FreeSourceSearchOptions {
  /** 超时时间（毫秒），默认 15s */
  timeout?: number;
  /** 要启用的数据源（默认全部） */
  enabledSources?: FreeSourceName[];
  /** 是否启用缓存（默认 true） */
  useCache?: boolean;
}

/**
 * 并行搜索所有免费数据源并融合
 */
export async function searchFreeSources(
  city: string,
  preferences?: string[],
  options: FreeSourceSearchOptions = {},
): Promise<FreeSourceResult> {
  const { timeout = 15_000, enabledSources, useCache = true } = options;

  // 检查缓存
  const key = cacheKey(city, preferences);
  if (useCache) {
    const cached = searchCache.get(key);
    if (cached) {
      return { ...cached.result, fromCache: true };
    }
  }

  // 获取城市坐标（部分数据源需要）
  let cityLocation: { latitude: number; longitude: number } | undefined;
  try {
    const geo = await dualGeocode(city, city);
    if (geo.location.latitude !== 0) {
      cityLocation = geo.location;
    }
  } catch {
    // geocode 失败不阻塞
  }

  const params: FreeSourceSearchParams = {
    city,
    cityLocation,
    preferences,
  };

  // 并行调用各数据源（带超时）
  const sourceResults = new Map<FreeSourceName, FreeSourceAttraction[]>();

  const adapterMap: Array<[FreeSourceName, () => Promise<FreeSourceAttraction[]>]> = [
    ["wikivoyage", () => searchWikivoyage(params)],
    ["opentripmap", () => searchOpenTripMap(params)],
    ["qunar", () => searchQunar(params)],
    ["wikipedia", () => searchWikipedia(params)],
  ];

  const tasks = adapterMap
    .filter(([name]) => !enabledSources || enabledSources.includes(name))
    .map(async ([name, searchFn]) => {
      try {
        const results = await Promise.race([
          searchFn(),
          new Promise<FreeSourceAttraction[]>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), timeout),
          ),
        ]);
        sourceResults.set(name, results);
      } catch (err) {
        getLogger()
          .child({ component: "free-sources" })
          .warn("数据源失败", { source: name, error: err instanceof Error ? err.message : err });
        sourceResults.set(name, []);
      }
    });

  await Promise.all(tasks);

  // 融合去重
  const fused = fuseAttractions(sourceResults);

  // 统计
  const sources = [...sourceResults.entries()]
    .filter(([, items]) => items.length > 0)
    .map(([name]) => name);

  const stats = getFusionStats(sourceResults, fused.length);

  const result: FreeSourceResult = {
    attractions: fused,
    sources,
    stats,
    fromCache: false,
  };

  // 写入缓存
  if (useCache) {
    searchCache.set(key, { result });
  }

  return result;
}

/**
 * 获取各数据源的健康状态
 */
export async function getFreeSourcesHealth(): Promise<
  Record<FreeSourceName, { healthy: boolean; latencyMs?: number }>
> {
  const checks: Array<[FreeSourceName, () => Promise<boolean>]> = [
    ["wikivoyage", () => import("./wikivoyage-adapter.js").then((m) => m.wikivoyageHealthCheck())],
    ["wikipedia", () => import("./wikipedia-adapter.js").then((m) => m.wikipediaHealthCheck())],
    ["qunar", () => import("./qunar-adapter.js").then((m) => m.qunarHealthCheck())],
    [
      "opentripmap",
      () => import("./opentripmap-adapter.js").then((m) => m.openTripMapHealthCheck()),
    ],
  ];

  const results = await Promise.allSettled(
    checks.map(async ([name, checkFn]) => {
      const start = Date.now();
      const healthy = await checkFn();
      return { name, healthy, latencyMs: Date.now() - start };
    }),
  );

  const health: Record<string, { healthy: boolean; latencyMs?: number }> = {};
  for (const r of results) {
    if (r.status === "fulfilled") {
      health[r.value.name] = { healthy: r.value.healthy, latencyMs: r.value.latencyMs };
    } else {
      health.unknown = { healthy: false };
    }
  }

  return health as Record<FreeSourceName, { healthy: boolean; latencyMs?: number }>;
}
