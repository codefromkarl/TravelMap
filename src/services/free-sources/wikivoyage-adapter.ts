/**
 * Wikivoyage Adapter — Wikimedia 旅行攻略 API
 *
 * 特点：完全免费、无需 Key、无限调用、无风控
 * 数据：14万+ 篇人工编写旅行攻略，含推荐路线/景点/餐饮/交通
 *
 * API: https://zh.wikivoyage.org/w/api.php
 */

import { fetchWithTimeout } from "../http-client.js";
import type { FreeSourceAttraction, FreeSourceSearchParams } from "./types.js";

const BASE_URL = "https://zh.wikivoyage.org/w/api.php";

/**
 * 获取 Wikivoyage 城市攻略的原始 wikitext
 */
async function fetchCityPage(city: string): Promise<string | null> {
  const url = new URL(BASE_URL);
  url.searchParams.set("action", "parse");
  url.searchParams.set("page", city);
  url.searchParams.set("prop", "wikitext");
  url.searchParams.set("format", "json");
  url.searchParams.set("redirects", "true");

  try {
    const res = await fetchWithTimeout(url.toString(), {
      timeout: 20_000,
      headers: {
        Accept: "application/json",
        "User-Agent": "TravelAgent/1.0 (travel planning bot)",
      },
    });

    if (!res.ok) return null;

    const body = (await res.json()) as {
      error?: { code: string };
      parse?: { wikitext?: { "*": string } };
    };

    if (body.error || !body.parse?.wikitext) return null;

    return body.parse.wikitext["*"];
  } catch (err) {
    console.warn("[Wikivoyage] fetchCityPage failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * 从 wikitext 中提取景点列表
 *
 * Wikivoyage 景点通常在 "==景点==" 段落下，格式为列表项：
 *   * '''景点名''' — 描述
 *   * [[景点名]] - 描述
 */
function extractAttractionsFromWikitext(wikitext: string, city: string): FreeSourceAttraction[] {
  const attractions: FreeSourceAttraction[] = [];

  // 匹配景点段落（== 景点 == / === 景点 === 或类似标题）
  const sectionPatterns = [
    /==+\s*(?:景点|观光|观光景点|旅游|必游|景点和地标|目的地|名胜|景区|旅游指南)[^=]*==+/gi,
  ];

  let sectionMatch: RegExpExecArray | null;
  let sectionContent = "";

  for (const pattern of sectionPatterns) {
    sectionMatch = pattern.exec(wikitext);
    if (sectionMatch) {
      const startIdx = sectionMatch.index + sectionMatch[0].length;
      const nextSection = wikitext.slice(startIdx).match(/==[^=]/);
      const endIdx = nextSection ? startIdx + (nextSection.index ?? 0) : wikitext.length;
      sectionContent = wikitext.slice(startIdx, endIdx);
      break;
    }
  }

  // 如果没找到专门的景点段落，就用整个 wikitext（{{see}} 模板会在全局搜索）
  if (!sectionContent) {
    sectionContent = ""; // {{see}} 模板会从 wikitext 全局搜索
  }

  const seen = new Set<string>();

  // 策略 0: 从整个 wikitext 提取 {{see}} 模板（Wikivoyage 最标准的景点格式）
  // 格式: {{see | name=景点名 | address=地址 | lat=纬度 | long=经度 | content=描述 }}
  const seeTemplatePattern = /\{\{see\s*\|([\s\S]*?)\}\}/gi;
  for (
    let seeMatch = seeTemplatePattern.exec(wikitext);
    seeMatch !== null;
    seeMatch = seeTemplatePattern.exec(wikitext)
  ) {
    const body = seeMatch[1];
    const getField = (field: string): string | undefined => {
      const m = body.match(new RegExp(`(?:^|\\|)\\s*${field}\\s*=\\s*([^|}]*)`, "i"));
      return m?.[1]?.trim() || undefined;
    };

    const name = getField("name");
    if (!name || name.length < 2 || seen.has(name)) continue;

    seen.add(name);
    const desc = getField("content") ?? "";
    const address = getField("address");
    const lat = getField("lat");
    const lon = getField("long");

    attractions.push({
      nameZh: name,
      description: cleanWikiText(desc).slice(0, 200) || `${name}是${city}值得游览的景点`,
      address: address ? cleanWikiText(address) : undefined,
      location:
        lat && lon
          ? { latitude: Number.parseFloat(lat), longitude: Number.parseFloat(lon) }
          : undefined,
      category: guessCategory(name, desc),
      source: "wikivoyage",
      confidence: desc.length > 10 ? "high" : "medium",
      raw: { template: "see", name, address },
    });
  }

  // 策略 1: 提取列表项中的景点：* '''景点名''' 或 * [[景点名]]
  const itemPattern = /\*\s*\[\[([^\]|]+)(?:\|[^\]]+)?\]\]\s*[—\-–]\s*(.+)/g;
  const boldPattern = /\*\s*'''(.+?)'''\s*[—\-–]\s*(.+)/g;
  const simpleListPattern = /\*\s*\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]\s*[：:,，]?\s*(.*)/g;

  // 先匹配有描述的（高置信度）
  for (const pattern of [itemPattern, boldPattern]) {
    for (
      let match: RegExpExecArray | null = pattern.exec(sectionContent);
      match !== null;
      match = pattern.exec(sectionContent)
    ) {
      const name = cleanWikiText(match[1]).trim();
      const desc = cleanWikiText(match[2]).trim();

      if (name.length < 2 || name.length > 30 || seen.has(name)) continue;
      // 过滤非景点项
      if (/^(http|www|电话|地址|开放|门票|价格|交通|地铁|公交|建议|注意)/.test(name)) continue;

      seen.add(name);
      attractions.push({
        nameZh: name,
        description: desc.slice(0, 200),
        category: guessCategory(name, desc),
        source: "wikivoyage",
        confidence: desc.length > 10 ? "high" : "medium",
        raw: { wikitext: match[0] },
      });
    }
  }

  // 再匹配简单列表项
  for (
    let simpleMatch: RegExpExecArray | null = simpleListPattern.exec(sectionContent);
    simpleMatch !== null;
    simpleMatch = simpleListPattern.exec(sectionContent)
  ) {
    const name = cleanWikiText(simpleMatch[1]).trim();
    const desc = cleanWikiText(simpleMatch[2]).trim();

    if (name.length < 2 || name.length > 30 || seen.has(name)) continue;
    if (/^(http|www|电话|地址|开放|门票|价格|交通)/.test(name)) continue;

    seen.add(name);
    attractions.push({
      nameZh: name,
      description: desc.slice(0, 200) || `${name}是${city}值得游览的景点`,
      category: guessCategory(name, desc),
      source: "wikivoyage",
      confidence: desc.length > 10 ? "medium" : "low",
      raw: { wikitext: simpleMatch[0] },
    });
  }

  return attractions.slice(0, 20);
}

