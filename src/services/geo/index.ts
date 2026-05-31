/**
 * 地理编码模块 — 统一导出
 */

export { AmapGeocodeProvider } from "./amap-adapter.js";
export { GoogleGeocodeProvider } from "./google-adapter.js";
export { NominatimGeocodeProvider } from "./nominatim-adapter.js";
export type { GeocodeProvider, GeocodeResult } from "./types.js";
