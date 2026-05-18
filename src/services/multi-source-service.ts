/**
 * 多数据源景点融合服务
 *
 * L1 结构化: Google Places API（基础景点信息）
 * L2 UGC: 小红书/TripAdvisor 风格的模拟点评（Phase 3 用 mock，后续接真实 API）
 * 融合策略：结构化数据为基础，UGC 补充真实评价和避坑指南
 * 搜索结果缓存：相同城市 30 分钟内复用
 */

import type { Attraction } from "../types/trip.js";

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

const CACHE_TTL = 30 * 60 * 1000; // 30 分钟
const searchCache = new Map<string, CacheEntry>();

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

  const res = await fetch(url.toString());
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

/** Mock UGC 数据 — 模拟小红书/TripAdvisor 风格点评 */
const MOCK_UGC: Record<string, Record<string, UGCReview[]>> = {
  北京: {
    故宫博物院: [
      {
        source: "tripadvisor",
        summary: "必去的世界级景点，建筑宏伟壮观",
        rating: 4.8,
        tips: "建议从午门进神武门出，全程3小时起步",
      },
      {
        source: "xiaohongshu",
        summary: "拍照超级出片！红墙黄瓦绝美",
        rating: 4.9,
        tips: "建议工作日去，周末人超多。提前7天抢票！",
      },
    ],
    天坛公园: [
      {
        source: "tripadvisor",
        summary: "祈年殿非常壮观，值得一看",
        rating: 4.6,
        tips: "联票含祈年殿更划算",
      },
      {
        source: "local_knowledge",
        summary: "清晨有很多当地老人晨练，氛围很好",
        rating: 4.5,
        tips: "建议早上8点前到，人少景美",
      },
    ],
    颐和园: [
      {
        source: "xiaohongshu",
        summary: "昆明湖畔散步太惬意了",
        rating: 4.7,
        tips: "坐船游湖是最佳体验，30元/人",
      },
      {
        source: "tripadvisor",
        summary: "皇家园林的典范，四季皆宜",
        rating: 4.7,
        tips: "建议走苏州街-四大部洲-佛香阁路线",
      },
    ],
    八达岭长城: [
      {
        source: "xiaohongshu",
        summary: "不到长城非好汉！但真的很累",
        rating: 4.5,
        tips: "穿舒适的运动鞋，带足水",
      },
      {
        source: "tripadvisor",
        summary: "世界奇迹，一生必去一次",
        rating: 4.6,
        tips: "建议坐缆车上去，步行下来",
      },
    ],
  },
  上海: {
    外滩: [
      {
        source: "xiaohongshu",
        summary: "夜景绝美！一定要晚上去",
        rating: 4.8,
        tips: "7-9点灯光最漂亮，周末人山人海",
      },
      {
        source: "tripadvisor",
        summary: "上海必到打卡点，万国建筑群",
        rating: 4.7,
        tips: "可以坐轮渡到对岸，2元体验浦江风景",
      },
    ],
    豫园: [
      {
        source: "xiaohongshu",
        summary: "小笼包发源地！南翔馒头店必吃",
        rating: 4.6,
        tips: "园内逛1小时足够，重点在周边小吃",
      },
      {
        source: "local_knowledge",
        summary: "城隍庙商圈比园林本身更有逛头",
        rating: 4.3,
        tips: "避开节假日，否则只能看人头",
      },
    ],
  },
};

/** 获取 UGC 数据 */
function fetchUGC(city: string, attractionName: string): UGCReview[] {
  return (
    MOCK_UGC[city]?.[attractionName] ?? [
      {
        source: "local_knowledge",
        summary: `${attractionName}是${city}值得游览的地方`,
        rating: 4.0,
        tips: "建议提前查询开放时间和门票信息",
      },
    ]
  );
}

// ─── 基础 Mock 数据 ──────────────────────────────────────