/** 清除 wikitext 标记 */
function cleanWikiText(text: string): string {
  return text
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2") // [[link|text]] → text
    .replace(/\[\[([^\]]+)\]\]/g, "$1") // [[link]] → link
    .replace(/'''(.+?)'''/g, "$1") // '''bold''' → bold
    .replace(/''(.+?)''/g, "$1") // ''italic'' → italic
    .replace(/\{\{.+?\}\}/g, "") // {{template}}
    .replace(/<ref.*?<\/ref>/g, "") // <ref>...</ref>
    .replace(/<.*?>/g, "") // HTML tags
    .replace(/\[https?:\/\/\S+\s+(.+?)\]/g, "$1") // [url text]
    .replace(/\[https?:\/\/\S+\]/g, "") // [url]
    .trim();
}

/** 从名称和描述推测景点分类 */
function guessCategory(name: string, desc: string): string {
  const text = `${name} ${desc}`;
  if (/博物馆|博物院|美术馆|展览馆/.test(text)) return "博物馆";
  if (/公园|花园|绿地/.test(text)) return "公园";
  if (/寺|庙|观|教堂|清真寺|教堂/.test(text)) return "宗教场所";
  if (/长城|遗址|古迹|古城|遗迹/.test(text)) return "历史遗迹";
  if (/湖|河|瀑布|山|峰|峡|湾|海滩/.test(text)) return "自然风光";
  if (/塔|楼|阁|门|桥|广场|地标/.test(text)) return "地标";
  if (/园|苑|园林/.test(text)) return "园林";
  if (/街|路|巷|道|市场|夜市/.test(text)) return "街区";
  return "景点";
}

/**
 * 从 Wikivoyage 提取城市描述和推荐路线信息
 */
async function fetchCityInfo(city: string): Promise<string | null> {
  const url = new URL(BASE_URL);
  url.searchParams.set("action", "query");
  url.searchParams.set("titles", city);
  url.searchParams.set("prop", "extracts");
  url.searchParams.set("exintro", "true");
  url.searchParams.set("explaintext", "true");
  url.searchParams.set("format", "json");
  url.searchParams.set("redirects", "true");

  try {
    const res = await fetchWithTimeout(url.toString(), {
      timeout: 10_000,
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

// ─── 公开 API ─────────────────────────────────────────────

/**
 * 搜索 Wikivoyage 景点数据
 */
export async function searchWikivoyage(
  params: FreeSourceSearchParams,
): Promise<FreeSourceAttraction[]> {
  const { city } = params;

  const [wikitext, _cityInfo] = await Promise.all([fetchCityPage(city), fetchCityInfo(city)]);

  if (!wikitext) return [];

  return extractAttractionsFromWikitext(wikitext, city);
}

/**
 * 健康检查 — 请求一个必定存在的页面
 */
export async function wikivoyageHealthCheck(): Promise<boolean> {
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
