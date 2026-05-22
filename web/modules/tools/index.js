// ─── 工具聚合 ──────────────────────────────────────────
// 所有工具统一从这里导出

import { searchAttractionsTool } from './attractions.js?v=4';
import { searchWeatherTool } from './weather.js?v=4';
import { searchHotelsTool } from './hotels.js?v=4';
import { calculateBudgetTool } from './budget.js?v=4';
import { generateActionLinksTool } from './action-links.js?v=4';
import { companionQATool } from './companion.js?v=4';
import { planMultiCityTool } from './multi-city.js?v=4';
import { enrichSupplyDetailsTool } from './supply-enrich.js?v=4';

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