/**
 * 景点搜索服务 — Google Places API (Text Search)
 *
 * 备选：当无 API Key 时返回 mock 数据
 */

import type { Attraction } from "../types/trip.js";

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

  const res = await fetch(url.toString());
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

/** Mock 数据 — 当无 API Key 时使用 */
function mockAttractions(params: AttractionSearchParams): Attraction[] {
  const city = params.city;
  const mockData: Record<string, Attraction[]> = {
    北京: [
      {
        name: "故宫博物院",
        nameZh: "故宫博物院",
        nameEn: "The Palace Museum",
        address: "北京市东城区景山前街4号",
        location: { latitude: 39.9163, longitude: 116.3972 },
        visitDuration: 180,
        description: "中国明清两代的皇家宫殿，世界上现存规模最大、保存最完整的木质结构古建筑群",
        category: "博物馆",
        ticketPrice: 60,
        reservationRequired: true,
        reservationTips: "需提前在官网预约，旺季建议提前7天",
      },
      {
        name: "天坛公园",
        nameZh: "天坛公园",
        nameEn: "Temple of Heaven",
        address: "北京市东城区天坛内东里7号",
        location: { latitude: 39.8822, longitude: 116.4066 },
        visitDuration: 120,
        description: "明清两朝帝王祭天祈谷的场所，世界文化遗产",
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
        address: "北京市延庆区G6京藏高速58号出口",
        location: { latitude: 40.3539, longitude: 116.0064 },
        visitDuration: 240,
        description: "万里长城最具代表性的段落，世界文化遗产",
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
        description: "世界上最大的城市广场之一，中国的象征",
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
        description: "上海地标，可观赏浦东天际线和欧式建筑群",
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
        description: "明代私家园林，江南古典园林代表",
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
        description: "上海标志性建筑，可俯瞰全城",
        category: "地标",
        ticketPrice: 199,
        reservationRequired: false,
        reservationTips: "",
      },
    ],
  };

  const cityAttractions = mockData[city];
  if (cityAttractions) {
    // 按偏好过滤
    if (params.preferences?.length) {
      return cityAttractions;
    }
    return cityAttractions;
  }

  // 通用 mock
  return [
    {
      name: `${city}中心公园`,
      nameZh: `${city}中心公园`,
      nameEn: `${city} Central Park`,
      address: `${city}市中心`,
      location: { latitude: 31.23, longitude: 121.47 },
      visitDuration: 120,
      description: `${city}的主要城市公园，适合休闲游览`,
      category: "公园",
      ticketPrice: 0,
      reservationRequired: false,
      reservationTips: "",
    },
  ];
}

/** 搜索景点 — 主入口 */
export async function searchAttractions(params: AttractionSearchParams): Promise<{
  attractions: Attraction[];
  source: string;
}> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (apiKey) {
    try {
      const attractions = await fetchFromGoogle(params, apiKey);
      return { attractions, source: "google_places" };
    } catch (err) {
      console.warn("[AttractionService] Google Places API failed, using mock:", err);
    }
  }

  return { attractions: mockAttractions(params), source: "mock" };
}
