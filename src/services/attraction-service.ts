/**
 * 景点搜索服务 — Google Places API (Text Search)
 *
 * 备选：当无 API Key 时返回 mock 数据
 */

import type { Attraction } from "../types/trip.js";
import { config } from "./config.js";
import { fetchWithTimeout } from "./http-client.js";
import { getMockAttractions } from "./mock-data.js";

export interface AttractionSearchParams {
  city: string;
  preferences?: string[];
  keywords?: string;
}

/** Google Places Text Search 响应中的 place */
interface GooglePlace {
  name: string;
  formatted_address: string;
  geometry: { location: { lat: number; lng: number } };
  rating?: number;
  user_ratings_total?: number;
  types?: string[];
  photos?: { photo_reference: string; height: number; width: number }[];
  editorial_summary?: { overview: string };
  business_status?: string;
}

interface GoogleTextSearchResponse {
  results: GooglePlace[];
  status: string;
}

/** 将偏好标签映射为搜索关键词 */
function buildQuery(params: AttractionSearchParams): string {
  const parts: string[] = ["tourist attractions", params.city];
  if (params.keywords) parts.push(params.keywords);
  if (params.preferences?.length) parts.push(params.preferences.join(" "));
  return parts.join(" ");
}

/** Google Places 类型映射到中文分类 */
function mapCategory(types: string[]): string {
  if (types.includes("museum")) return "博物馆";
  if (types.includes("park")) return "公园";
  if (types.includes("place_of_worship")) return "宗教场所";
  if (types.includes("amusement_park")) return "主题乐园";
  if (types.includes("art_gallery")) return "艺术画廊";
  if (types.includes("tourist_attraction")) return "景点";
  if (types.includes("natural_feature")) return "自然风光";
  if (types.includes("shopping_mall")) return "购物";
  return "景点";
}

/** 调用 Google Places Text Search API */
async function fetchFromGoogle(
  params: AttractionSearchParams,
  apiKey: string,
): Promise<Attraction[]> {
  const query = buildQuery(params);
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("language", "zh-CN");

  const res = await fetchWithTimeout(url.toString(), { timeout: 8000 });
  if (!res.ok) {
    throw new Error(`Google Places API error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as GoogleTextSearchResponse;
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(`Google Places API status: ${data.status}`);
  }

  return (data.results || []).slice(0, 10).map((place) => ({
    name: place.name,
    nameZh: place.name,
    nameEn: place.name,
    address: place.formatted_address,
    location: {
      latitude: place.geometry.location.lat,
      longitude: place.geometry.location.lng,
    },
    visitDuration: 120, // 默认 2 小时
    description: place.editorial_summary?.overview ?? `${place.name}是${params.city}的热门景点`,
    category: mapCategory(place.types ?? []),
    ticketPrice: 0,
    reservationRequired: false,
    reservationTips: "",
  }));
}

/** 搜索景点 — 主入口 */
export async function searchAttractions(params: AttractionSearchParams): Promise<{
  attractions: Attraction[];
  source: string;
}> {
  const apiKey = config.googleMapsApiKey;

  if (apiKey) {
    try {
      const attractions = await fetchFromGoogle(params, apiKey);
      return { attractions, source: "google_places" };
    } catch (err) {
      console.warn(
        "[AttractionService] Google Places API failed, using mock:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { attractions: getMockAttractions(params), source: "mock" };
}
