/**
 * 补给点缓存服务 — 减少重复 API 调用
 *
 * 缓存策略：
 *   - 内存缓存（进程级 Map）：热数据，O(1) 查询
 *   - 缓存 key: `${city}:${supplyPointName}`
 *   - TTL 根据数据质量自动设定
 *
 * 与 supply-validation-service 的关系：
 *   validateSupplyPoint 在调用 API 前先查缓存，验证完成后写缓存。
 */

import type { ValidatedSupplyPoint } from "./supply-validation-service.js";

// ─── 缓存条目 ────────────────────────────────────────────

interface CacheEntry {
  point: ValidatedSupplyPoint;
  cachedAt: number; // timestamp ms
  ttlMs: number;
}

// ─── 内存缓存 ────────────────────────────────────────────

const memoryCache = new Map<string, CacheEntry>();

/** 生成缓存 key */
export function makeCacheKey(city: string, supplyPointName: string): string {
  return `${city}:${supplyPointName}`;
}

/** 根据数据质量计算 TTL */
export function getCacheTtl(point: ValidatedSupplyPoint): number {
  const accuracy = point.locationAccuracy ?? "unknown";
  const priceConf = point.priceConfidence ?? "estimate";

  if (accuracy === "exact" && priceConf === "api") return 180 * 24 * 60 * 60 * 1000; // 180 天
  if (accuracy === "exact") return 90 * 24 * 60 * 60 * 1000; // 90 天
  if (accuracy === "approximate") return 60 * 24 * 60 * 60 * 1000; // 60 天
  return 30 * 24 * 60 * 60 * 1000; // 30 天
}

// ─── 缓存操作 ────────────────────────────────────────────

/** 从缓存读取补给点 */
export function getCachedSupplyPoint(
  city: string,
  supplyPointName: string,
): ValidatedSupplyPoint | null {
  const key = makeCacheKey(city, supplyPointName);
  const entry = memoryCache.get(key);
  if (!entry) return null;

  const now = Date.now();
  if (now - entry.cachedAt > entry.ttlMs) {
    memoryCache.delete(key);
    return null;
  }

  return entry.point;
}

/** 写入缓存 */
export function setCachedSupplyPoint(
  city: string,
  supplyPointName: string,
  point: ValidatedSupplyPoint,
): void {
  const key = makeCacheKey(city, supplyPointName);
  memoryCache.set(key, {
    point,
    cachedAt: Date.now(),
    ttlMs: getCacheTtl(point),
  });
}

/** 批量写入缓存 */
export function setCachedSupplyPoints(city: string, points: ValidatedSupplyPoint[]): void {
  for (const point of points) {
    setCachedSupplyPoint(city, point.name, point);
  }
}

/** 清除过期缓存 */
export function evictExpiredCache(): number {
  const now = Date.now();
  let evicted = 0;
  for (const [key, entry] of memoryCache) {
    if (now - entry.cachedAt > entry.ttlMs) {
      memoryCache.delete(key);
      evicted++;
    }
  }
  return evicted;
}

/** 清除所有缓存（测试用） */
export function clearSupplyCache(): void {
  memoryCache.clear();
}

/** 获取缓存统计 */
export function getCacheStats(): { size: number; hitRate: number; totalRequests: number } {
  return {
    size: memoryCache.size,
    hitRate: cacheMetrics.hits / Math.max(cacheMetrics.total, 1),
    totalRequests: cacheMetrics.total,
  };
}

// ─── 指标 ───────────────────────────────────────────────

const cacheMetrics = { hits: 0, misses: 0, total: 0 };

export function recordCacheHit(): void {
  cacheMetrics.hits++;
  cacheMetrics.total++;
}

export function recordCacheMiss(): void {
  cacheMetrics.misses++;
  cacheMetrics.total++;
}

export function resetCacheMetrics(): void {
  cacheMetrics.hits = 0;
  cacheMetrics.misses = 0;
  cacheMetrics.total = 0;
}
