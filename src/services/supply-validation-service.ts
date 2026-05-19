/**
 * 补给点验证服务 — 为路线补给点提供坐标校准和价格验证
 *
 * 验证层级：
 *   L1 高德 POI API — 国内精确坐标 + 人均消费 + 营业时间（最准）
 *   L2 Google Places API — 国外精确坐标 + price_level
 *   L3 dualGeocode — 地理编码获取近似坐标
 *   L4 静态估算 — 无网络时保持原值，标记为 unknown
 *
 * 定期刷新：
 *   - 默认 90 天为有效期
 *   - exact + api 价格的数据可延长至 180 天
 *   - unknown/estimate 数据建议 30 天内重新验证
 *
 * 每个补给点输出带 confidence 标签的结果，方便前端展示精度。
 */

import type { LocationAccuracy, PriceConfidence, SupplyPoint } from "../types/route.js";
import type { Location } from "../types/trip.js";
import { concurrentMap } from "../utils/concurrent.js";
import { config as appConfig } from "./config.js";
import { dualGeocode, gcj02ToWgs84, isDomesticCity } from "./dual-map-service.js";
import { fetchWithTimeout } from "./http-client.js";
import {
  getCachedSupplyPoint,
  recordCacheHit,
  recordCacheMiss,
  setCachedSupplyPoint,
} from "./supply-cache-service.js";

// ─── 配置 ────────────────────────────────────────────────

export interface SupplyValidationConfig {
  amapKey?: string;
  googleKey?: string;
  timeout: number;
}

function getConfig(overrides?: Partial<SupplyValidationConfig>): SupplyValidationConfig {
  return {
    amapKey: overrides?.amapKey ?? appConfig.amapWebKey,
    googleKey: overrides?.googleKey ?? appConfig.googleMapsApiKey,
    timeout: overrides?.timeout ?? 4000,
  };
}

// ─── 刷新策略 ────────────────────────────────────────────

const REFRESH_DAYS = {
  exact_api: 180, // 精确坐标 + API 价格：半年刷新
  exact_estimate: 90, // 精确坐标 + 估算价格：3 个月刷新
  approximate: 60, // 估算坐标：2 个月刷新
  unknown: 30, // 未知坐标：1 个月刷新
};

/** 判断补给点是否需要重新验证 */
export function shouldRefresh(
  point: SupplyPoint,
  maxAgeDays?: number,
): { needsRefresh: boolean; daysSinceUpdate: number; reason: string } {
  const today = new Date();
  const lastUpdate = point.lastUpdated ? new Date(point.lastUpdated) : null;

  if (!lastUpdate) {
    return { needsRefresh: true, daysSinceUpdate: Infinity, reason: "从未验证" };
  }

  const daysSinceUpdate = Math.floor(
    (today.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24),
  );

  // 自定义最大年龄
  if (maxAgeDays != null) {
    return {
      needsRefresh: daysSinceUpdate > maxAgeDays,
      daysSinceUpdate,
      reason: daysSinceUpdate > maxAgeDays ? `超过 ${maxAgeDays} 天未更新` : "在有效期内",
    };
  }

  // 根据数据质量自动选择阈值
  const accuracy = point.locationAccuracy ?? "unknown";
  const priceConf = point.priceConfidence ?? "estimate";
  const qualityKey =
    accuracy === "exact" && priceConf === "api"
      ? "exact_api"
      : accuracy === "exact"
        ? "exact_estimate"
        : accuracy === "approximate"
          ? "approximate"
          : "unknown";
  const threshold = REFRESH_DAYS[qualityKey];

  return {
    needsRefresh: daysSinceUpdate > threshold,
    daysSinceUpdate,
    reason:
      daysSinceUpdate > threshold ? `超过 ${threshold} 天未更新（${qualityKey}）` : "在有效期内",
  };
}

// ─── 高德 POI 搜索 ───────────────────────────────────────

