/**
 * 搜索预编排服务 — 并行直接调用搜索服务
 *
 * 核心优化：将搜索从 LLM 逐个决策调用改为代码层直接并行调用，
 * 搜索结果打包后一次性注入给 LLM 编排。
 *
 * 内部使用 SearchProvider 注册表，新搜索源只需实现 SearchProvider
 * 接口并注册，无需修改 orchestrator。
 */

import type { TripRequest, WeatherInfo } from "../types/trip.js";
import { getLogger } from "./logger.js";
import type { EnrichedAttraction } from "./multi-source-service.js";
import { createDefaultProviders } from "./search/providers/index.js";
import type { SearchProvider } from "./search/types.js";

// ─── 类型定义 ──────────────────────────────────────────────

export interface SearchResultsBundle {
  attractions: EnrichedAttraction[];
  weather: WeatherInfo[];
  sources: string[];
  cityCoords: Map<string, { latitude: number; longitude: number }>;
}

export interface SearchOrchestratorOptions {
  timeout?: number;
  enableGeocode?: boolean;
}

// ─── Provider 注册表 ────────────────────────────────────────

/** 已注册的搜索 Provider 列表 */
let providers: SearchProvider[] = createDefaultProviders();

/** 注册新的搜索 Provider */
export function registerSearchProvider(provider: SearchProvider): void {
  providers.push(provider);
}

/** 重置为默认 Provider 列表 */
export function resetSearchProviders(): void {
  providers = createDefaultProviders();
}

/** 获取当前已注册的 Provider 列表 */
export function getSearchProviders(): readonly SearchProvider[] {
  return providers;
}

// ─── 搜索执行 ──────────────────────────────────────────────

/**
 * 并行执行所有注册的搜索 Provider
 */
export async function runParallelSearch(
  request: TripRequest,
  _options: SearchOrchestratorOptions = {},
): Promise<SearchResultsBundle> {
  const activeProviders = [...providers].filter((p) => {
    // 支持 enableGeocode 选项过滤 geocode provider
    if (p.resultKey === "cityCoords" && _options.enableGeocode === false) {
      return false;
    }
    return true;
  });

  // 并行调用所有 provider
  const logger = getLogger().child({ component: "search-orchestrator" });
  const results = await Promise.all(
    activeProviders.map(async (provider) => {
      const start = Date.now();
      try {
        const result = await provider.search(request);
        logger.debug("provider 完成", {
          provider: provider.name,
          duration: Date.now() - start,
          source: result?.source,
        });
        return result;
      } catch (err) {
        logger.warn("provider 失败", {
          provider: provider.name,
          duration: Date.now() - start,
          error: err instanceof Error ? err.message : String(err),
        });
        return { key: provider.resultKey, data: null, source: "failed" };
      }
    }),
  );

  // 聚合结果到 SearchResultsBundle
  const attractions: EnrichedAttraction[] = [];
  const weather: WeatherInfo[] = [];
  const sources: string[] = [];
  const cityCoords = new Map<string, { latitude: number; longitude: number }>();

  for (const result of results) {
    if (!result || result.data === null) {
      sources.push(result?.source ?? "failed");
      continue;
    }

    sources.push(result.source);

    switch (result.key) {
      case "attractions":
        attractions.push(...(result.data as EnrichedAttraction[]));
        break;
      case "weather":
        weather.push(...(result.data as WeatherInfo[]));
        break;
      case "cityCoords": {
        const coords = result.data as Map<string, { latitude: number; longitude: number }>;
        for (const [city, loc] of coords) {
          if (loc.latitude !== 0 && loc.longitude !== 0) {
            cityCoords.set(city, loc);
          }
        }
        break;
      }
      // 新的 resultKey 会自动被跳过（不影响聚合）
      // 后续可扩展 SearchResultsBundle 以支持更多结果类型
    }
  }

  const uniqueSources = [...new Set(sources)];
  logger.info("搜索编排完成", {
    attractions: attractions.length,
    weather: weather.length,
    cityCoords: cityCoords.size,
    sources: uniqueSources.join(","),
  });

  return {
    attractions,
    weather,
    sources: uniqueSources,
    cityCoords,
  };
}

