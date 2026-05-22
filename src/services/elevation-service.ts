/**
 * 高程查询服务 — 基于 Open Topo Data（免费，无需 API Key）
 *
 * 为缺少海拔数据的 waypoint 批量查询真实海拔，
 * 用于自动计算路线风险评估。
 *
 * API: https://api.opentopodata.org/v1/srtm90m
 * 数据源: SRTM 90m 分辨率（全球覆盖，除极地外）
 * 限制: 每次最多 100 个坐标点
 */

import type { Location } from "../types/trip.js";
import { LRUCache } from "lru-cache";
import { fetchWithTimeout } from "./http-client.js";
import { getLogger } from "./logger.js";

// ─── 配置 ─────────────────────────────────────────────────

const OPENTOPODATA_BASE = "https://api.opentopodata.org/v1/srtm90m";
const BATCH_SIZE = 90; // 留余量，避免正好 100 时 URL 过长
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 天（地形数据基本不变）

// ─── 缓存 ─────────────────────────────────────────────────

interface CacheEntry {
  elevation: number;
}

const elevationCache = new LRUCache<string, CacheEntry>({
  max: 5000, // 海拔数据变化小，可以缓存更多
  ttl: 7 * 24 * 60 * 60 * 1000, // 7 天（地形数据基本不变）
  allowStale: false,
  ttlAutopurge: true,
});

function cacheKey(lat: number, lon: number): string {
  // 保留 4 位小数（约 11m 精度），减少缓存碎片
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

/** 清除缓存（测试用） */
export function clearElevationCache(): void {
  elevationCache.clear();
}

// ─── API 调用 ─────────────────────────────────────────────

interface ElevationResult {
  location: Location;
  elevation: number;
}

/**
 * 批量查询海拔
 *
 * @param locations 坐标列表
 * @returns 每个坐标对应的海拔（米），查询失败返回 0
 */
export async function queryElevations(locations: Location[]): Promise<ElevationResult[]> {
  if (locations.length === 0) return [];

  const results: ElevationResult[] = [];
  const pendingIndices: number[] = [];
  const pendingLocations: Location[] = [];

  // 1. 先从缓存命中
  for (let i = 0; i < locations.length; i++) {
    const loc = locations[i];
    const cached = elevationCache.get(cacheKey(loc.latitude, loc.longitude));
    if (cached !== undefined) {
      results[i] = { location: loc, elevation: cached.elevation };
    } else {
      pendingIndices.push(i);
      pendingLocations.push(loc);
    }
  }

  if (pendingLocations.length === 0) {
    return results;
  }

  // 2. 分批调用 API
  for (let i = 0; i < pendingLocations.length; i += BATCH_SIZE) {
    const batch = pendingLocations.slice(i, i + BATCH_SIZE);
    const batchIndices = pendingIndices.slice(i, i + BATCH_SIZE);

    try {
      const locationsParam = batch.map((l) => `${l.latitude},${l.longitude}`).join("|");
      const url = `${OPENTOPODATA_BASE}?locations=${encodeURIComponent(locationsParam)}`;

      const response = await fetchWithTimeout(url, {
        timeout: 10000,
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        getLogger()
          .child({ component: "elevation-service" })
          .warn("API 请求失败", { status: response.status, statusText: response.statusText });
        // 填充默认值 0
        for (let j = 0; j < batch.length; j++) {
          results[batchIndices[j]] = { location: batch[j], elevation: 0 };
        }
        continue;
      }

      const data = (await response.json()) as {
        results?: Array<{ location: { lat: number; lng: number }; elevation: number }>;
      };

      if (data.results && data.results.length >= batch.length) {
        for (let j = 0; j < batch.length; j++) {
          const elevation = data.results[j].elevation;
          const loc = batch[j];
          elevationCache.set(cacheKey(loc.latitude, loc.longitude), { elevation });
          results[batchIndices[j]] = { location: loc, elevation };
        }
      } else {
        // 响应格式异常，填充默认值
        for (let j = 0; j < batch.length; j++) {
          results[batchIndices[j]] = { location: batch[j], elevation: 0 };
        }
      }
    } catch (err) {
      getLogger()
        .child({ component: "elevation-service" })
        .warn("查询海拔失败", { error: err instanceof Error ? err.message : err });
      for (let j = 0; j < batch.length; j++) {
        results[batchIndices[j]] = { location: batch[j], elevation: 0 };
      }
    }
  }

  return results;
}

/**
 * 为路线途经点批量填充海拔数据
 *
 * @param waypoints 途经点列表
 * @returns 海拔数据填充后的新列表（原列表不变）
 */
export async function fillWaypointElevations<T extends { location: Location; elevation?: number }>(
  waypoints: T[],
): Promise<T[]> {
  const needElevation = waypoints
    .map((wp, index) => ({ index, location: wp.location }))
    .filter((item) => !waypoints[item.index].elevation);

  if (needElevation.length === 0) {
    return waypoints;
  }

  const elevations = await queryElevations(needElevation.map((n) => n.location));

  const result = [...waypoints];
  for (let i = 0; i < needElevation.length; i++) {
    const idx = needElevation[i].index;
    result[idx] = { ...result[idx], elevation: elevations[i]?.elevation ?? 0 };
  }
  return result;
}