interface AmapPoiItem {
  name: string;
  location: string; // "lng,lat"
  address: string;
  id: string; // POI ID，用于详情查询
  biz_ext?: {
    cost?: string; // 人均消费
    rating?: string; // 评分
  };
}

interface AmapPoiResponse {
  status: string;
  info: string;
  count: string;
  pois?: AmapPoiItem[];
}

interface AmapPoiDetailResponse {
  status: string;
  pois?: Array<{
    name: string;
    location: string;
    address: string;
    biz_ext?: {
      cost?: string;
      rating?: string;
      open_time?: string; // 营业时间
    };
  }>;
}

/** 高德 POI 搜索：关键词 + 城市 → 精确坐标 + 人均消费 */
async function searchAmapPoi(
  keyword: string,
  city: string,
  key: string,
  timeout: number,
): Promise<{
  location: Location;
  address: string;
  poiId: string;
  cost?: number;
  rating?: number;
} | null> {
  const url =
    `https://restapi.amap.com/v3/place/text?key=${key}` +
    `&keywords=${encodeURIComponent(keyword)}` +
    `&city=${encodeURIComponent(city)}` +
    `&offset=1&page=1&extensions=all`;

  const res = await fetchWithTimeout(url, { timeout });
  if (!res.ok) throw new Error(`Amap POI error: ${res.status}`);

  const data = (await res.json()) as AmapPoiResponse;
  if (data.status !== "1" || !data.pois?.length) return null;

  const poi = data.pois[0];
  const [lng, lat] = poi.location.split(",").map(Number);
  // 高德返回 GCJ-02，需转为 WGS-84
  const wgs84 = gcj02ToWgs84(lat, lng);
  const rawCost = poi.biz_ext?.cost ? Number.parseFloat(poi.biz_ext.cost) : undefined;
  const cost =
    typeof rawCost === "number" && Number.isFinite(rawCost) && rawCost > 0
      ? Math.round(rawCost)
      : undefined;
  const rawRating = poi.biz_ext?.rating ? Number.parseFloat(poi.biz_ext.rating) : undefined;
  const rating =
    typeof rawRating === "number" && Number.isFinite(rawRating) ? rawRating : undefined;

  return {
    location: wgs84,
    address: poi.address,
    poiId: poi.id,
    cost,
    rating,
  };
}

/** 高德 POI 详情：用 POI ID 查询营业时间等详细信息 */
async function searchAmapPoiDetail(
  poiId: string,
  key: string,
  timeout: number,
): Promise<{ cost?: number; rating?: number; businessHours?: string } | null> {
  const url =
    `https://restapi.amap.com/v3/place/detail?key=${key}` +
    `&id=${encodeURIComponent(poiId)}&extensions=all`;

  const res = await fetchWithTimeout(url, { timeout });
  if (!res.ok) throw new Error(`Amap POI detail error: ${res.status}`);

  const data = (await res.json()) as AmapPoiDetailResponse;
  if (data.status !== "1" || !data.pois?.length) return null;

  const poi = data.pois[0];
  const rawCost = poi.biz_ext?.cost ? Number.parseFloat(poi.biz_ext.cost) : undefined;
  const cost =
    typeof rawCost === "number" && Number.isFinite(rawCost) && rawCost > 0
      ? Math.round(rawCost)
      : undefined;
  const rawRating = poi.biz_ext?.rating ? Number.parseFloat(poi.biz_ext.rating) : undefined;
  const rating =
    typeof rawRating === "number" && Number.isFinite(rawRating) ? rawRating : undefined;

  return {
    cost,
    rating,
    businessHours: poi.biz_ext?.open_time,
  };
}

// ─── Google Places 搜索 ──────────────────────────────────

interface GooglePlaceResult {
  name: string;
  geometry: { location: { lat: number; lng: number } };
  formatted_address: string;
  price_level?: number; // 0-4
  opening_hours?: { weekday_text?: string[] };
}