// ─── 格式化输出 ──────────────────────────────────────────────

export type SearchResultFormat = "compact" | "readable";

export function formatSearchResultsCompact(bundle: SearchResultsBundle): string {
  const lines: string[] = ["[搜索结果]"];

  if (bundle.attractions.length > 0) {
    lines.push(`景点(${bundle.attractions.length}):`);
    for (const a of bundle.attractions.slice(0, 10)) {
      const parts = [
        a.nameZh,
        a.category,
        `${a.ticketPrice}`,
        `${a.visitDuration}`,
        a.reservationRequired ? "需预约" : "",
        `${a.location.latitude.toFixed(2)},${a.location.longitude.toFixed(2)}`,
      ];
      lines.push(parts.filter(Boolean).join("|"));
    }
  }

  if (bundle.weather.length > 0) {
    lines.push(`天气(${bundle.weather.length}天):`);
    for (const w of bundle.weather) {
      lines.push(`${w.date}|${w.dayWeather}|${w.nightWeather}|${w.dayTemp}|${w.nightTemp}`);
    }
  }

  if (bundle.cityCoords.size > 0) {
    const coordParts: string[] = [];
    for (const [city, loc] of bundle.cityCoords) {
      coordParts.push(`${city}=${loc.latitude.toFixed(2)},${loc.longitude.toFixed(2)}`);
    }
    lines.push(`坐标:${coordParts.join(" ")}`);
  }

  lines.push(`来源:${bundle.sources.join(",")}`);

  return lines.join("\n");
}

export function formatSearchResultsForAgent(bundle: SearchResultsBundle): string {
  const lines: string[] = ["## 🔍 搜索结果（已由系统预搜索）", ""];

  if (bundle.attractions.length > 0) {
    lines.push(`### 景点（${bundle.attractions.length}个）`);
    for (const a of bundle.attractions.slice(0, 10)) {
      lines.push(
        `- **${a.nameZh}** (${a.nameEn}) — ${a.category}`,
        `  📍 ${a.address} | 🎫 ¥${a.ticketPrice} | ⏱ ${a.visitDuration}分钟`,
      );
      if (a.reservationRequired) {
        lines.push(`  ⚠️ 需预约: ${a.reservationTips}`);
      }
      if (a.routes && a.routes.length > 0) {
        const routeNames = a.routes.map((r) => r.name).join("、");
        lines.push(`  🗺️ 可选路线: ${routeNames}`);
      }
    }
    lines.push("");
  }

  if (bundle.weather.length > 0) {
    lines.push(`### 天气（${bundle.weather.length}天）`);
    for (const w of bundle.weather) {
      lines.push(
        `- ${w.date}: 白天${w.dayWeather} ${w.dayTemp}°C / 夜间${w.nightWeather} ${w.nightTemp}°C | ${w.windDirection}${w.windPower}`,
      );
    }
    lines.push("");
  }

  if (bundle.cityCoords.size > 0) {
    lines.push("### 城市坐标");
    for (const [city, loc] of bundle.cityCoords) {
      lines.push(`- ${city}: (${loc.latitude}, ${loc.longitude})`);
    }
    lines.push("");
  }

  lines.push(`数据来源: ${bundle.sources.join(", ")}`);

  return lines.join("\n");
}

// ─── 注入到 Agent Prompt ─────────────────────────────────────

export function injectSearchResults(
  basePrompt: string,
  bundle: SearchResultsBundle,
  format: SearchResultFormat = "compact",
): string {
  const searchText =
    format === "compact" ? formatSearchResultsCompact(bundle) : formatSearchResultsForAgent(bundle);
  return `${basePrompt}\n\n---\n\n${searchText}`;
}

export function isSearchValid(bundle: SearchResultsBundle): boolean {
  return bundle.attractions.length > 0 || bundle.weather.length > 0;
}
