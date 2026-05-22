/**
 * 酒店搜索服务 — 基于高德 POI / Google Places 搜索景点周边真实酒店
 *
 * 数据源分层：
 *   L1 高德周边搜索 API  — 国内酒店，types=10（住宿服务），extensions=all
 *   L2 Google Places API — 国外酒店（Nearby Search, type=lodging）
 *   L3 mock 降级         — 无 API Key 时返回通用建议
 */

import type { DayPlan, Location, TripPlan } from "../types/trip.js";
import { config as appConfig } from "./config.js";
import { dualGeocode, gcj02ToWgs84, isDomesticCity } from "./dual-map-service.js";
import { fetchWithRetry } from "./http-client.js";
import { getLogger } from "./logger.js";

// ─── 类型定义 ──────────────────────────────────────────────

export interface HotelSearchResult {
  /** 酒店名称 */
  name: string;
  /** 评分 (0-5) */
  rating: number;
  /** 元/晚，高德 biz_ext.cost 或 Google 映射 */
  price: number;
  /** 价格区间文本，如 "¥198" 或 "¥200-400" */
  priceRange: string;
  /** 地址 */
  address: string;
  /** 坐标 */
  location: Location;
  /** 距搜索中心距离（米） */
  distance: number;
  /** 步行时间估算（分钟） */
  walkMinutes: number;
  /** 公共交通可达（距离 < 8km） */
  transitAccessible: boolean;
  /** 标签，如 ["有电梯", "免费停车"] */
  tags: string[];
  /** 数据来源 */
  source: "amap" | "google" | "mock";
}

export interface HotelSearchParams {
  /** 城市名 */
  city: string;
  /** 搜索中心点坐标（有则精确搜索，无则 geocode 城市中心） */
  location?: Location;
  /** 预算范围，如 "300-500" */
  budget?: string;
  /** 住宿风格：经济型 | 精品民宿 | 豪华 */
  style?: string;
  /** 通勤方式 */
  commuteMode?: "walk" | "transit" | "any";
  /** 通勤时间上限（分钟） */
  commuteMinutes?: number;
}

export interface HotelSearchResponse {
  hotels: HotelSearchResult[];
  source: "amap" | "google" | "mock";
  warning?: string;
}

// ─── 常量 ──────────────────────────────────────────────────

/** 步行速度 5km/h → 米/分钟 */
const WALK_SPEED_MPM = 5000 / 60;

/** 默认搜索半径映射 */
const RADIUS_MAP: Record<string, number> = {
  "walk-15": 1500,
  "walk-30": 3000,
  "transit-30": 8000,
  any: 15000,
};

/** style → 高德 keywords 映射 */
const STYLE_KEYWORDS_MAP: Record<string, string> = {
  经济型: "快捷酒店",
  精品民宿: "民宿,客栈",
  豪华: "五星,豪华",
};

/** Google price_level → 估算价格（元/晚） */
const GOOGLE_PRICE_LEVEL_MAP: Record<number, number> = {
  1: 100,
  2: 300,
  3: 500,
  4: 800,
};

/** 最大返回数量 */
const MAX_RESULTS = 10;

// ─── 缓存 ──────────────────────────────────────────────────

interface CacheEntry {
  hotels: HotelSearchResult[];
  timestamp: number;
}

const CACHE_MAX = 200;
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 小时
const cache = new Map<string, CacheEntry>();

function getCacheKey(params: HotelSearchParams, radius: number): string {
  const loc = params.location
    ? `${params.location.latitude.toFixed(3)},${params.location.longitude.toFixed(3)}`
    : "geocode";
  return `${params.city}:${loc}:${radius}:${params.style ?? ""}:${params.budget ?? ""}`;
}

function getCached(key: string): HotelSearchResult[] | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return entry.hotels;
}

function setCache(key: string, hotels: HotelSearchResult[]): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { hotels, timestamp: Date.now() });
}

/** 清除缓存（测试用） */
export function clearHotelCache(): void {
  cache.clear();
}

// ─── 工具函数 ──────────────────────────────────────────────

/** 计算搜索半径 */
function computeRadius(commuteMode?: string, commuteMinutes?: number): number {
  const mode = commuteMode ?? "walk";
  const minutes = commuteMinutes ?? 30;

  if (mode === "any") return RADIUS_MAP.any!;
  if (mode === "walk" && minutes <= 15) return RADIUS_MAP["walk-15"]!;
  if (mode === "walk") return RADIUS_MAP["walk-30"]!;
  if (mode === "transit") return RADIUS_MAP["transit-30"]!;
  return RADIUS_MAP["walk-30"]!;
}

