// ─── 工具聚合 ──────────────────────────────────────────
// 所有工具统一从这里导出

import { searchAttractionsTool } from './attractions.js';
import { searchWeatherTool } from './weather.js';
import { searchHotelsTool } from './hotels.js';
import { calculateBudgetTool } from './budget.js';
import { generateActionLinksTool } from './action-links.js';
import { companionQATool } from './companion.js';
import { planMultiCityTool } from './multi-city.js';
import { enrichSupplyDetailsTool } from './supply-enrich.js';

export {
  searchAttractionsTool,
  searchWeatherTool,
  searchHotelsTool,
  calculateBudgetTool,
  generateActionLinksTool,
  companionQATool,
  planMultiCityTool,
  enrichSupplyDetailsTool,
};

// 聚合数组供 Agent 使用
export const ALL_TOOLS = [
  searchAttractionsTool,
  searchWeatherTool,
  searchHotelsTool,
  calculateBudgetTool,
  generateActionLinksTool,
  companionQATool,
  planMultiCityTool,
  enrichSupplyDetailsTool,
];