/**
 * Search Provider 注册表 + 默认工厂
 */

import { AttractionSearchProvider } from "./attraction-provider.js";
import { GeocodeSearchProvider } from "./geocode-provider.js";
import { WeatherSearchProvider } from "./weather-provider.js";

export type { SearchProvider, SearchProviderResult } from "../types.js";
export { AttractionSearchProvider } from "./attraction-provider.js";
export { GeocodeSearchProvider } from "./geocode-provider.js";
export { WeatherSearchProvider } from "./weather-provider.js";

/** 创建默认搜索 Provider 列表 */
export function createDefaultProviders() {
  return [new AttractionSearchProvider(), new WeatherSearchProvider(), new GeocodeSearchProvider()];
}
