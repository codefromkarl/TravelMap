/**
 * 多数据源景点融合服务
 *
 * L1 结构化: Google Places API(基础景点信息)
 * L1.5 免费数据源: Wikivoyage + OpenTripMap + 去哪儿 + Wikipedia
 * L2 UGC: 小红书真实笔记搜索 + 本地知识补充
 * 融合策略:结构化数据为基础,免费数据源补充,UGC 补充真实评价和避坑指南
 * 搜索结果缓存:相同城市 30 分钟内复用
 */

import { LRUCache } from "lru-cache";
import type { Attraction } from "../types/trip.js";
import { config } from "./config.js";
import { searchFreeSources } from "./free-sources/index.js";
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

// ─── 游览时长智能推断 ─────────────────────────────────────

/** 类型 → 基础游览时长(分钟) */
const VISIT_DURATION_MAP: Record<string, number> = {
  博物馆: 180,
  艺术画廊: 150,
  主题乐园: 360,
  公园: 90,
  自然风光: 120,
  宗教场所: 60,
  购物: 90,
  景点: 120,
};

/** 名称含这些关键词 → 额外加 60 分钟 */
const EXTENDED_KEYWORDS = ["大", "景区", "国家公园", "乐园", "度假区", "世界遗产", "5A"];

/** 根据类型和名称智能推断游览时长 */
export function inferVisitDuration(a: EnrichedAttraction): number {
  // 1. 已有真实时长 → 直接用
  if (a.visitDuration && a.visitDuration > 0) return a.visitDuration;

  // 2. 类型查表
  const base = VISIT_DURATION_MAP[a.category] ?? 120;

  // 3. 名称关键词加时
  const hasExtended = EXTENDED_KEYWORDS.some((kw) => a.nameZh.includes(kw));
  return hasExtended ? base + 60 : base;
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

/** 清除缓存(测试用) */
export function clearSearchCache(): void {
  searchCache.clear();
}

// ─── L1 + L1.5 融合 ───────────────────────────────────────

/**
 * 合并结构化数据源(Google Places + 免费数据源)
 *
 * 策略:
 *   1. 以名称相似度去重
 *   2. 互补填充:Google 提供坐标/地址,免费源补充价格/评分/描述
 *   3. 多源合并后保留各来源的置信度信息
 */
function mergeStructuredSources(primary: Attraction[], secondary: Attraction[]): Attraction[] {
  if (primary.length === 0) return secondary;
  if (secondary.length === 0) return primary;

  const result: Attraction[] = [...primary];
  const matchedSecondary = new Set<number>();

  // 预处理：构建次要源的名称索引（去括号后的小写名 → 索引列表）
  const secondaryByName = new Map<string, number[]>();
  for (let j = 0; j < secondary.length; j++) {
    const cleanName = secondary[j]!.nameZh.replace(/[（(].+?[）)]/g, "")
      .replace(/\s+/g, "")
      .toLowerCase();
    const indices = secondaryByName.get(cleanName) ?? [];
    indices.push(j);
    secondaryByName.set(cleanName, indices);
  }

  for (let i = 0; i < result.length; i++) {
    const target = result[i]!;
    const na = target.nameZh
      .replace(/[（(].+?[）)]/g, "")
      .replace(/\s+/g, "")
      .toLowerCase();

    // 快速路径：精确名称匹配（O(1) 查 Map）
    let matchIdx = -1;
    const exactMatches = secondaryByName.get(na);
    if (exactMatches) {
      matchIdx = exactMatches.find((j) => !matchedSecondary.has(j)) ?? -1;
    }

    // 慢路径：精确未命中时，遍历未匹配的次要源做子串 + 坐标距离
    if (matchIdx === -1) {
      for (let j = 0; j < secondary.length; j++) {
        if (matchedSecondary.has(j)) continue;
        const candidate = secondary[j]!;
        const nb = candidate.nameZh
          .replace(/[（(].+?[）)]/g, "")
          .replace(/\s+/g, "")
          .toLowerCase();

        const nameMatch = na.includes(nb) || nb.includes(na);
        const coordMatch =
          target.location.latitude !== 0 &&
          candidate.location.latitude !== 0 &&
          haversineMeters(
            target.location.latitude,
            target.location.longitude,
            candidate.location.latitude,
            candidate.location.longitude,
          ) < 500;

        if (nameMatch || coordMatch) {
          matchIdx = j;
          break;
        }
      }
    }

    if (matchIdx >= 0) {
      const candidate = secondary[matchIdx]!;
      const merged = { ...target };

      if (merged.ticketPrice === 0 && candidate.ticketPrice > 0) {
        merged.ticketPrice = candidate.ticketPrice;
      }
      if (
        candidate.description &&
        !merged.description.includes(candidate.description.slice(0, 20))
      ) {
        merged.description = `${merged.description}；${candidate.description}`.slice(0, 300);
      }
      if (merged.category === "景点" && candidate.category !== "景点") {
        merged.category = candidate.category;
      }
      if ((!merged.nameEn || merged.nameEn === merged.nameZh) && candidate.nameEn) {
        merged.nameEn = candidate.nameEn;
      }

      result[i] = merged;
      matchedSecondary.add(matchIdx);
    }
  }

  for (let j = 0; j < secondary.length; j++) {
    if (!matchedSecondary.has(j)) {
      result.push(secondary[j]!);
    }
  }

  return result;
}

/** Haversine 公式计算两点间距离（米） */
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000; // 地球半径（米）
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
    visitDuration: 0,
    description: p.editorial_summary?.overview ?? `${p.name}是${params.city}的热门景点`,
    category: mapCategory(p.types ?? []),
    ticketPrice: 0,
    reservationRequired: false,
    reservationTips: "",
  }));
}