function mockAttractions(params: AttractionSearchParams): Attraction[] {
  const city = params.city;
  const data: Record<string, Attraction[]> = {
    北京: [
      {
        name: "故宫博物院",
        nameZh: "故宫博物院",
        nameEn: "The Palace Museum",
        address: "北京市东城区景山前街4号",
        location: { latitude: 39.9163, longitude: 116.3972 },
        visitDuration: 180,
        description: "中国明清两代的皇家宫殿，世界文化遗产",
        category: "博物馆",
        ticketPrice: 60,
        reservationRequired: true,
        reservationTips: "需提前在官网预约",
      },
      {
        name: "天坛公园",
        nameZh: "天坛公园",
        nameEn: "Temple of Heaven",
        address: "北京市东城区天坛内东里7号",
        location: { latitude: 39.8822, longitude: 116.4066 },
        visitDuration: 120,
        description: "明清两朝帝王祭天祈谷的场所",
        category: "历史遗迹",
        ticketPrice: 34,
        reservationRequired: false,
        reservationTips: "",
      },
      {
        name: "颐和园",
        nameZh: "颐和园",
        nameEn: "Summer Palace",
        address: "北京市海淀区新建宫门路19号",
        location: { latitude: 39.9999, longitude: 116.2755 },
        visitDuration: 180,
        description: "中国古典园林之首，清代皇家园林",
        category: "公园",
        ticketPrice: 30,
        reservationRequired: false,
        reservationTips: "",
      },
      {
        name: "八达岭长城",
        nameZh: "八达岭长城",
        nameEn: "Badaling Great Wall",
        address: "北京市延庆区",
        location: { latitude: 40.3539, longitude: 116.0064 },
        visitDuration: 240,
        description: "万里长城最具代表性的段落",
        category: "历史遗迹",
        ticketPrice: 40,
        reservationRequired: true,
        reservationTips: "建议提前在网上购票",
      },
      {
        name: "天安门广场",
        nameZh: "天安门广场",
        nameEn: "Tiananmen Square",
        address: "北京市东城区",
        location: { latitude: 39.9054, longitude: 116.3976 },
        visitDuration: 60,
        description: "世界上最大的城市广场之一",
        category: "地标",
        ticketPrice: 0,
        reservationRequired: false,
        reservationTips: "",
      },
    ],
    上海: [
      {
        name: "外滩",
        nameZh: "外滩",
        nameEn: "The Bund",
        address: "上海市黄浦区中山东一路",
        location: { latitude: 31.2397, longitude: 121.4918 },
        visitDuration: 90,
        description: "上海地标，万国建筑群",
        category: "地标",
        ticketPrice: 0,
        reservationRequired: false,
        reservationTips: "",
      },
      {
        name: "豫园",
        nameZh: "豫园",
        nameEn: "Yu Garden",
        address: "上海市黄浦区安仁街137号",
        location: { latitude: 31.2272, longitude: 121.4929 },
        visitDuration: 120,
        description: "明代私家园林",
        category: "园林",
        ticketPrice: 40,
        reservationRequired: false,
        reservationTips: "",
      },
      {
        name: "东方明珠塔",
        nameZh: "东方明珠塔",
        nameEn: "Oriental Pearl Tower",
        address: "上海市浦东新区世纪大道1号",
        location: { latitude: 31.2397, longitude: 121.4998 },
        visitDuration: 90,
        description: "上海标志性建筑",
        category: "地标",
        ticketPrice: 199,
        reservationRequired: false,
        reservationTips: "",
      },
    ],
  };

  return (
    data[city] ?? [
      {
        name: `${city}中心公园`,
        nameZh: `${city}中心公园`,
        nameEn: `${city} Central Park`,
        address: `${city}市中心`,
        location: { latitude: 31.23, longitude: 121.47 },
        visitDuration: 120,
        description: `${city}的主要城市公园`,
        category: "公园",
        ticketPrice: 0,
        reservationRequired: false,
        reservationTips: "",
      },
    ]
  );
}

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

/** 为景点附加 UGC 数据 */
function enrichWithUGC(attractions: Attraction[], city: string): EnrichedAttraction[] {
  return attractions.map((a) => ({
    ...a,
    ugcReviews: fetchUGC(city, a.nameZh),
    sources: ["structured"],
  }));
}

// ─── 主入口 ───────────────────────────────────────────────

export async function searchAttractionsMultiSource(
  params: AttractionSearchParams,
): Promise<FusionResult> {
  // 检查缓存
  const key = cacheKey(params);
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { ...cached.result, fromCache: true };
  }

  const sources: string[] = [];
  let attractions: Attraction[] = [];

  // L1: Google Places
  const googleKey = process.env.GOOGLE_MAPS_API_KEY;
  if (googleKey) {
    try {
      attractions = await fetchGooglePlaces(params, googleKey);
      sources.push("google_places");
    } catch (err) {
      console.warn("[MultiSource] Google Places failed:", err);
    }
  }

  // Mock 基础数据
  if (attractions.length === 0) {
    attractions = mockAttractions(params);
    sources.push("mock");
  }

  // L2: 附加 UGC
  const enriched = enrichWithUGC(attractions, params.city);
  sources.push("ugc");

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