interface GooglePlaceResponse {
  status: string;
  results: GooglePlaceResult[];
}

/** Google Places Text Search：关键词 + 城市 → 精确坐标 + price_level */
async function searchGooglePlace(
  keyword: string,
  city: string,
  key: string,
  timeout: number,
): Promise<{ location: Location; address: string; cost?: number; businessHours?: string } | null> {
  const query = `${keyword} in ${city}`;
  const url =
    `https://maps.googleapis.com/maps/api/place/textsearch/json?` +
    `query=${encodeURIComponent(query)}&key=${key}`;

  const res = await fetchWithTimeout(url, { timeout });
  if (!res.ok) throw new Error(`Google Places error: ${res.status}`);

  const data = (await res.json()) as GooglePlaceResponse;
  if (data.status !== "OK" || !data.results?.length) return null;

  const place = data.results[0];
  // price_level 映射到估算人均：1→¥30, 2→¥60, 3→¥120, 4→¥250
  const priceMap: Record<number, number> = { 1: 30, 2: 60, 3: 120, 4: 250 };
  const cost = place.price_level != null ? priceMap[place.price_level] : undefined;
  const businessHours = place.opening_hours?.weekday_text?.join("; ");

  return {
    location: {
      latitude: place.geometry.location.lat,
      longitude: place.geometry.location.lng,
    },
    address: place.formatted_address,
    cost,
    businessHours,
  };
}

// ─── 主入口：验证单个补给点 ──────────────────────────────

export interface ValidatedSupplyPoint extends SupplyPoint {
  location?: Location;
  locationAccuracy?: LocationAccuracy;
  estimatedCost: number;
  priceConfidence?: PriceConfidence;
  lastUpdated?: string;
  dataSource?: string;
}

/** 验证单个补给点：坐标 + 价格 + 营业时间 */
export async function validateSupplyPoint(
  point: SupplyPoint,
  city: string,
  overrides?: Partial<SupplyValidationConfig>,
): Promise<ValidatedSupplyPoint> {
  const cfg = getConfig(overrides);
  const domestic = isDomesticCity(city);
  const today = new Date().toISOString().split("T")[0];

  // 已有精确坐标？直接保留
  if (point.location && point.locationAccuracy === "exact") {
    return {
      ...point,
      lastUpdated: point.lastUpdated ?? today,
      dataSource: point.dataSource ?? "manual_verified",
    };
  }

  // 查内存缓存
  const cached = getCachedSupplyPoint(city, point.name);
  if (cached) {
    recordCacheHit();
    return { ...cached, lastUpdated: cached.lastUpdated ?? today };
  }
  recordCacheMiss();

  let location: Location | undefined = point.location;
  let locationAccuracy: LocationAccuracy = point.locationAccuracy ?? "unknown";
  let estimatedCost = point.estimatedCost;
  let priceConfidence: PriceConfidence = point.priceConfidence ?? "estimate";
  let dataSource = point.dataSource ?? "estimate";
  let businessHours: string | undefined = point.businessHours;

  // ── L1: 高德 POI（国内）
  if (domestic && cfg.amapKey) {
    try {
      const result = await searchAmapPoi(point.name, city, cfg.amapKey, cfg.timeout);
      if (result) {
        location = result.location;
        locationAccuracy = "exact";
        dataSource = `amap_poi:${result.address}`;
        if (result.cost != null) {
          estimatedCost = result.cost;
          priceConfidence = "api";
        }

        // 查询详情获取营业时间
        try {
          const detail = await searchAmapPoiDetail(result.poiId, cfg.amapKey, cfg.timeout);
          if (detail?.businessHours) businessHours = detail.businessHours;
          if (detail?.cost != null) {
            estimatedCost = detail.cost;
            priceConfidence = "api";
          }
        } catch {
          // 详情查询失败不影响主结果
        }
      }
    } catch {
      // 降级到 L2/L3
    }
  }

  // ── L2: Google Places（国外 / 国内备用）
  if (!location && cfg.googleKey) {
    try {
      const result = await searchGooglePlace(point.name, city, cfg.googleKey, cfg.timeout);
      if (result) {
        location = result.location;
        locationAccuracy = "exact";
        dataSource = `google_places:${result.address}`;
        if (result.cost != null) {
          estimatedCost = result.cost;
          priceConfidence = "api";
        }
        if (result.businessHours) businessHours = result.businessHours;
      }
    } catch {
      // 降级到 L3
    }
  }

  // ── L3: dualGeocode（地理编码获取近似坐标）
  const hasTriedL1orL2 = (domestic && cfg.amapKey) || cfg.googleKey;
  if (!location && hasTriedL1orL2) {
    try {
      const { location: geoLoc, engine } = await dualGeocode(point.name, city, {
        timeout: cfg.timeout,
      });
      location = geoLoc;
      locationAccuracy = "approximate";
      dataSource = `geocode:${engine}`;
    } catch {
      // 保持未知
    }
  }

  const validated: ValidatedSupplyPoint = {
    ...point,
    location,
    locationAccuracy,
    estimatedCost,
    priceConfidence,
    businessHours,
    lastUpdated: today,
    dataSource,
  };

  // 写入缓存
  setCachedSupplyPoint(city, point.name, validated);
  return validated;
}

