/**
 * 去哪儿门票页 Adapter — 景点价格+评分+销量
 *
 * 特点：公开页面，无需登录，无 Key，反爬极弱
 * 数据：景点名、门票价格、评分、销量、地址
 *
 * URL: https://piao.qunar.com/ticket/list.htm?keyword=北京
 */

import { fetchWithTimeout } from "../http-client.js";
import type { FreeSourceAttraction, FreeSourceSearchParams } from "./types.js";

const BASE_URL = "https://piao.qunar.com/ticket/list.htm";

/** 去哪儿搜索结果 HTML 中提取的景点信息 */
interface QunarRawItem {
  name: string;
  address?: string;
  price?: number;
  rating?: number;
  commentCount?: number;
  sales?: number;
  category?: string;
  highlight?: string;
}

/**
 * 搜索去哪儿门票列表页
 */
async function fetchTicketList(keyword: string, page = 1): Promise<string | null> {
  const url = new URL(BASE_URL);
  url.searchParams.set("keyword", keyword);
  url.searchParams.set("page", String(page));

  try {
    const res = await fetchWithTimeout(url.toString(), {
      timeout: 10_000,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * 从 HTML 中提取景点数据
 *
 * 去哪儿门票页面的数据通常嵌入在 JSON 中的 window.__INITIAL_STATE__ 或
 * 内联的 JSON-LD 结构化数据中。这里使用正则提取。
 */
function parseTicketHtml(html: string, _city: string): QunarRawItem[] {
  const items: QunarRawItem[] = [];

  // 策略 1: 提取 JSON-LD 结构化数据
  const jsonLdPattern = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;

  for (
    let jsonLdMatch: RegExpExecArray | null = jsonLdPattern.exec(html);
    jsonLdMatch !== null;
    jsonLdMatch = jsonLdPattern.exec(html)
  ) {
    try {
      const jsonStr = jsonLdMatch[1];
      const data = JSON.parse(jsonStr) as Record<string, unknown>;

      // @context 包含 schema.org
      if (data["@type"] === "Product" || data["@type"] === "TouristAttraction") {
        const offers = data.offers as Record<string, unknown> | undefined;
        const aggRating = data.aggregateRating as Record<string, unknown> | undefined;

        items.push({
          name: String(data.name ?? ""),
          price: offers ? Number.parseFloat(String(offers.price ?? "0")) : undefined,
          rating: aggRating ? Number.parseFloat(String(aggRating.ratingValue ?? "0")) : undefined,
          commentCount: aggRating
            ? Number.parseInt(String(aggRating.reviewCount ?? "0"), 10)
            : undefined,
        });
      }
    } catch {
      // skip invalid JSON
    }
  }

  // 策略 2: 从 HTML 景点列表项中提取（CSS 类名可能变化，使用宽松匹配）
  const itemPattern = /class="[^"]*sight[^"]*"[^>]*>[\s\S]*?<\/[^>]+>/gi;
  const namePattern = /class="[^"]*name[^"]*"[^>]*>([^<]+)/i;
  const pricePattern = /class="[^"]*price[^"]*"[^>]*>[¥￥]?\s*(\d+)/i;
  const addressPattern = /class="[^"]*address[^"]*"[^>]*>([^<]+)/i;
  const ratingPattern = /class="[^"]*(?:score|rating)[^"]*"[^>]*>(\d+\.?\d*)/i;
  const salesPattern = /(\d+)\s*(?:人[买已]|已[买售]|销量)/;

  for (
    let itemMatch: RegExpExecArray | null = itemPattern.exec(html);
    itemMatch !== null;
    itemMatch = itemPattern.exec(html)
  ) {
    const block = itemMatch[0];

    const nameMatch = namePattern.exec(block);
    const priceMatch = pricePattern.exec(block);
    const addrMatch = addressPattern.exec(block);
    const ratingMatch = ratingPattern.exec(block);
    const salesMatch = salesPattern.exec(block);

    const name = nameMatch?.[1]?.trim();
    if (!name || name.length < 2) continue;

    items.push({
      name,
      price: priceMatch ? Number.parseFloat(priceMatch[1]) : undefined,
      address: addrMatch?.[1]?.trim(),
      rating: ratingMatch ? Number.parseFloat(ratingMatch[1]) : undefined,
      sales: salesMatch ? Number.parseInt(salesMatch[1], 10) : undefined,
    });
  }

  // 策略 3: 提取 __INITIAL_STATE__ 中的 JSON 数据
  const statePattern = /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?})\s*;?\s*<\/script>/i;
  const stateMatch = statePattern.exec(html);
  if (stateMatch) {
    try {
      // 去哪儿的 JSON 通常有转义问题，尝试修复
      const jsonStr = stateMatch[1].replace(/undefined/g, "null").replace(/\\s/g, " ");
      const state = JSON.parse(jsonStr) as Record<string, unknown>;
      const sightList = (state.sightList ?? state.list ?? []) as Array<Record<string, unknown>>;

      for (const sight of sightList) {
        const name = String(sight.sightName ?? sight.name ?? "");
        if (!name) continue;

        items.push({
          name,
          address: sight.address ? String(sight.address) : undefined,
          price: sight.qunarPrice ? Number.parseFloat(String(sight.qunarPrice)) : undefined,
          rating: sight.score ? Number.parseFloat(String(sight.score)) : undefined,
          commentCount: sight.commentCount
            ? Number.parseInt(String(sight.commentCount), 10)
            : undefined,
          sales: sight.saleCount ? Number.parseInt(String(sight.saleCount), 10) : undefined,
          category: sight.category ? String(sight.category) : undefined,
          highlight: sight.highlight ? String(sight.highlight) : undefined,
        });
      }
    } catch {
      // state JSON parse failed, rely on regex results
    }
  }

  return items;
}

// ─── 公开 API ─────────────────────────────────────────────

/**
 * 搜索去哪儿景点数据
 */
export async function searchQunar(params: FreeSourceSearchParams): Promise<FreeSourceAttraction[]> {
  const { city } = params;
  const keyword = `${city}景点`;

  const html = await fetchTicketList(keyword);
  if (!html) return [];

  const rawItems = parseTicketHtml(html, city);
  if (rawItems.length === 0) return [];

  // 去重 + 过滤
  const seen = new Set<string>();
  const attractions: FreeSourceAttraction[] = [];

  for (const item of rawItems) {
    if (!item.name || seen.has(item.name)) continue;
    // 过滤非景点（如 "代订"、"包车" 等服务项）
    if (/代订|包车|接送|导游|一日游|跟团|自由行|定制|保险/.test(item.name)) continue;

    seen.add(item.name);
    attractions.push({
      nameZh: item.name,
      address: item.address,
      category: item.category,
      ticketPrice: item.price,
      rating: item.rating,
      description: item.highlight,
      visitDuration: undefined, // 去哪儿不提供
      source: "qunar",
      confidence: item.price !== undefined && item.rating !== undefined ? "high" : "medium",
      raw: item,
    });
  }

  return attractions.slice(0, 15);
}

/**
 * 健康检查 — 请求北京景点列表
 */
export async function qunarHealthCheck(): Promise<boolean> {
  try {
    const html = await fetchTicketList("北京景点");
    return html !== null && html.length > 1000;
  } catch {
    return false;
  }
}
