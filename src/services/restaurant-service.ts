/**
 * 餐厅推荐服务 — 基于高德 POI / Google Places 搜索景点周边真实餐厅
 *
 * 数据源分层：
 *   L1 高德周边搜索 API  — 国内精确坐标 + 评分 + 人均消费 + 距离
 *   L2 Google Places API — 国外餐厅数据（Nearby Search）
 *   L3 mock 降级         — 无 API Key 时保持现有行为
 */

import type { DayPlan, Location } from "../types/trip.js";
import { LRUCache } from "lru-cache";
import { config as appConfig } from "./config.js";
import { gcj02ToWgs84, isDomesticCity } from "./dual-map-service.js";
import { fetchWithRetry } from "./http-client.js";
import { getLogger } from "./logger.js";

// ─── 类型定义 ──────────────────────────────────────────────

export interface Restaurant {
  /** 餐厅名称 */
  name: string;
  /** 评分 (0-5) */
  rating: number;
  /** 人均消费（元） */
  averageCost: number;
  /** 距搜索中心距离（米） */
  distance: number;
  /** 步行时间估算（分钟，5km/h） */
  walkMinutes: number;
  /** 菜系/品类 */
  cuisine: string;
  /** 地址 */
  address: string;
  /** 坐标 */
  location: Location;
  /** 营业时间 */
  businessHours?: string;
  /** 电话 */
  phone?: string;
  /** 招牌菜/推荐菜 */
  signature?: string;
  /** 数据来源 */
  source: "amap" | "google" | "mock";
}

export interface SearchNearbyParams {
  /** 搜索中心点 */
  location: Location;
  /** 城市名（用于国内/国外判断） */
  city: string;
  /** 搜索半径（米），默认 1000 */
  radius?: number;
  /** 餐类（影响搜索关键词） */
  mealType?: "breakfast" | "lunch" | "dinner";
  /** 菜系偏好 */
  cuisine?: string;
  /** 返回数量上限，默认 5 */
  limit?: number;
}

/** 步行速度 5km/h → 米/分钟 */
const WALK_SPEED_MPM = 5000 / 60;

// ─── 缓存 ──────────────────────────────────────────────────

interface CacheEntry {
  restaurants: Restaurant[];
}

const cache = new LRUCache<string, CacheEntry>({
  max: 500,
  ttl: 4 * 60 * 60 * 1000, // 4 小时
  allowStale: false,
  ttlAutopurge: true,
});

function getCacheKey(location: Location, radius: number, mealType?: string): string {
  return `${location.latitude.toFixed(3)},${location.longitude.toFixed(3)}:${radius}:${mealType ?? "any"}`;
}

/** 清除缓存（测试用） */
export function clearRestaurantCache(): void {
  cache.clear();
}

// ─── 高德 API 类型码映射 ───────────────────────────────────

const AMAP_TYPE_MAP: Record<string, string> = {
  breakfast: "050300", // 快餐（含早餐）
  lunch: "050000", // 餐饮服务（全部）
  dinner: "050100", // 中餐厅
};

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
  photos?: Array<{ url?: string }>;
}

function parseAmapCuisine(typeStr?: string): string {
  if (!typeStr) return "餐饮";
  const parts = typeStr.split(";");
  // 格式: "餐饮服务;中餐厅;浙江菜" → 取最后一段
  return parts[parts.length - 1] ?? parts[0] ?? "餐饮";
}

function amapPoiToRestaurant(poi: AmapPoi): Restaurant {
  const distance = Number.parseFloat(poi.distance ?? "0");
  const rating = Number.parseFloat(poi.biz_ext?.rating ?? poi.rating ?? "0");
  const averageCost = Number.parseFloat(poi.biz_ext?.cost ?? "0");

  // 解析坐标 — 高德格式: "经度,纬度"
  let location: Location = { latitude: 0, longitude: 0 };
  if (poi.location) {
    const [lng, lat] = poi.location.split(",").map(Number);
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      // 直接返回 GCJ-02 坐标，前端根据瓦片类型决定是否转换
      location = { latitude: lat, longitude: lng };
    }
  }

  return {
    name: poi.name,
    rating: Number.isNaN(rating) ? 0 : rating,
    averageCost: Number.isNaN(averageCost) ? 0 : averageCost,
    distance,
    walkMinutes: Math.ceil(distance / WALK_SPEED_MPM),
    cuisine: parseAmapCuisine(poi.type),
    address: poi.address ?? "",
    location,
    businessHours: poi.biz_ext?.open_time,
    phone: poi.tel,
    source: "amap" as const,
  };
}

