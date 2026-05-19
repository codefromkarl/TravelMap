/**
 * Search Provider 接口 — 搜索源的统一抽象
 *
 * 每个搜索源（景点/天气/地理编码/酒店等）实现此接口，
 * SearchOrchestrator 通过注册表统一调度。
 */

import type { TripRequest } from "../../types/trip.js";

/** 搜索源的统一输出 */
export interface SearchProviderResult {
  /** 结果标识（如 "attractions" / "weather" / "geocode" / "hotels"） */
  key: string;
  /** 搜索结果数据 */
  data: unknown;
  /** 数据来源标记 */
  source: string;
}

/** 搜索源接口 */
export interface SearchProvider {
  /** 搜索源名称 */
  name: string;
  /** 结果标识 */
  resultKey: string;
  /** 执行搜索 */
  search(request: TripRequest): Promise<SearchProviderResult>;
}
