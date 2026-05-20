/**
 * Agent 工具集 — 统一导出
 *
 * 支持按阶段分组注入，减少每轮 LLM 调用的 input tokens：
 *   - 搜索阶段: createSearchTools()（当未启用 preSearch 时使用）
 *   - 编排阶段: createPlanningTools()
 *   - 伴游阶段: createCompanionTools()
 *   - 完整版: createTools()（向后兼容）
 *
 * costTier 元数据在工具定义文件中声明，通过 registerToolCostTiers 自动注册。
 */

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { registerToolMetadata } from "../services/cost-tracker.js";
import { generateActionLinksTool } from "./action-links.js";
import { aiGuideTool } from "./ai-guide.js";
import { searchAttractionsTool } from "./attractions.js";
import { calculateBudgetTool } from "./budget.js";
import { companionQATool } from "./companion.js";
import { geocodeTool } from "./geocode.js";
import { searchHotelsTool } from "./hotels.js";
import { recognizeImageTool } from "./image-recognize.js";
import { planMultiCityTool } from "./multi-city.js";
import { searchRestaurantsTool } from "./restaurants.js";
import { enrichSupplyDetailsTool } from "./supply-enrich.js";
import { searchIntercityTransportTool } from "./transport.js";
import { ttsTool } from "./tts.js";
import { searchWeatherTool } from "./weather.js";

export { generateActionLinksTool } from "./action-links.js";
export { aiGuideTool } from "./ai-guide.js";
export { searchAttractionsTool } from "./attractions.js";
export { calculateBudgetTool } from "./budget.js";
export { companionQATool } from "./companion.js";
export { geocodeTool } from "./geocode.js";
export { searchHotelsTool } from "./hotels.js";
export { recognizeImageTool } from "./image-recognize.js";
export { planMultiCityTool } from "./multi-city.js";
export { searchRestaurantsTool } from "./restaurants.js";
export { enrichSupplyDetailsTool } from "./supply-enrich.js";
export { searchIntercityTransportTool } from "./transport.js";
export { ttsTool } from "./tts.js";
export { searchWeatherTool } from "./weather.js";

type ToolWithCost = AgentTool & { costTier?: "cheap" | "strong" };

/** 从工具列表中自动注册 costTier 元数据 */
function registerToolCostTiers(tools: ToolWithCost[]): void {
  for (const tool of tools) {
    if (tool.costTier) {
      registerToolMetadata(tool.name, tool.costTier);
    }
  }
}

// ─── 工具集工厂 ─────────────────────────────────────────────

/** 搜索类工具（当未启用 preSearch 时使用） */
export function createSearchTools(): AgentTool[] {
  const tools: ToolWithCost[] = [
    searchAttractionsTool,
    searchWeatherTool,
    searchHotelsTool,
    geocodeTool,
    searchRestaurantsTool,
  ];
  registerToolCostTiers(tools);
  return tools;
}

/** 编排类工具（行程生成 + 预算 + 链接 + 伴游 + 补给丰富） */
export function createPlanningTools(): AgentTool[] {
  return [
    calculateBudgetTool,
    generateActionLinksTool,
    companionQATool,
    planMultiCityTool,
    enrichSupplyDetailsTool,
    searchIntercityTransportTool,
    ttsTool,
    recognizeImageTool,
    aiGuideTool,
  ];
}

// 伴游工具已合并到 createPlanningTools，保持向后兼容
export function createCompanionTools(): AgentTool[] {
  const tools: ToolWithCost[] = [companionQATool];
  registerToolCostTiers(tools);
  return tools;
}

/** 创建全部工具并注册 costTier 元数据（向后兼容） */
export function createTools(): AgentTool[] {
  return [...createSearchTools(), ...createPlanningTools()];
}
