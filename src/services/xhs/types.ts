/**
 * 小红书服务共享类型
 */

import type { UGCReview } from "../multi-source-service.js";

export type ProviderName = "rnote" | "justoneapi" | "tikhub" | "crawler";

export interface ProviderContext {
  token: string;
  baseUrl: string;
}

export interface ProviderResult {
  provider: ProviderName;
  reviews: UGCReview[];
}

/** Provider adapter 统一接口 */
export type ProviderAdapter = (keyword: string, ctx: ProviderContext) => Promise<UGCReview[]>;
