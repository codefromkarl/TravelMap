/**
 * Wikipedia Adapter — 景点历史文化百科数据
 *
 * 特点：完全免费、无需 Key、无限调用、无风控
 * 数据：景点历史、文化背景、详细描述
 * 用途：作为其他数据源的补充，提供丰富的描述信息
 *
 * API: https://zh.wikipedia.org/w/api.php
 */

import { fetchWithTimeout } from "../http-client.js";
import type { FreeSourceAttraction, FreeSourceSearchParams } from "./types.js";

const BASE_URL = "https://zh.wikipedia.org/w/api.php";

/** Wikipedia 地理搜索结果 */
interface WikiGeoSearchResult {
  pageid: number;
  title: string;
  lat: number;
  lon: number;
  dist: number;
}

/** Wikipedia 页面摘要 */
interface WikiExtract {
  pageid: number;
  title: string;
  extract: string;
  thumbnail?: { source: string; width: number; height: number };
  coordinates?: Array<{ lat: number; lon: number }>;
}

/**
 * 按坐标搜索附近的 Wikipedia 条目
 */
async function searchNearby(
  lat: number,
  lon: number,
  radius = 10000,
  limit = 20,
): Promise<WikiGeoSearchResult[]> {
  const url = new URL(BASE_URL);
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "geosearch");
  url.searchParams.set("gsradius", String(radius));
  url.searchParams.set("gscoord", `${lat}|${lon}`);
  url.searchParams.set("gslimit", String(limit));
  url.searchParams.set("format", "json");

  try {
    const res = await fetchWithTimeout(url.toString(), {
      timeout: 10_000,
      headers: {
        Accept: "application/json",
        "User-Agent": "TravelAgent/1.0 (travel planning bot)",
      },
    });

    if (!res.ok) return [];

    const body = (await res.json()) as {
      query?: { geosearch?: WikiGeoSearchResult[] };
    };

    return body.query?.geosearch ?? [];
  } catch {
    return [];
  }
}

/**
 * 按关键词搜索 Wikipedia
 */
async function searchByKeyword(
  keyword: string,
  limit = 10,
): Promise<Array<{ pageid: number; title: string }>> {
  const url = new URL(BASE_URL);
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", keyword);
  url.searchParams.set("srnamespace", "0");
  url.searchParams.set("srlimit", String(limit));
  url.searchParams.set("format", "json");

  try {
    const res = await fetchWithTimeout(url.toString(), {
      timeout: 10_000,
      headers: {
        Accept: "application/json",
        "User-Agent": "TravelAgent/1.0 (travel planning bot)",
      },
    });

    if (!res.ok) return [];

    const body = (await res.json()) as {
      query?: { search?: Array<{ pageid: number; title: string }> };
    };

    return body.query?.search ?? [];
  } catch {
    return [];
  }
}

/**
 * 获取页面摘要（含描述、图片、坐标）
 */
async function getExtracts(pageIds: number[]): Promise<WikiExtract[]> {
  if (pageIds.length === 0) return [];

  const url = new URL(BASE_URL);
  url.searchParams.set("action", "query");
  url.searchParams.set("pageids", pageIds.join("|"));
  url.searchParams.set("prop", "extracts|pageimages|coordinates");
  url.searchParams.set("exintro", "true");
  url.searchParams.set("explaintext", "true");
  url.searchParams.set("exsentences", "5");
  url.searchParams.set("piprop", "thumbnail");
  url.searchParams.set("pithumbsize", "300");
  url.searchParams.set("format", "json");

  try {
    const res = await fetchWithTimeout(url.toString(), {
      timeout: 10_000,
      headers: {
        Accept: "application/json",
        "User-Agent": "TravelAgent/1.0 (travel planning bot)",
      },
    });

    if (!res.ok) return [];

    const body = (await res.json()) as {
      query?: { pages?: Record<string, WikiExtract> };
    };

    const pages = body.query?.pages;
    if (!pages) return [];

    return Object.values(pages).filter((p) => p.pageid > 0 && p.extract);
  } catch {
    return [];
  }
}

/**
 * 判断 Wikipedia 条目是否为景点/旅游相关
 */
function isTourismRelated(title: string, extract: string): boolean {
  const text = `${title} ${extract}`;
  // 正面信号：包含旅游相关词汇
  const positivePatterns =
    /景[点区]|旅游|名胜|古迹|遗产|景点|博物|公园|寺|庙|教堂|长城|故宫|园林|遗址|瀑布|湖[泊]?|山[峰]?|海[滩]?|塔|楼|阁|广[场](?:场)|纪[念念馆]|陵|墓|殿|堂|院|桥|城墙|城堡|皇宫|行宫|行宫|温泉|滑雪|度假|名胜|风景区|5A|4A|AAA/;
  // 负面信号：非旅游类条目
  const negativePatterns =
    /^(?!.*(?:景区|景点|公园|博物馆|寺|庙|长城|故宫|遗址|古迹|遗产)).*(?:行政区划|街道|车站|机场|医院|学校|企业|公司|品牌|人物|电影|电视剧|小说|歌曲|专辑)/;

  return positivePatterns.test(text) && !negativePatterns.test(text);
}

