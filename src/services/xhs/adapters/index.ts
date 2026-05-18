/**
 * Provider Adapter 注册表
 */

import { fetchCrawler } from "./crawler.js";
import { fetchJustOneApi } from "./justoneapi.js";
import { fetchRnote } from "./rnote.js";
import { fetchTikHub } from "./tikhub.js";
import type { ProviderAdapter, ProviderName } from "../types.js";

export const PROVIDER_ADAPTERS: Record<ProviderName, ProviderAdapter> = {
  rnote: fetchRnote,
  justoneapi: fetchJustOneApi,
  tikhub: fetchTikHub,
  crawler: fetchCrawler,
};

export { fetchCrawler, fetchJustOneApi, fetchRnote, fetchTikHub };
