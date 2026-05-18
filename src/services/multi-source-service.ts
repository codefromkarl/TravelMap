/**
 * 多数据源景点融合服务
 *
 * L1 结构化: Google Places API（基础景点信息）
 * L2 UGC: 小红书真实笔记搜索 + 本地知识补充
 * 融合策略：结构化数据为基础，UGC 补充真实评价和避坑指南
 * 搜索结果缓存：相同城市 30 分钟内复用
 */

import { LRUCache } from "lru-cache";
import type { Attraction } from "../types/trip.js";
import { config } from "./config.js";
import { fetchWithTimeout } from "./http-client.js";
import { getMockAttractions, getMockUGC } from "./mock-data.js";
import { batchSearchXhsNotes } from "./xhs-service.js";

export interface AttractionSearchParams {
  city: string;
  preferences?: string[];
  keywords?: string;
}

/** UGC 评论片段 */
export interface UGCReview {
  source: string; // "tripadvisor" | "xiaohongshu" | "local_knowledge"
  summary: string;
  rating?: number;
  tips: string;
  meta?: {
    noteId?: string;
    author?: string;
    likes?: number;
    [key: string]: unknown;
  };
}

/** 融合后的景点 */
export interface EnrichedAttraction extends Attraction {
  ugcReviews: UGCReview[];
  sources: string[];
}

/** 融合结果 */
export interface FusionResult {
  attractions: EnrichedAttraction[];
  sources: string[];
  fromCache: boolean;
}

// ─── 缓存 ─────────────────────────────────────────────────

interface CacheEntry {
  result: FusionResult;
  timestamp: number;
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 分钟
const searchCache = new LRUCache<string, CacheEntry>({
  max: 1000,
  ttl: CACHE_TTL_MS,
});

function cacheKey(params: AttractionSearchParams): string {
  return `${params.city}:${params.preferences?.join(",") ?? ""}:${params.keywords ?? ""}`;
}

/** 清除缓存（测试用） */
export function clearSearchCache(): void {
  searchCache.clear();
}

// ─── L1: 结构化数据 (Google Places) ──────────────────────

interface GooglePlace {
  name: string;
  formatted_address: string;
  geometry: { location: { lat: number; lng: number } };
  rating?: number;
  types?: string[];
  editorial_summary?: { overview: string };
}

interface GoogleTextSearchResponse {
  results: GooglePlace[];
  status: string;
}

function mapCategory(types: string[]): string {
  if (types?.includes("museum")) return "博物馆";
  if (types?.includes("park")) return "公园";
  if (types?.includes("place_of_worship")) return "宗教场所";
  if (types?.includes("amusement_park")) return "主题乐园";
  if (types?.includes("art_gallery")) return "艺术画廊";
  if (types?.includes("tourist_attraction")) return "景点";
  if (types?.includes("natural_feature")) return "自然风光";
  if (types?.includes("shopping_mall")) return "购物";
  return "景点";
}

async function fetchGooglePlaces(
  params: AttractionSearchParams,
  apiKey: string,
): Promise<Attraction[]> {
  const query = [params.city, "tourist attractions", params.keywords, params.preferences?.join(" ")]
    .filter(Boolean)
    .join(" ");

  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("language", "zh-CN");

  const res = await fetchWithTimeout(url.toString(), { timeout: 8000 });
  if (!res.ok) throw new Error(`Google Places error: ${res.status}`);

  const data = (await res.json()) as GoogleTextSearchResponse;
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(`Google Places status: ${data.status}`);
  }

  return (data.results || []).slice(0, 10).map((p) => ({
    name: p.name,
    nameZh: p.name,
    nameEn: p.name,
    address: p.formatted_address,
    location: { latitude: p.geometry.location.lat, longitude: p.geometry.location.lng },
    visitDuration: 120,
    description: p.editorial_summary?.overview ?? `${p.name}是${params.city}的热门景点`,
    category: mapCategory(p.types ?? []),
    ticketPrice: 0,
    reservationRequired: false,
    reservationTips: "",
  }));
}

// ─── L2: UGC 数据 ─────────────────────────────────────────