// ─── 公开 API ─────────────────────────────────────────────

/**
 * 搜索 Wikipedia 景点数据
 */
export async function searchWikipedia(
  params: FreeSourceSearchParams,
): Promise<FreeSourceAttraction[]> {
  const { city, cityLocation, keywords } = params;
  const attractions: FreeSourceAttraction[] = [];
  const seenTitles = new Set<string>();

  // 策略 1: 如果有坐标，地理搜索附近景点
  if (cityLocation) {
    const geoResults = await searchNearby(cityLocation.latitude, cityLocation.longitude, 10000, 20);

    if (geoResults.length > 0) {
      const pageIds = geoResults.map((r) => r.pageid);
      const extracts = await getExtracts(pageIds);

      for (const ext of extracts) {
        if (seenTitles.has(ext.title)) continue;
        if (!isTourismRelated(ext.title, ext.extract)) continue;

        seenTitles.add(ext.title);
        const geoItem = geoResults.find((g) => g.pageid === ext.pageid);

        attractions.push({
          nameZh: ext.title,
          description: ext.extract.slice(0, 300),
          location: geoItem
            ? { latitude: geoItem.lat, longitude: geoItem.lon }
            : ext.coordinates?.[0]
              ? { latitude: ext.coordinates[0].lat, longitude: ext.coordinates[0].lon }
              : undefined,
          imageUrl: ext.thumbnail?.source,
          source: "wikipedia",
          confidence: ext.extract.length > 100 ? "high" : "medium",
          raw: { pageid: ext.pageid, dist: geoItem?.dist },
        });
      }
    }
  }

  // 策略 2: 关键词搜索 "城市 旅游景点"
  const searchKeyword = keywords ?? `${city} 旅游景点`;
  const searchResults = await searchByKeyword(searchKeyword, 10);

  if (searchResults.length > 0) {
    const pageIds = searchResults.map((r) => r.pageid);
    const extracts = await getExtracts(pageIds);

    for (const ext of extracts) {
      if (seenTitles.has(ext.title)) continue;
      if (!isTourismRelated(ext.title, ext.extract)) continue;

      seenTitles.add(ext.title);
      attractions.push({
        nameZh: ext.title,
        description: ext.extract.slice(0, 300),
        location: ext.coordinates?.[0]
          ? { latitude: ext.coordinates[0].lat, longitude: ext.coordinates[0].lon }
          : undefined,
        imageUrl: ext.thumbnail?.source,
        source: "wikipedia",
        confidence: ext.extract.length > 100 ? "medium" : "low",
        raw: { pageid: ext.pageid },
      });
    }
  }

  return attractions.slice(0, 20);
}

/**
 * 获取特定景点/地点的 Wikipedia 描述（供融合引擎补充 description 使用）
 */
export async function getPlaceDescription(placeName: string): Promise<string | null> {
  const url = new URL(BASE_URL);
  url.searchParams.set("action", "query");
  url.searchParams.set("titles", placeName);
  url.searchParams.set("prop", "extracts");
  url.searchParams.set("exintro", "true");
  url.searchParams.set("explaintext", "true");
  url.searchParams.set("exsentences", "3");
  url.searchParams.set("format", "json");
  url.searchParams.set("redirects", "true");

  try {
    const res = await fetchWithTimeout(url.toString(), {
      timeout: 8_000,
      headers: {
        Accept: "application/json",
        "User-Agent": "TravelAgent/1.0 (travel planning bot)",
      },
    });

    if (!res.ok) return null;

    const body = (await res.json()) as {
      query?: { pages?: Record<string, { extract?: string }> };
    };

    const pages = body.query?.pages;
    if (!pages) return null;

    const page = Object.values(pages)[0];
    return page?.extract ?? null;
  } catch {
    return null;
  }
}

/**
 * 健康检查
 */
export async function wikipediaHealthCheck(): Promise<boolean> {
  try {
    const url = new URL(BASE_URL);
    url.searchParams.set("action", "query");
    url.searchParams.set("titles", "Main Page");
    url.searchParams.set("format", "json");

    const res = await fetchWithTimeout(url.toString(), {
      timeout: 5_000,
      headers: { "User-Agent": "TravelAgent/1.0" },
    });

    return res.ok;
  } catch {
    return false;
  }
}