// ─── L2: UGC 数据 ─────────────────────────────────────────

// ─── 融合 ─────────────────────────────────────────────────

/** 去重 - 以 nameZh 为 key */
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

/** 为景点附加 UGC 数据(优先真实 API,降级到 mock) */
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
        "[MultiSource] 小红书 API 调用失败,降级到 mock:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return attractions.map((a) => {
    const xhsReviews = xhsData.get(a.nameZh) ?? [];
    const mockReviews = getMockUGC(city, a.nameZh);

    // 合并:真实数据优先,mock 补充
    const allReviews = [...xhsReviews];
    for (const mock of mockReviews) {
      // 避免重复 source
      if (!allReviews.some((r) => r.source === mock.source)) {
        allReviews.push(mock);
      }
    }

    // 如果完全没有数据,添加默认 local_knowledge
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

  // L1.5: 免费数据源(Wikivoyage + OTM + 去哪儿 + Wikipedia)
  // 与 Google Places 合并去重,补充价格、评分、描述等
  try {
    const freeResult = await searchFreeSources(params.city, params.preferences);
    if (freeResult.attractions.length > 0) {
      // 将免费数据源结果与现有结果合并
      attractions = mergeStructuredSources(attractions, freeResult.attractions);
      sources.push(...freeResult.sources.map((s) => `free_${s}`));
    }
  } catch (err) {
    console.warn("[MultiSource] 免费数据源失败:", err instanceof Error ? err.message : err);
  }

  // Mock 基础数据(仅当以上均无数据时降级)
  if (attractions.length === 0) {
    attractions = getMockAttractions(params);
    sources.push("mock");
  }

  // L2: 附加 UGC(小红书 API + mock 降级)
  const enriched = await enrichWithUGC(attractions, params.city);
  if (enriched.some((e) => e.sources.includes("xiaohongshu_api"))) {
    sources.push("xiaohongshu");
  }
  if (enriched.some((e) => e.sources.includes("ugc_mock"))) {
    sources.push("ugc");
  }

  // 去重融合
  const fused = deduplicate(enriched);

  // 游览时长智能推断:融合后统一推断
  for (const a of fused) {
    a.visitDuration = inferVisitDuration(a);
  }

  const result: FusionResult = {
    attractions: fused,
    sources: [...new Set(sources)],
    fromCache: false,
  };

  // 写入缓存
  searchCache.set(key, { result, timestamp: Date.now() });

  return result;
}
