/**
 * GeoPoiSearcher — 统一的地理 POI 搜索抽象
 *
 * 消除 restaurant-service、hotel-service、transport-service 中重复的：
 *   - LRU 缓存管理
 *   - 国内/国外适配器选择（amap/google/mock）
 *   - 空结果/异常降级到 mock
 *   - warning 消息生成
 *
 * 用法:
 *   const searcher = definePoiSearcher({
 *     name: "restaurant",
 *     cacheTtl: 30 * 60 * 1000,
 *     adapters: {
 *       amap: (params, key) => searchAmapNearby(params, key),
 *       google: (params, key) => searchGoogleNearby(params, key),
 *       mock: (params) => getMockRestaurants(params),
 *     },
 *     cacheKey: (params) => `${params.location.latitude},${params.location.longitude}`,
 *   });
 *
 *   const result = await searcher.search(params, city);
 */

import { LRUCache } from "lru-cache";
import { config } from "./config.js";
import { isDomesticCity } from "./dual-map-service.js";
import { getLogger } from "./logger.js";

// ─── 类型定义 ──────────────────────────────────────────────

export type DataSource = "amap" | "google" | "mock";

export interface PoiSearchResult<T> {
  data: T[];
  source: DataSource;
  warning?: string;
}

export interface PoiAdapter<P, T> {
  /** 搜索函数 */
  search: (params: P, apiKey: string) => Promise<T[]>;
  /** 需要的 API Key（从 config 中读取） */
  apiKey: () => string | undefined;
}

export interface PoiSearcherConfig<P, T> {
  /** 搜索器名称（用于日志） */
  name: string;
  /** 缓存 TTL（毫秒），默认 30 分钟 */
  cacheTtl?: number;
  /** 缓存最大条目数，默认 200 */
  cacheMax?: number;
  /** 适配器配置 */
  adapters: {
    amap: PoiAdapter<P, T>;
    google: PoiAdapter<P, T>;
    mock: (params: P) => T[];
  };
  /** 生成缓存 key */
  cacheKey: (params: P) => string;
  /** 结果数量限制（可选） */
  limit?: (params: P) => number;
}

// ─── 工厂函数 ──────────────────────────────────────────────

/**
 * 创建统一的 POI 搜索器
 *
 * 自动处理：
 * - 缓存（LRU，可配置 TTL 和大小）
 * - 适配器选择（isDomesticCity → amap/google）
 * - 降级（空结果/异常 → mock）
 * - warning 消息
 */
export function definePoiSearcher<P, T>(config: PoiSearcherConfig<P, T>) {
  const logger = getLogger().child({ component: `poi-${config.name}` });
  const cache = new LRUCache<string, T[]>({
    max: config.cacheMax ?? 200,
    ttl: config.cacheTtl ?? 30 * 60 * 1000,
    allowStale: false,
    ttlAutopurge: true,
  });

  /**
   * 执行搜索
   *
   * @param params 搜索参数
   * @param city 城市名（用于国内/国外判断）
   * @returns 搜索结果 + 数据源 + 警告信息
   */
  async function search(params: P, city: string): Promise<PoiSearchResult<T>> {
    const key = config.cacheKey(params);
    const resultLimit = config.limit?.(params);

    // 检查缓存
    const cached = cache.get(key);
    if (cached) {
      return {
        data: resultLimit ? cached.slice(0, resultLimit) : cached,
        source: cached[0] ? detectSource(cached[0]) : "mock",
      };
    }

    const isDomestic = isDomesticCity(city);
    const amapKey = config.adapters.amap.apiKey();
    const googleKey = config.adapters.google.apiKey();

    try {
      let data: T[];
      let source: DataSource;

      if (isDomestic && amapKey) {
        data = await config.adapters.amap.search(params, amapKey);
        source = "amap";
      } else if (googleKey) {
        data = await config.adapters.google.search(params, googleKey);
        source = "google";
      } else {
        // 无 API Key → mock
        const mockData = config.adapters.mock(params);
        return {
          data: resultLimit ? mockData.slice(0, resultLimit) : mockData,
          source: "mock",
          warning: isDomestic
            ? "无高德 API Key，使用 mock 数据"
            : "无 Google Maps API Key，使用 mock 数据",
        };
      }

      // API 返回空结果 → 降级到 mock
      if (data.length === 0) {
        const mockData = config.adapters.mock(params);
        return {
          data: resultLimit ? mockData.slice(0, resultLimit) : mockData,
          source: "mock",
          warning: "API 无结果，使用 mock 数据",
        };
      }

      // 写入缓存
      cache.set(key, data);

      return {
        data: resultLimit ? data.slice(0, resultLimit) : data,
        source,
      };
    } catch (err) {
      logger.warn("API failed, using mock", { error: err instanceof Error ? err.message : err });
      const mockData = config.adapters.mock(params);
      return {
        data: resultLimit ? mockData.slice(0, resultLimit) : mockData,
        source: "mock",
        warning: `API 调用失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /** 清除缓存 */
  function clearCache(): void {
    cache.clear();
  }

  return { search, clearCache };
}

// ─── 内部工具 ──────────────────────────────────────────────

/** 从结果中检测数据源（通过 source 字段） */
function detectSource(item: unknown): DataSource {
  const obj = item as Record<string, unknown>;
  if (obj.source === "amap" || obj.source === "google" || obj.source === "mock") {
    return obj.source;
  }
  return "mock";
}