// ─── 融合 ─────────────────────────────────────────────────

/** 去重 — 以 nameZh 为 key */
function deduplicate(attractions: EnrichedAttraction[]): EnrichedAttraction[] {
  const seen = new Map<string, EnrichedAttraction>();
  for (const a of attractions) {
    const existing = seen.get(a.nameZh);
    if (!existing) {
      seen.set(a.nameZh, a);
    } else {
      // 合并 sources
      const mergedSources = [...new Set([...existing.sources, ...a.sources])];
      // 合并 UGC
      const mergedReviews = [...existing.ugcReviews];
      for (const r of a.ugcReviews) {
        if (!mergedReviews.some((mr) => mr.source === r.source)) {
          mergedReviews.push(r);
        }
      }
      seen.set(a.nameZh, { ...existing, sources: mergedSources, ugcReviews: mergedReviews });
    }
  }
  return [...seen.values()];
}

/** 为景点附加 UGC 数据（优先真实 API，降级到 mock） */
async function enrichWithUGC(
  attractions: Attraction[],
  city: string,
): Promise<EnrichedAttraction[]> {
  // 尝试从真实小红书 API 获取数据
  const xhsApiKey = config.xhsApiToken;
  let xhsData = new Map<string, UGCReview[]>();

  if (xhsApiKey) {
    try {
      const names = attractions.map((a) => a.nameZh);
      xhsData = await batchSearchXhsNotes(city, names);
    } catch (err) {
      console.warn(
        "[MultiSource] 小红书 API 调用失败，降级到 mock:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return attractions.map((a) => {
    const xhsReviews = xhsData.get(a.nameZh) ?? [];
    const mockReviews = getMockUGC(city, a.nameZh);

    // 合并：真实数据优先，mock 补充
    const allReviews = [...xhsReviews];
    for (const mock of mockReviews) {
      // 避免重复 source
      if (!allReviews.some((r) => r.source === mock.source)) {
        allReviews.push(mock);
      }
    }

    // 如果完全没有数据，添加默认 local_knowledge
    if (allReviews.length === 0) {
      allReviews.push({
        source: "local_knowledge",
        summary: `${a.nameZh}是${city}值得游览的地方`,
        rating: 4.0,
        tips: "建议提前查询开放时间和门票信息",
      });
    }

    const sources = ["structured"];
    if (xhsReviews.length > 0) sources.push("xiaohongshu_api");
    if (mockReviews.length > 0) sources.push("ugc_mock");

    return {
      ...a,
      ugcReviews: allReviews,
      sources,
    };
  });
}

// ─── 主入口 ───────────────────────────────────────────────

export async function searchAttractionsMultiSource(
  params: AttractionSearchParams,
): Promise<FusionResult> {
  // 检查缓存
  const key = cacheKey(params);
  const cached = searchCache.get(key);
  if (cached) {
    return { ...cached.result, fromCache: true };
  }

  const sources: string[] = [];
  let attractions: Attraction[] = [];

  // L1: Google Places
  const googleKey = config.googleMapsApiKey;
  if (googleKey) {
    try {
      attractions = await fetchGooglePlaces(params, googleKey);
      sources.push("google_places");
    } catch (err) {
      console.warn("[MultiSource] Google Places failed:", err instanceof Error ? err.message : err);
    }
  }

  // Mock 基础数据
  if (attractions.length === 0) {
    attractions = getMockAttractions(params);
    sources.push("mock");
  }

  // L2: 附加 UGC（小红书 API + mock 降级）
  const enriched = await enrichWithUGC(attractions, params.city);
  if (enriched.some((e) => e.sources.includes("xiaohongshu_api"))) {
    sources.push("xiaohongshu");
  }
  if (enriched.some((e) => e.sources.includes("ugc_mock"))) {
    sources.push("ugc");
  }

  // 去重融合
  const fused = deduplicate(enriched);

  const result: FusionResult = {
    attractions: fused,
    sources: [...new Set(sources)],
    fromCache: false,
  };

  // 写入缓存
  searchCache.set(key, { result, timestamp: Date.now() });

  return result;
}