async function searchAmapNearby(
  params: SearchNearbyParams,
  amapKey: string,
): Promise<Restaurant[]> {
  const { location, radius = 1000, mealType, cuisine, limit = 5 } = params;

  // 高德 location 格式: 经度,纬度
  const locStr = `${location.longitude},${location.latitude}`;
  const types = AMAP_TYPE_MAP[mealType ?? "lunch"] ?? "050000";

  const url = new URL("https://restapi.amap.com/v3/place/around");
  url.searchParams.set("key", amapKey);
  url.searchParams.set("location", locStr);
  url.searchParams.set("types", types);
  url.searchParams.set("radius", String(radius));
  url.searchParams.set("sortrule", "weight");
  url.searchParams.set("offset", String(Math.min(limit, 25)));
  url.searchParams.set("page", "1");
  url.searchParams.set("extensions", "all");

  // 如果有菜系偏好，添加关键词过滤
  if (cuisine) {
    url.searchParams.set("keywords", cuisine);
  }

  const res = await fetchWithRetry(url.toString(), { timeout: 6000 });
  const data = await res.json();

  if (data.status !== "1" || !Array.isArray(data.pois)) {
    return [];
  }

  return (data.pois as AmapPoi[]).slice(0, limit).map(amapPoiToRestaurant);
}

// ─── L2: Google Places Nearby Search ──────────────────────

interface GooglePlace {
  name?: string;
  vicinity?: string;
  geometry?: { location?: { lat: number; lng: number } };
  rating?: number;
  price_level?: number;
  types?: string[];
  opening_hours?: { open_now?: boolean };
}

function googlePlaceToRestaurant(place: GooglePlace, center: Location): Restaurant {
  const lat = place.geometry?.location?.lat ?? center.latitude;
  const lng = place.geometry?.location?.lng ?? center.longitude;
  const distance = haversineMeters(center.latitude, center.longitude, lat, lng);

  // Google price_level: 0=免费, 1=便宜, 2=中等, 3=贵, 4=非常贵
  const priceLevelMap: Record<number, number> = {
    0: 0,
    1: 30,
    2: 80,
    3: 150,
    4: 300,
  };

  return {
    name: place.name ?? "Unknown Restaurant",
    rating: place.rating ?? 0,
    averageCost: priceLevelMap[place.price_level ?? 2] ?? 80,
    distance,
    walkMinutes: Math.ceil(distance / WALK_SPEED_MPM),
    cuisine:
      place.types?.find((t) => t !== "restaurant" && t !== "food" && t !== "establishment") ??
      "Restaurant",
    address: place.vicinity ?? "",
    location: { latitude: lat, longitude: lng },
    source: "google" as const,
  };
}

async function searchGoogleNearby(
  params: SearchNearbyParams,
  googleKey: string,
): Promise<Restaurant[]> {
  const { location, radius = 1000, limit = 5 } = params;

  // Google 格式: lat,lng
  const locStr = `${location.latitude},${location.longitude}`;

  const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
  url.searchParams.set("key", googleKey);
  url.searchParams.set("location", locStr);
  url.searchParams.set("radius", String(radius));
  url.searchParams.set("type", "restaurant");

  const res = await fetchWithRetry(url.toString(), { timeout: 6000 });
  const data = await res.json();

  if (data.status !== "OK" || !Array.isArray(data.results)) {
    return [];
  }

  return (data.results as GooglePlace[])
    .slice(0, limit)
    .map((p) => googlePlaceToRestaurant(p, location));
}

// ─── L3: Mock 降级 ─────────────────────────────────────────

function getMockRestaurants(params: SearchNearbyParams): Restaurant[] {
  const { location, limit = 5, mealType = "lunch", cuisine } = params;

  const mealNames: Record<string, string[]> = {
    breakfast: ["早茶点心铺", "豆浆油条坊", "粥道早餐"],
    lunch: ["外婆家", "绿茶餐厅", "新白鹿", "弄堂里", "老娘舅"],
    dinner: ["海底捞火锅", "西贝莜面村", "外婆家", "南京大牌档", "望湘园"],
  };

  const cuisines = cuisine ? [cuisine] : ["中式快餐", "本地特色", "家常菜"];
  const names = mealNames[mealType] ?? mealNames.lunch!;

  return names.slice(0, limit).map((name, i) => {
    const distance = 100 + i * 150;
    return {
      name: `${name}(${params.city}店)`,
      rating: 4.2 + i * 0.15,
      averageCost: 50 + i * 30,
      distance,
      walkMinutes: Math.ceil(distance / WALK_SPEED_MPM),
      cuisine: cuisines[i % cuisines.length] ?? "中式快餐",
      address: `${params.city}市中心${100 + i * 50}号`,
      location: {
        latitude: location.latitude + (i + 1) * 0.001,
        longitude: location.longitude + (i + 1) * 0.001,
      },
      businessHours: "10:00-22:00",
      phone: `0571-8888${String(1000 + i).slice(1)}`,
      source: "mock" as const,
    };
  });
}

// ─── 主入口 ──────────────────────────────────────────────

export interface RestaurantSearchResult {
  restaurants: Restaurant[];
  source: "amap" | "google" | "mock";
  warning?: string;
}