/** 解析预算范围 "300-500" → { min: 300, max: 500 } */
function parseBudget(budget?: string): { min?: number; max?: number } {
  if (!budget) return {};
  const parts = budget.split("-").map(Number);
  if (parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
    return { min: parts[0], max: parts[1] };
  }
  const single = Number(budget);
  if (!Number.isNaN(single)) {
    return { min: 0, max: single };
  }
  return {};
}

/** 客户端过滤：按预算范围 */
function filterByBudget(hotels: HotelSearchResult[], budget?: string): HotelSearchResult[] {
  const { min, max } = parseBudget(budget);
  if (min == null && max == null) return hotels;

  return hotels.filter((h) => {
    if (h.price <= 0) return true; // 无价格信息的不过滤
    if (min != null && h.price < min) return false;
    if (max != null && h.price > max) return false;
    return true;
  });
}

/** 格式化价格区间文本 */
function formatPriceRange(price: number): string {
  if (price <= 0) return "暂无报价";
  return `¥${price}`;
}

/** Haversine 公式计算两点间距离（米） */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── L1: 高德周边搜索 ──────────────────────────────────────

interface AmapPoi {
  name: string;
  type?: string;
  address?: string;
  location?: string;
  tel?: string;
  rating?: string;
  biz_ext?: {
    rating?: string;
    cost?: string;
    open_time?: string;
  };
  distance?: string;
  tag?: string;
  photos?: Array<{ url?: string }>;
}

function amapPoiToHotel(poi: AmapPoi): HotelSearchResult {
  const distance = Number.parseFloat(poi.distance ?? "0");
  const rating = Number.parseFloat(poi.biz_ext?.rating ?? poi.rating ?? "0");
  const price = Number.parseFloat(poi.biz_ext?.cost ?? "0");

  let location: Location = { latitude: 0, longitude: 0 };
  if (poi.location) {
    const [lng, lat] = poi.location.split(",").map(Number);
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      // 直接返回 GCJ-02 坐标，前端根据瓦片类型决定是否转换
      location = { latitude: lat, longitude: lng };
    }
  }

  // 解析高德 tag 字段，格式: "有电梯;免费停车;免费WiFi"
  const tags = poi.tag
    ? poi.tag
        .split(";")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  return {
    name: poi.name,
    rating: Number.isNaN(rating) ? 0 : rating,
    price: Number.isNaN(price) ? 0 : price,
    priceRange: formatPriceRange(Number.isNaN(price) ? 0 : price),
    address: poi.address ?? "",
    location,
    distance,
    walkMinutes: Math.ceil(distance / WALK_SPEED_MPM),
    transitAccessible: distance < 8000,
    tags,
    source: "amap" as const,
  };
}

async function searchAmapHotels(
  center: Location,
  _city: string,
  radius: number,
  keywords: string | undefined,
): Promise<HotelSearchResult[]> {
  const amapKey = appConfig.amapWebKey;
  if (!amapKey) return [];

  const locStr = `${center.longitude},${center.latitude}`;

  const url = new URL("https://restapi.amap.com/v3/place/around");
  url.searchParams.set("key", amapKey);
  url.searchParams.set("location", locStr);
  url.searchParams.set("types", "10"); // 住宿服务大类
  url.searchParams.set("radius", String(radius));
  url.searchParams.set("sortrule", "distance");
  url.searchParams.set("offset", "25");
  url.searchParams.set("page", "1");
  url.searchParams.set("extensions", "all");

  if (keywords) {
    url.searchParams.set("keywords", keywords);
  }

  const res = await fetchWithRetry(url.toString(), { timeout: 6000 });
  const data = await res.json();

  if (data.status !== "1" || !Array.isArray(data.pois)) {
    return [];
  }

  return (data.pois as AmapPoi[]).map(amapPoiToHotel);
}

// ─── L2: Google Places Nearby Search ──────────────────────

interface GooglePlace {
  name?: string;
  vicinity?: string;
  geometry?: { location?: { lat: number; lng: number } };
  rating?: number;
  price_level?: number;
  types?: string[];
}

