/**
 * 景点搜索服务 — 向后兼容层
 *
 * 所有搜索逻辑已收拢到 multi-source-service.ts。
 * 此文件保留 re-export 以兼容现有导入路径。
 *
 * @deprecated 请直接从 multi-source-service.ts 导入
 *   import { searchAttractionsMultiSource } from "./multi-source-service.js"
 */

import type { Attraction } from "../types/trip.js";
import {
  type AttractionSearchParams,
  clearSearchCache,
  searchAttractionsMultiSource,
} from "./multi-source-service.js";

export type { AttractionSearchParams };

/**
 * 搜索景点 — 兼容入口
 *
 * source 映射规则（保持原有单源标识）：
 *   - 包含 google_places → "google_places"
 *   - 包含 free_* → "google_places"（有结构化数据源）
 *   - 仅 mock → "mock"
 *
 * @deprecated 使用 searchAttractionsMultiSource() 获取更丰富的融合数据
 */
export async function searchAttractions(params: AttractionSearchParams): Promise<{
  attractions: Attraction[];
  source: string;
}> {
  // 清除缓存确保每次测试独立
  clearSearchCache();

  const result = await searchAttractionsMultiSource(params);

  // 向后兼容：将多源标识映射回单源标识
  // 排除 ugc/ugc_mock 等 UGC 来源标识（multi-source 默认附加）
  const structuralSources = result.sources.filter(
    (s) => !s.startsWith("ugc") && s !== "xiaohongshu",
  );

  let source = "mock";
  if (structuralSources.includes("google_places")) {
    source = "google_places";
  } else if (structuralSources.some((s) => s.startsWith("free_"))) {
    source = "google_places"; // 有免费结构化数据也算真实数据
  }

  return {
    attractions: result.attractions,
    source,
  };
}
