/**
 * 天气模块 — 统一导出
 */

export { AmapWeatherProvider } from "./amap-adapter.js";
export { MockWeatherProvider } from "./mock-adapter.js";
export { OpenWeatherMapProvider } from "./owm-adapter.js";
export { QWeatherProvider } from "./qweather-adapter.js";
export type { WeatherProvider, WeatherResult, WeatherSearchParams } from "./types.js";