/**
 * 搜索附近餐厅 — 核心搜索
 *
 * 根据城市自动选择数据源：国内用高德，国外用 Google，无 Key 用 mock。
 */
export async function searchNearbyRestaurants(
  params: SearchNearbyParams,
): Promise<RestaurantSearchResult> {
  const { radius = 1000, mealType, limit = 5 } = params;
  const cacheKey = getCacheKey(params.location, radius, mealType);

  // 检查缓存
  const cached = cache.get(cacheKey);
  if (cached) {
    return { restaurants: cached.restaurants.slice(0, limit), source: cached.restaurants[0]?.source ?? "mock" };
  }

  const amapKey = appConfig.amapWebKey;
  const googleKey = appConfig.googleMapsApiKey;
  const isDomestic = isDomesticCity(params.city);

  try {
    let restaurants: Restaurant[];
    let source: "amap" | "google" | "mock";

    if (isDomestic && amapKey) {
      restaurants = await searchAmapNearby(params, amapKey);
      source = "amap";
    } else if (googleKey) {
      restaurants = await searchGoogleNearby(params, googleKey);
      source = "google";
    } else if (isDomestic && !amapKey) {
      // 国内无高德 key → mock
      restaurants = getMockRestaurants(params);
      source = "mock";
      return { restaurants, source, warning: "无高德 API Key，使用 mock 数据" };
    } else {
      // 国外无 Google key → mock
      restaurants = getMockRestaurants(params);
      source = "mock";
      return { restaurants, source, warning: "无 Google Maps API Key，使用 mock 数据" };
    }

    // API 返回空结果时降级到 mock
    if (restaurants.length === 0) {
      const mock = getMockRestaurants(params);
      return { restaurants: mock, source: "mock", warning: "API 无结果，使用 mock 数据" };
    }

    // 写入缓存
    cache.set(cacheKey, { restaurants });

    return { restaurants: restaurants.slice(0, limit), source };
  } catch (err) {
    getLogger()
      .child({ component: "restaurant-service" })
      .warn("API failed, using mock", { error: err instanceof Error ? err.message : err });
    const mock = getMockRestaurants(params);
    return {
      restaurants: mock,
      source: "mock",
      warning: `API 调用失败: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── F2: enrichDayMeals ──────────────────────────────────

/**
 * 为 DayPlan 的每日三餐填充真实餐厅数据
 *
 * 逻辑：
 *   - 早餐 → 酒店附近搜索（或第一个景点附近）
 *   - 午餐 → 中间景点附近搜索
 *   - 晚餐 → 最后一个景点附近搜索
 *
 * 保留原有 Meal 的 type 和 estimatedCost，追加 restaurant 字段。
 */
export async function enrichDayMeals(dayPlan: DayPlan): Promise<DayPlan> {
  const { attractions, meals, hotel, city } = dayPlan;

  if (meals.length === 0) return dayPlan;

  // 确定搜索中心点
  const hotelLocation = hotel?.location;
  const firstAttractionLocation = attractions[0]?.location;
  const lastAttractionLocation = attractions[attractions.length - 1]?.location;

  // 选择中间景点（午餐用）
  const midIndex = Math.floor(attractions.length / 2);
  const midAttractionLocation = attractions[midIndex]?.location;

  const enrichedMeals = await Promise.all(
    meals.map(async (meal) => {
      let searchCenter: Location;

      switch (meal.type) {
        case "breakfast":
          searchCenter = hotelLocation ?? firstAttractionLocation ?? DEFAULT_LOCATION;
          break;
        case "lunch":
          searchCenter = midAttractionLocation ?? firstAttractionLocation ?? DEFAULT_LOCATION;
          break;
        case "dinner":
          searchCenter = lastAttractionLocation ?? firstAttractionLocation ?? DEFAULT_LOCATION;
          break;
        default:
          searchCenter = firstAttractionLocation ?? DEFAULT_LOCATION;
      }

      try {
        const { restaurants } = await searchNearbyRestaurants({
          location: searchCenter,
          city,
          radius: 1000,
          mealType: meal.type === "snack" ? undefined : meal.type,
          limit: 3,
        });

        if (restaurants.length > 0) {
          return {
            ...meal,
            estimatedCost: restaurants[0]!.averageCost || meal.estimatedCost,
            restaurant: restaurants[0],
          };
        }
      } catch (err) {
        getLogger()
          .child({ component: "restaurant-service" })
          .warn("enrichDayMeals failed", {
            mealType: meal.type,
            error: err instanceof Error ? err.message : err,
          });
      }

      return meal;
    }),
  );

  return { ...dayPlan, meals: enrichedMeals };
}

const DEFAULT_LOCATION: Location = { latitude: 39.909, longitude: 116.397 };

// ─── 工具函数 ──────────────────────────────────────────────

/** Haversine 公式计算两点间距离（米） */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000; // 地球半径（米）
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
