/**
 * Agent 工具集 — 统一导出
 *
 * 支持按阶段分组注入，减少每轮 LLM 调用的 input tokens：
 *   - 搜索阶段: createSearchTools()（当未启用 preSearch 时使用）
 *   - 编排阶段: createPlanningTools()
 *   - 伴游阶段: createCompanionTools()
 *   - 完整版: createTools()（向后兼容）
 */

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { registerToolMetadata } from "../services/cost-tracker.js";
import { generateActionLinksTool } from "./action-links.js";
import { searchAttractionsTool } from "./attractions.js";
import { calculateBudgetTool } from "./budget.js";
import { companionQATool } from "./companion.js";
import { geocodeTool } from "./geocode.js";
import { searchHotelsTool } from "./hotels.js";
import { planMultiCityTool } from "./multi-city.js";
import { enrichSupplyDetailsTool } from "./supply-enrich.js";
import { searchWeatherTool } from "./weather.js";

export { generateActionLinksTool } from "./action-links.js";
export { searchAttractionsTool } from "./attractions.js";
export { calculateBudgetTool } from "./budget.js";
export { companionQATool } from "./companion.js";
export { geocodeTool } from "./geocode.js";
export { searchHotelsTool } from "./hotels.js";
export { planMultiCityTool } from "./multi-city.js";
export { enrichSupplyDetailsTool } from "./supply-enrich.js";
export { searchWeatherTool } from "./weather.js";

/** 搜索类工具（当未启用 preSearch 时使用） */
export function createSearchTools(): AgentTool[] {
  registerToolMetadata("search_attractions", "cheap");
  registerToolMetadata("search_weather", "cheap");
  registerToolMetadata("search_hotels", "cheap");
  registerToolMetadata("geocode", "cheap");

  return [searchAttractionsTool, searchWeatherTool, searchHotelsTool, geocodeTool];
}

/** 编排类工具（行程生成 + 预算 + 链接 + 伴游 + 补给丰富） */
export function createPlanningTools(): AgentTool[] {
  return [
    calculateBudgetTool,
    generateActionLinksTool,
    companionQATool,
    planMultiCityTool,
    enrichSupplyDetailsTool,
  ];
}

// 伴游工具已合并到 createPlanningTools，保持向后兼容
export function createCompanionTools(): AgentTool[] {
  registerToolMetadata("query_trip_data", "cheap");
  return [companionQATool];
}

/** 创建全部工具并注册 costTier 元数据（向后兼容） */
export function createTools(): AgentTool[] {
  return [...createSearchTools(), ...createPlanningTools()];
}
