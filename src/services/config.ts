/**
 * 集中配置管理 — 所有外部服务 API Key 和运行时配置的统一入口
 *
 * 用法:
 *   import { config } from "../config.js";
 *   if (config.googleMapsApiKey) { ... }
 *
 * 测试时可通过 setTestConfig() 注入覆盖，无需操作 process.env。
 */

// ─── 配置类型 ─────────────────────────────────────────────

export interface AppConfig {
  /** Google Maps / Places API Key */
  googleMapsApiKey: string | undefined;
  /** 高德地图 Web API Key */
  amapWebKey: string | undefined;
  /** OpenWeatherMap API Key */
  openWeatherApiKey: string | undefined;
  /** HTTPS 代理 URL */
  httpsProxy: string | undefined;

  // XHS 路由配置
  xhsRouterStrategy: "priority" | "cost" | "all";
  xhsRouterProviders: string | undefined;
  xhsApiProvider: string | undefined;
  xhsApiToken: string | undefined;
  xhsApiBase: string | undefined;
  xhsRnoteToken: string | undefined;
  xhsRnoteBase: string | undefined;
  xhsJustoneapiToken: string | undefined;
  xhsJustoneapiBase: string | undefined;
  xhsTikhubToken: string | undefined;
  xhsTikhubBase: string | undefined;
  xhsCrawlerBase: string | undefined;
  xhsCrawlerToken: string | undefined;
}

// ─── 从 process.env 读取 ─────────────────────────────────

function readFromEnv(): AppConfig {
  return {
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
    amapWebKey: process.env.AMAP_WEB_KEY,
    openWeatherApiKey: process.env.OPENWEATHER_API_KEY,
    httpsProxy: process.env.HTTPS_PROXY,

    xhsRouterStrategy:
      (process.env.XHS_ROUTER_STRATEGY as AppConfig["xhsRouterStrategy"]) ?? "priority",
    xhsRouterProviders: process.env.XHS_ROUTER_PROVIDERS,
    xhsApiProvider: process.env.XHS_API_PROVIDER,
    xhsApiToken: process.env.XHS_API_TOKEN,
    xhsApiBase: process.env.XHS_API_BASE,
    xhsRnoteToken: process.env.XHS_RNOTE_TOKEN,
    xhsRnoteBase: process.env.XHS_RNOTE_BASE,
    xhsJustoneapiToken: process.env.XHS_JUSTONEAPI_TOKEN,
    xhsJustoneapiBase: process.env.XHS_JUSTONEAPI_BASE,
    xhsTikhubToken: process.env.XHS_TIKHUB_TOKEN,
    xhsTikhubBase: process.env.XHS_TIKHUB_BASE,
    xhsCrawlerBase: process.env.XHS_CRAWLER_BASE,
    xhsCrawlerToken: process.env.XHS_CRAWLER_TOKEN,
  };
}

// ─── 运行时覆盖（测试用）──────────────────────────────────

let override: Partial<AppConfig> | undefined;

/** 获取当前配置（env 优先，覆盖次之） */
export function getConfig(): AppConfig {
  const env = readFromEnv();
  if (!override) return env;
  return { ...env, ...override };
}

/** 便捷 getter — 常用 key 直接访问 */
export const config = new Proxy({} as AppConfig, {
  get(_, key) {
    return getConfig()[key as keyof AppConfig];
  },
});

/** 测试用：设置配置覆盖 */
export function setTestConfig(partial: Partial<AppConfig>): void {
  override = partial;
}

/** 测试用：清除覆盖 */
export function clearTestConfig(): void {
  override = undefined;
}
