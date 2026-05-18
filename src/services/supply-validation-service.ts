/**
 * 补给点验证服务 — 为路线补给点提供坐标校准和价格验证
 *
 * 验证层级：
 *   L1 高德 POI API — 国内精确坐标 + 人均消费（最准）
 *   L2 Google Places API — 国外精确坐标 + price_level
 *   L3 dualGeocode — 地理编码获取近似坐标
 *   L4 静态估算 — 无网络时保持原值，标记为 unknown
 *
 * 每个补给点输出带 confidence 标签的结果，方便前端展示精度。
 */

import type { LocationAccuracy, PriceConfidence, SupplyPoint } from "../types/route.js";
import type { Location } from "../types/trip.js";
import { config as appConfig } from "./config.js";
import { dualGeocode, isDomesticCity } from "./dual-map-service.js";
import { fetchWithTimeout } from "./http-client.js";

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

// ─── 高德 POI 搜索 ───────────────────────────────────────

interface AmapPoiItem {
  name: string;
  location: string; // "lng,lat"
  address: string;
  biz_ext?: {
    cost?: string; // 人均消费（字符串数字）
  };
}

interface AmapPoiResponse {
  status: string;
  info: string;
  count: string;
  pois?: AmapPoiItem[];
}

/** 高德 POI 搜索：关键词 + 城市 → 精确坐标 + 人均消费 */
async function searchAmapPoi(
  keyword: string,
  city: string,
  key: string,
  timeout: number,
): Promise<{ location: Location; address: string; cost?: number } | null> {
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
  const rawCost = poi.biz_ext?.cost ? Number.parseFloat(poi.biz_ext.cost) : undefined;
  const cost =
    typeof rawCost === "number" && Number.isFinite(rawCost) && rawCost > 0
      ? Math.round(rawCost)
      : undefined;

  return {
    location: { latitude: lat, longitude: lng },
    address: poi.address,
    cost,
  };
}

// ─── Google Places 搜索 ──────────────────────────────────

interface GooglePlaceResult {
  name: string;
  geometry: { location: { lat: number; lng: number } };
  formatted_address: string;
  price_level?: number; // 0-4
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
): Promise<{ location: Location; address: string; cost?: number } | null> {
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

  return {
    location: {
      latitude: place.geometry.location.lat,
      longitude: place.geometry.location.lng,
    },
    address: place.formatted_address,
    cost,
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

/** 验证单个补给点：坐标 + 价格 */
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

  let location: Location | undefined = point.location;
  let locationAccuracy: LocationAccuracy = point.locationAccuracy ?? "unknown";
  let estimatedCost = point.estimatedCost;
  let priceConfidence: PriceConfidence = point.priceConfidence ?? "estimate";
  let dataSource = point.dataSource ?? "estimate";

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
        return {
          ...point,
          location,
          locationAccuracy,
          estimatedCost,
          priceConfidence,
          lastUpdated: today,
          dataSource,
        };
      }
    } catch {
      // 降级到 L2/L3
    }
  }

  // ── L2: Google Places（国外 / 国内备用）
  if (cfg.googleKey) {
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
        return {
          ...point,
          location,
          locationAccuracy,
          estimatedCost,
          priceConfidence,
          lastUpdated: today,
          dataSource,
        };
      }
    } catch {
      // 降级到 L3
    }
  }

  // ── L3: dualGeocode（地理编码获取近似坐标）
  // 仅在已有坐标缺失、且 L1/L2 至少尝试过（有 key 但搜索失败）时才降级
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

  return {
    ...point,
    location,
    locationAccuracy,
    estimatedCost,
    priceConfidence,
    lastUpdated: today,
    dataSource,
  };
}

// ─── 批量验证：整条路线的补给点 ──────────────────────────

/** 批量验证路线中所有补给点（带并发控制） */
export async function validateRouteSupplies(
  supplyPoints: SupplyPoint[],
  city: string,
  overrides?: Partial<SupplyValidationConfig>,
): Promise<ValidatedSupplyPoint[]> {
  // 逐个验证避免触发 API rate limit（高德免费额度 5000/天）
  const results: ValidatedSupplyPoint[] = [];
  for (const point of supplyPoints) {
    const validated = await validateSupplyPoint(point, city, overrides);
    results.push(validated);
  }
  return results;
}

// ─── 统计验证覆盖率 ─────────────────────────────────────

export interface SupplyValidationStats {
  total: number;
  exact: number;
  approximate: number;
  unknown: number;
  apiPrice: number;
  estimatePrice: number;
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
  };
}