function googlePlaceToHotel(place: GooglePlace, center: Location): HotelSearchResult {
  const lat = place.geometry?.location?.lat ?? center.latitude;
  const lng = place.geometry?.location?.lng ?? center.longitude;
  const distance = haversineMeters(center.latitude, center.longitude, lat, lng);
  const price = GOOGLE_PRICE_LEVEL_MAP[place.price_level ?? 2] ?? 300;

  return {
    name: place.name ?? "Unknown Hotel",
    rating: place.rating ?? 0,
    price,
    priceRange: formatPriceRange(price),
    address: place.vicinity ?? "",
    location: { latitude: lat, longitude: lng },
    distance,
    walkMinutes: Math.ceil(distance / WALK_SPEED_MPM),
    transitAccessible: distance < 8000,
    tags: [],
    source: "google" as const,
  };
}

async function searchGoogleHotels(center: Location, radius: number): Promise<HotelSearchResult[]> {
  const googleKey = appConfig.googleMapsApiKey;
  if (!googleKey) return [];

  const locStr = `${center.latitude},${center.longitude}`;

  const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
  url.searchParams.set("key", googleKey);
  url.searchParams.set("location", locStr);
  url.searchParams.set("radius", String(radius));
  url.searchParams.set("type", "lodging");

  const res = await fetchWithRetry(url.toString(), { timeout: 6000 });
  const data = await res.json();

  if (data.status !== "OK" || !Array.isArray(data.results)) {
    return [];
  }

  return (data.results as GooglePlace[]).map((p) => googlePlaceToHotel(p, center));
}

// ─── L3: Mock 降级 ─────────────────────────────────────────

function getMockHotels(city: string, center: Location): HotelSearchResult[] {
  const names = [
    "如家酒店",
    "汉庭酒店",
    "全季酒店",
    "锦江之星",
    "维也纳酒店",
    "亚朵酒店",
    "桔子酒店",
    "丽枫酒店",
  ];

  return names.slice(0, MAX_RESULTS).map((name, i) => {
    const distance = 200 + i * 400;
    return {
      name: `${name}（${city}店）`,
      rating: Math.round((4.0 + i * 0.12) * 10) / 10,
      price: 150 + i * 60,
      priceRange: formatPriceRange(150 + i * 60),
      address: `${city}市中心${200 + i * 100}号`,
      location: {
        latitude: center.latitude + (i + 1) * 0.002,
        longitude: center.longitude + (i + 1) * 0.002,
      },
      distance,
      walkMinutes: Math.ceil(distance / WALK_SPEED_MPM),
      transitAccessible: distance < 8000,
      tags: i % 3 === 0 ? ["免费WiFi", "免费停车"] : [],
      source: "mock" as const,
    };
  });
}

// ─── 默认城市坐标（geocode 兜底用）──────────────────────────

const DEFAULT_CITY_LOCATIONS: Record<string, Location> = {
  北京: { latitude: 39.9042, longitude: 116.4074 },
  上海: { latitude: 31.2304, longitude: 121.4737 },
  广州: { latitude: 23.1291, longitude: 113.2644 },
  深圳: { latitude: 22.5431, longitude: 114.0579 },
  成都: { latitude: 30.5728, longitude: 104.0668 },
  杭州: { latitude: 30.2741, longitude: 120.1551 },
  西安: { latitude: 34.3416, longitude: 108.9398 },
  重庆: { latitude: 29.563, longitude: 106.5516 },
};

// ─── 主入口 ──────────────────────────────────────────────

/**
 * 搜索酒店 — 核心搜索入口
 *
 * 降级逻辑：国内优先高德 → 国外 Google → mock
 */
