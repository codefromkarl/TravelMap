/**
 * OpenTripMap Adapter — 全球 POI 数据库
 *
 * 特点：免费 Key，5000次/天，无风控
 * 数据：聚合 OpenStreetMap + Wikipedia + Wikidata，1000万+ POI
 * 覆盖：全球，中国数据较好
 *
 * API: https://api.opentripmap.com/0.1/zh/places/
 * 注册：https://dev.opentripmap.org/ (免费)
 */

import { config } from "../config.js";
import { fetchWithTimeout } from "../http-client.js";
import type { FreeSourceAttraction, FreeSourceSearchParams } from "./types.js";

const BASE_URL = "https://api.opentripmap.com/0.1/zh/places";

/** OTM POI 列表项 */
interface OtmFeature {
  name?: string;
  point?: { lat: number; lon: number };
  kinds?: string;
  rate?: string;
  osm?: string;
  wikidata?: string;
  xid?: string;
}

/** OTM POI 详情 */
interface OtmPlaceDetail {
  name?: string;
  address?: { city?: string; road?: string; state?: string; country?: string };
  point?: { lat: number; lon: number };
  kinds?: string;
  rate?: string;
  info?: { descr?: string; image?: string };
  url?: string;
  wikipedia?: string;
  preview?: { source?: string };
  otm?: string;
}

/** OTM kinds 到分类映射 */
const KIND_CATEGORY_MAP: Record<string, string> = {
  museums: "博物馆",
  theatres_and_entertainments: "文化场馆",
  historic: "历史遗迹",
  architecture: "建筑",
  religion: "宗教场所",
  natural: "自然风光",
  parks: "公园",
  gardens: "园林",
  amusement_parks: "主题乐园",
  sport: "体育场馆",
  foods: "美食",
  shops: "购物",
  hotels: "住宿",
};

function mapOtmKinds(kinds: string): string {
  const kindList = kinds.split(",");
  for (const kind of kindList) {
    const mapped = KIND_CATEGORY_MAP[kind.trim()];
    if (mapped) return mapped;
  }
  return "景点";
}

/** 从 rate 字段推导评分（OTM rate 1-3，映射到 3-5 分） */
function rateToScore(rate: string): number | undefined {
  const r = Number.parseInt(rate, 10);
  if (Number.isNaN(r)) return undefined;
  // rate 3 = 最知名 → 4.8, rate 2 = 中等 → 4.2, rate 1 = 一般 → 3.5
  if (r >= 3) return 4.8;
  if (r >= 2) return 4.2;
  return 3.5;
}

/**
 * 按坐标半径搜索 POI
 */
async function searchByRadius(
  lat: number,
  lon: number,
  radius: number,
  apiKey: string,
): Promise<OtmFeature[]> {
  const url = new URL(`${BASE_URL}/radius`);
  url.searchParams.set("radius", String(radius));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("rate", "2"); // 仅中等及以上知名度
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "20");

  const res = await fetchWithTimeout(url.toString(), { timeout: 10_000 });
  if (!res.ok) throw new Error(`OTM radius search error: ${res.status}`);

  return (await res.json()) as OtmFeature[];
}

/**
 * 按城市名搜索 POI（geoname）
 */
async function searchByCityName(
  city: string,
  apiKey: string,
): Promise<Array<{ lat: number; lon: number }>> {
  const url = new URL(`${BASE_URL}/geoname`);
  url.searchParams.set("name", city);
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("lang", "zh");

  const res = await fetchWithTimeout(url.toString(), { timeout: 10_000 });
  if (!res.ok) return [];

  const body = (await res.json()) as Array<{ lat: number; lon: number }>;
  return body;
}

/**
 * 获取 POI 详情
 */
async function getPlaceDetail(xid: string, apiKey: string): Promise<OtmPlaceDetail | null> {
  const url = `${BASE_URL}/xid/${xid}?apikey=${apiKey}`;

  try {
    const res = await fetchWithTimeout(url, { timeout: 8_000 });
    if (!res.ok) return null;
    return (await res.json()) as OtmPlaceDetail;
  } catch {
    return null;
  }
}

// ─── 公开 API ─────────────────────────────────────────────

/**
 * 搜索 OpenTripMap 景点
 */
export async function searchOpenTripMap(
  params: FreeSourceSearchParams,
): Promise<FreeSourceAttraction[]> {
  const apiKey = config.openTripMapApiKey;
  if (!apiKey) return [];

  const { city, cityLocation } = params;

  // 获取城市坐标
  let lat: number | undefined;
  let lon: number | undefined;

  if (cityLocation) {
    lat = cityLocation.latitude;
    lon = cityLocation.longitude;
  } else {
    const geoResults = await searchByCityName(city, apiKey);
    if (geoResults.length > 0) {
      lat = geoResults[0].lat;
      lon = geoResults[0].lon;
    }
  }

  if (lat === undefined || lon === undefined) return [];

  // 搜索 15km 半径内的 POI
  const features = await searchByRadius(lat, lon, 15000, apiKey);
  if (features.length === 0) return [];

  // 批量获取详情（最多 10 个，控制请求数）
  const detailPromises = features
    .filter((f) => f.name && f.xid)
    .slice(0, 10)
    .map((f) => getPlaceDetail(f.xid!, apiKey));

  const details = await Promise.allSettled(detailPromises);

  const attractions: FreeSourceAttraction[] = [];

  for (const result of details) {
    if (result.status !== "fulfilled" || !result.value) continue;
    const d = result.value;
    if (!d.name) continue;

    // 过滤非景点类型（住宿、餐饮等）
    const kinds = d.kinds ?? "";
    if (
      /hotels|foods|shops|sport/.test(kinds) &&
      !/museums|historic|architecture|natural|parks/.test(kinds)
    ) {
      continue;
    }

    attractions.push({
      nameZh: d.name,
      address: d.address ? [d.address.road, d.address.city].filter(Boolean).join(", ") : undefined,
      location: d.point ? { latitude: d.point.lat, longitude: d.point.lon } : undefined,
      description: d.info?.descr?.slice(0, 200),
      category: mapOtmKinds(kinds),
      rating: rateToScore(d.rate ?? "1"),
      imageUrl: d.preview?.source,
      source: "opentripmap",
      confidence: Number.parseInt(d.rate ?? "1", 10) >= 3 ? "high" : "medium",
      raw: { xid: (d as Record<string, unknown>).xid ?? (d as Record<string, unknown>).otm, kinds },
    });
  }

  return attractions;
}

/**
 * 健康检查
 */
export async function openTripMapHealthCheck(): Promise<boolean> {
  const apiKey = config.openTripMapApiKey;
  if (!apiKey) return false;

  try {
    const url = `${BASE_URL}/geoname?name=Beijing&apikey=${apiKey}`;
    const res = await fetchWithTimeout(url, { timeout: 5_000 });
    return res.ok;
  } catch {
    return false;
  }
}