// ─── 批量验证 ────────────────────────────────────────────

/** 批量验证路线中所有补给点（并发度 3，避免串行瓶颈） */
export async function validateRouteSupplies(
  supplyPoints: SupplyPoint[],
  city: string,
  overrides?: Partial<SupplyValidationConfig>,
): Promise<ValidatedSupplyPoint[]> {
  return concurrentMap(
    supplyPoints,
    (point) => validateSupplyPoint(point, city, overrides),
    3, // 3 并发，平衡速度和 API 压力
  );
}

/** 批量刷新过期补给点 */
export async function refreshStaleSupplies(
  supplyPoints: SupplyPoint[],
  city: string,
  overrides?: Partial<SupplyValidationConfig>,
): Promise<{
  refreshed: ValidatedSupplyPoint[];
  stats: { total: number; refreshed: number; skipped: number };
}> {
  // 先分类：哪些需要刷新，哪些可以跳过
  const needRefresh: SupplyPoint[] = [];
  const keep: ValidatedSupplyPoint[] = [];
  for (const point of supplyPoints) {
    if (shouldRefresh(point).needsRefresh) {
      needRefresh.push(point);
    } else {
      keep.push(point as ValidatedSupplyPoint);
    }
  }

  // 并发刷新需要更新的补给点
  const refreshed = await concurrentMap(
    needRefresh,
    (point) => validateSupplyPoint(point, city, overrides),
    3,
  );

  return {
    refreshed: [...keep, ...refreshed],
    stats: {
      total: supplyPoints.length,
      refreshed: needRefresh.length,
      skipped: keep.length,
    },
  };
}

// ─── 统计验证覆盖率 ─────────────────────────────────────

export interface SupplyValidationStats {
  total: number;
  exact: number;
  approximate: number;
  unknown: number;
  apiPrice: number;
  estimatePrice: number;
  staleCount: number; // 需要刷新的数量
}

/** 统计一批补给点的验证覆盖率 */
export function computeValidationStats(points: ValidatedSupplyPoint[]): SupplyValidationStats {
  return {
    total: points.length,
    exact: points.filter((p) => p.locationAccuracy === "exact").length,
    approximate: points.filter((p) => p.locationAccuracy === "approximate").length,
    unknown: points.filter((p) => p.locationAccuracy === "unknown" || !p.locationAccuracy).length,
    apiPrice: points.filter((p) => p.priceConfidence === "api").length,
    estimatePrice: points.filter((p) => p.priceConfidence !== "api").length,
    staleCount: points.filter((p) => shouldRefresh(p).needsRefresh).length,
  };
}
