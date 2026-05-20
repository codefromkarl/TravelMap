/**
 * 景点图片服务 — 统一图片源路由
 *
 * 数据源优先级：
 *   1. Unsplash API（需 UNSPLASH_ACCESS_KEY，免费 50次/小时）
 *   2. Pexels API（需 PEXELS_API_KEY，免费 200次/小时）
 *
 * 降级策略：
 *   - 无 API Key → 返回空数组，不报错
 *   - 请求失败 → fallback 到下一个源
 *   - 缓存 → 内存 LRU（100 条，TTL 1 小时）
 */

import { LRUCache } from "lru-cache";
import type { AttractionImage } from "../types/trip.js";
import { config } from "./config.js";
import { fetchWithTimeout } from "./http-client.js";
import { getLogger } from "./logger.js";

// ─── 缓存 ─────────────────────────────────────────────────

const imageCache = new LRUCache<string, AttractionImage[]>({
  max: 100,
  ttl: 1000 * 60 * 60, // 1 小时
});

// ─── Unsplash 数据源 ──────────────────────────────────────

interface UnsplashResult {
  urls?: { small?: string; regular?: string };
  alt_description?: string;
}

async function fetchUnsplash(keyword: string, count: number): Promise<AttractionImage[]> {
  const key = config.unsplashAccessKey;
  if (!key) return [];

  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(keyword)}&per_page=${count}&orientation=landscape`;
    const res = await fetchWithTimeout(url, {
      timeout: 8000,
      headers: {
        Authorization: `Client-ID ${key}`,
        "Accept-Version": "v1",
      },
    });

    if (!res.ok) {
      getLogger()
        .child({ component: "image-service" })
        .warn("Unsplash error", { status: res.status });
      return [];
    }

    const data = (await res.json()) as { results?: UnsplashResult[] };
    return (data.results ?? [])
      .filter((r) => r.urls?.small)
      .map((r) => ({
        url: r.urls!.small!,
        source: "unsplash" as const,
        alt: r.alt_description || undefined,
      }));
  } catch (err) {
    getLogger()
      .child({ component: "image-service" })
      .warn("Unsplash failed", { error: err instanceof Error ? err.message : err });
    return [];
  }
}

// ─── Pexels 数据源 ────────────────────────────────────────

interface PexelsPhoto {
  src?: { medium?: string; large?: string };
  alt?: string;
}

async function fetchPexels(keyword: string, count: number): Promise<AttractionImage[]> {
  const key = config.pexelsApiKey;
  if (!key) return [];

  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(keyword)}&per_page=${count}&orientation=landscape`;
    const res = await fetchWithTimeout(url, {
      timeout: 8000,
      headers: {
        Authorization: key,
      },
    });

    if (!res.ok) {
      getLogger()
        .child({ component: "image-service" })
        .warn("Pexels error", { status: res.status });
      return [];
    }

    const data = (await res.json()) as { photos?: PexelsPhoto[] };
    return (data.photos ?? [])
      .filter((p) => p.src?.medium)
      .map((p) => ({
        url: p.src!.medium!,
        source: "pexels" as const,
        alt: p.alt || undefined,
      }));
  } catch (err) {
    getLogger()
      .child({ component: "image-service" })
      .warn("Pexels failed", { error: err instanceof Error ? err.message : err });
    return [];
  }
}

// ─── 公开 API ─────────────────────────────────────────────

/**
 * 获取景点图片
 * @param name 景点名称
 * @param city 城市名（用于增强搜索关键词）
 * @returns 1-3 张景点图片
 */
export async function getAttractionImages(name: string, city: string): Promise<AttractionImage[]> {
  const keyword = `${name} ${city}`;

  // 检查缓存
  const cached = imageCache.get(keyword);
  if (cached) return cached;

  // 按优先级依次尝试图片源
  const sources = [fetchUnsplash, fetchPexels];
  const count = 3;

  for (const source of sources) {
    const images = await source(keyword, count);
    if (images.length > 0) {
      imageCache.set(keyword, images);
      return images;
    }
  }

  // 所有源都失败，返回空数组
  return [];
}

/** 清除缓存（测试用） */
export function clearImageCache(): void {
  imageCache.clear();
}
