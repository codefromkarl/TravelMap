/**
 * 搜索预编排服务 — 并行直接调用搜索服务
 *
 * 核心优化：将景点/天气/酒店搜索从 LLM 逐个决策调用改为代码层直接并行调用，
 * 搜索结果打包后一次性注入给 LLM 编排。
 *
 * 预估节省: 6-8 次 LLM 调用
 */

import type { TripRequest, WeatherInfo } from "../types/trip.js";
import { dualGeocode } from "./dual-map-service.js";
import type { EnrichedAttraction, FusionResult } from "./multi-source-service.js";
import { searchAttractionsMultiSource } from "./multi-source-service.js";
import { searchWeather } from "./weather-service.js";

// ─── 类型定义 ──────────────────────────────────────────────

export interface SearchResultsBundle {
  /** 景点搜索结果 */
  attractions: EnrichedAttraction[];
  /** 天气信息 */
  weather: WeatherInfo[];
  /** 数据来源列表 */
  sources: string[];
  /** 各城市坐标信息 */
  cityCoords: Map<string, { latitude: number; longitude: number }>;
}

export interface SearchOrchestratorOptions {
  /** 搜索超时时间（毫秒） */
  timeout?: number;
  /** 是否启用地理编码 */
  enableGeocode?: boolean;
}

// ─── 搜索执行 ──────────────────────────────────────────────

/**
 * 并行执行所有搜索服务
 *
 * @param request 旅行请求参数
 * @param options 可选配置
 * @returns 搜索结果包
 */
export async function runParallelSearch(
  request: TripRequest,
  options: SearchOrchestratorOptions = {},
): Promise<SearchResultsBundle> {
  const { enableGeocode = true } = options;
  const cities = request.cities.length > 0 ? request.cities.map((c) => c.city) : [request.city];
  const travelDays = request.travelDays;

  // 并行执行所有搜索
  const searchPromises = [
    // 1. 景点搜索（取第一个城市作为主要目的地）
    searchAttractionsMultiSource({
      city: cities[0]!,
      preferences: request.preferences,
    }).catch((err) => {
      console.warn("[SearchOrchestrator] 景点搜索失败:", err);
      return { attractions: [], sources: ["failed"], fromCache: false } as FusionResult;
    }),

    // 2. 天气搜索（取第一个城市）
    searchWeather({ city: cities[0]!, days: travelDays }).catch((err) => {
      console.warn("[SearchOrchestrator] 天气搜索失败:", err);
      return { weather: [], source: "failed" };
    }),

    // 3. 地理编码（每个城市）
    enableGeocode
      ? Promise.all(
          cities.map(async (city) => {
            try {
              const { location } = await dualGeocode(city, city);
              return { city, location };
            } catch {
              return { city, location: { latitude: 0, longitude: 0 } };
            }
          }),
        )
      : Promise.resolve([]),
  ];

  const [attractionResult, weatherResult, geocodeResults] = await Promise.all(searchPromises);

  // 收集来源
  const sources: string[] = [];

  const fusionResult = attractionResult as FusionResult;
  const weatherRes = weatherResult as { weather: WeatherInfo[]; source: string };

  if (fusionResult.sources.length > 0) {
    sources.push(...fusionResult.sources);
  }
  if (weatherRes.source) {
    sources.push(weatherRes.source);
  }

  // 收集坐标
  const cityCoords = new Map<string, { latitude: number; longitude: number }>();
  for (const r of geocodeResults as {
    city: string;
    location: { latitude: number; longitude: number };
  }[]) {
    if (r.location.latitude !== 0 && r.location.longitude !== 0) {
      cityCoords.set(r.city, r.location);
    }
  }

  return {
    attractions: fusionResult.attractions,
    weather: weatherRes.weather,
    sources: [...new Set(sources)],
    cityCoords,
  };
}

// ─── 格式化输出 ──────────────────────────────────────────────

/** 输出格式选项 */
export type SearchResultFormat = "compact" | "readable";

/**
 * 紧凑格式 — 最大化减少 token 消耗
 *
 * 使用管道分隔 + 无字段名，比 markdown 节省 ~40-50% tokens
 */
export function formatSearchResultsCompact(bundle: SearchResultsBundle): string {
  const lines: string[] = ["[搜索结果]"];

  // 景点: 名称|类别|价格|时长|需预约|坐标
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

  // 天气: 日期|白天天气|夜间天气|白天气温|夜间气温
  if (bundle.weather.length > 0) {
    lines.push(`天气(${bundle.weather.length}天):`);
    for (const w of bundle.weather) {
      lines.push(`${w.date}|${w.dayWeather}|${w.nightWeather}|${w.dayTemp}|${w.nightTemp}`);
    }
  }

  // 坐标
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

/**
 * 可读格式 — 保留 markdown，适合调试
 *
 * @param bundle 搜索结果包
 * @returns 格式化文本
 */
export function formatSearchResultsForAgent(bundle: SearchResultsBundle): string {
  const lines: string[] = ["## 🔍 搜索结果（已由系统预搜索）", ""];

  // 景点
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

  // 天气
  if (bundle.weather.length > 0) {
    lines.push(`### 天气（${bundle.weather.length}天）`);
    for (const w of bundle.weather) {
      lines.push(
        `- ${w.date}: 白天${w.dayWeather} ${w.dayTemp}°C / 夜间${w.nightWeather} ${w.nightTemp}°C | ${w.windDirection}${w.windPower}`,
      );
    }
    lines.push("");
  }

  // 坐标
  if (bundle.cityCoords.size > 0) {
    lines.push("### 城市坐标");
    for (const [city, loc] of bundle.cityCoords) {
      lines.push(`- ${city}: (${loc.latitude}, ${loc.longitude})`);
    }
    lines.push("");
  }

  // 数据来源
  lines.push(`数据来源: ${bundle.sources.join(", ")}`);

  return lines.join("\n");
}

// ─── 注入到 Agent Prompt ─────────────────────────────────────

/**
 * 将搜索结果注入到用户 prompt 中
 *
 * @param basePrompt 原始用户 prompt
 * @param bundle 搜索结果包
 * @param format 输出格式，默认 compact
 * @returns 注入搜索结果的完整 prompt
 */
export function injectSearchResults(
  basePrompt: string,
  bundle: SearchResultsBundle,
  format: SearchResultFormat = "compact",
): string {
  const searchText =
    format === "compact" ? formatSearchResultsCompact(bundle) : formatSearchResultsForAgent(bundle);
  return `${basePrompt}\n\n---\n\n${searchText}`;
}

// ─── 快速检查 ──────────────────────────────────────────────

/**
 * 检查搜索结果是否可用（非空且有实质内容）
 */
export function isSearchValid(bundle: SearchResultsBundle): boolean {
  return bundle.attractions.length > 0 || bundle.weather.length > 0;
}