export async function searchHotels(params: HotelSearchParams): Promise<HotelSearchResponse> {
  const { city, budget, style, commuteMode, commuteMinutes } = params;
  const radius = computeRadius(commuteMode, commuteMinutes);

  // 计算缓存 key
  const cacheKey = getCacheKey(params, radius);
  const cached = getCached(cacheKey);
  if (cached) {
    return {
      hotels: filterByBudget(cached.slice(0, MAX_RESULTS), budget),
      source: cached[0]?.source ?? "mock",
    };
  }

  // 确定搜索中心
  let center: Location;
  if (params.location) {
    center = params.location;
  } else {
    // geocode 城市中心
    try {
      const geoResult = await dualGeocode(city, city);
      center = geoResult.location;
    } catch {
      center = DEFAULT_CITY_LOCATIONS[city] ?? { latitude: 31.23, longitude: 121.47 };
    }
  }

  // style → keywords
  const keywords = style ? STYLE_KEYWORDS_MAP[style] : undefined;

  const isDomestic = isDomesticCity(city);

  try {
    let hotels: HotelSearchResult[];
    let source: "amap" | "google" | "mock";

    if (isDomestic && appConfig.amapWebKey) {
      hotels = await searchAmapHotels(center, city, radius, keywords);
      source = "amap";
    } else if (appConfig.googleMapsApiKey) {
      hotels = await searchGoogleHotels(center, radius);
      source = "google";
    } else {
      const mock = getMockHotels(city, center);
      return {
        hotels: filterByBudget(mock, budget),
        source: "mock",
        warning: isDomestic
          ? "无高德 API Key，使用 mock 数据"
          : "无 Google Maps API Key，使用 mock 数据",
      };
    }

    // API 返回空 → 降级到 mock
    if (hotels.length === 0) {
      const mock = getMockHotels(city, center);
      return {
        hotels: filterByBudget(mock, budget),
        source: "mock",
        warning: "API 无结果，使用 mock 数据",
      };
    }

    // 按 distance 排序
    hotels.sort((a, b) => a.distance - b.distance);
    const limited = hotels.slice(0, MAX_RESULTS);

    // 写入缓存（未过滤的完整列表）
    setCache(cacheKey, hotels);

    return { hotels: filterByBudget(limited, budget), source };
  } catch (err) {
    getLogger()
      .child({ component: "hotel-service" })
      .warn("API failed, using mock", { error: err instanceof Error ? err.message : err });
    const mock = getMockHotels(city, center);
    return {
      hotels: filterByBudget(mock, budget),
      source: "mock",
      warning: `API 调用失败: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── enrichHotelsForTrip ──────────────────────────────────

/**
 * 为 TripPlan 的每日行程填充真实酒店数据
 *
 * 逻辑：
 *   - 如果 day.hotel 已有值（AI 已填），保留 AI 选择但补充真实价格和坐标
 *   - 如果 day.hotel 为空，从景点中心点搜索并选择最优推荐
 */
export async function enrichHotelsForTrip(tripPlan: TripPlan): Promise<TripPlan> {
  const enrichedDays = await Promise.all(
    tripPlan.days.map(async (day) => {
      // 跳过移动日
      if (day.isTransferDay) return day;

      // 确定搜索中心：取景点中间位置
      const center = computeAttractionsCenter(day);

      try {
        const { hotels } = await searchHotels({
          city: day.city,
          location: center,
          commuteMode: "walk",
          commuteMinutes: 30,
        });

        if (hotels.length === 0) return day;

        if (day.hotel?.name) {
          // AI 已填酒店 → 尝试匹配真实数据补充价格和坐标
          const matched = hotels.find(
            (h) => h.name.includes(day.hotel!.name) || day.hotel!.name.includes(h.name),
          );
          if (matched) {
            return {
              ...day,
              hotel: {
                ...day.hotel,
                location: matched.location,
                estimatedCost: matched.price || day.hotel.estimatedCost,
                priceRange: matched.priceRange || day.hotel.priceRange,
                source: matched.source,
                tags: matched.tags,
                distance: matched.distance,
                walkMinutes: matched.walkMinutes,
                transitAccessible: matched.transitAccessible,
              },
            };
          }
          // 没匹配到，保持 AI 选择不变
          return day;
        }

        // 无酒店 → 选择第一个推荐
        const best = hotels[0]!;
        return {
          ...day,
          hotel: {
            name: best.name,
            address: best.address,
            location: best.location,
            priceRange: best.priceRange,
            rating: best.rating,
            estimatedCost: best.price,
            source: best.source,
            tags: best.tags,
            distance: best.distance,
            walkMinutes: best.walkMinutes,
            transitAccessible: best.transitAccessible,
          },
        };
      } catch (err) {
        getLogger()
          .child({ component: "hotel-service" })
          .warn("enrichHotelsForTrip failed", {
            city: day.city,
            dayIndex: day.dayIndex,
            error: err instanceof Error ? err.message : err,
          });
        return day;
      }
    }),
  );

  return { ...tripPlan, days: enrichedDays };
}

/** 计算景点群的中心点 */
function computeAttractionsCenter(day: DayPlan): Location {
  if (day.attractions.length === 0) {
    return day.hotel?.location ?? { latitude: 31.23, longitude: 121.47 };
  }

  const latSum = day.attractions.reduce((s, a) => s + a.location.latitude, 0);
  const lngSum = day.attractions.reduce((s, a) => s + a.location.longitude, 0);
  const n = day.attractions.length;

  return {
    latitude: latSum / n,
    longitude: lngSum / n,
  };
}

// ─── 导出辅助函数（测试用） ────────────────────────────────

export const _test = {
  computeRadius,
  parseBudget,
  filterByBudget,
  formatPriceRange,
};
