/**
 * Agent 工具集 — 统一导出
 */

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { generateActionLinksTool } from "./action-links.js";
import { searchAttractionsTool } from "./attractions.js";
import { calculateBudgetTool } from "./budget.js";
import { companionQATool } from "./companion.js";
import { geocodeTool } from "./geocode.js";
import { searchHotelsTool } from "./hotels.js";
import { searchWeatherTool } from "./weather.js";

export { generateActionLinksTool } from "./action-links.js";
export { searchAttractionsTool } from "./attractions.js";
export { calculateBudgetTool } from "./budget.js";
export { companionQATool } from "./companion.js";
export { geocodeTool } from "./geocode.js";
export { searchHotelsTool } from "./hotels.js";
export { searchWeatherTool } from "./weather.js";

/** 创建全部工具 */
export function createTools(): AgentTool[] {
  return [
    searchAttractionsTool,
    searchWeatherTool,
    searchHotelsTool,
    geocodeTool,
    calculateBudgetTool,
    generateActionLinksTool,
    companionQATool,
  ];
}
