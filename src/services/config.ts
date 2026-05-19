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
  /** OpenTripMap API Key（免费，5000次/天） */
  openTripMapApiKey: string | undefined;

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

// ─── 关键 API Key 与功能映射 ────────────────────────────────

/** 每个 key 对应的功能描述和受影响的服务 */
const KEY_FEATURES: Array<{
  key: keyof AppConfig;
  envVar: string;
  feature: string;
  services: string[];
}> = [
  {
    key: "googleMapsApiKey",
    envVar: "GOOGLE_MAPS_API_KEY",
    feature: "Google Maps / Places API",
    services: ["attraction-service", "multi-source-service", "dual-map-service"],
  },
  {
    key: "amapWebKey",
    envVar: "AMAP_WEB_KEY",
    feature: "高德地图 Web API",
    services: ["dual-map-service"],
  },
  {
    key: "openWeatherApiKey",
    envVar: "OPENWEATHER_API_KEY",
    feature: "OpenWeatherMap 天气 API",
    services: ["weather-service"],
  },
];

// ─── 验证结果类型 ──────────────────────────────────────────

export interface ValidationWarning {
  /** 缺失的 env 变量名 */
  envVar: string;
  /** 受影响的功能 */
  feature: string;
  /** 受影响的服务列表 */
  services: string[];
}

export interface ValidationResult {
  /** 是否所有关键 key 都已配置 */
  valid: boolean;
  /** 缺失 key 的降级警告列表 */
  warnings: ValidationWarning[];
}

// ─── 从 process.env 读取 ─────────────────────────────────

function readFromEnv(): AppConfig {
  return {
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
    amapWebKey: process.env.AMAP_WEB_KEY,
    openWeatherApiKey: process.env.OPENWEATHER_API_KEY,
    httpsProxy: process.env.HTTPS_PROXY,
    openTripMapApiKey: process.env.OPENTRIPMAP_API_KEY,

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

// ─── 启动时环境变量验证 ──────────────────────────────────────

/** 验证关键环境变量是否配置，返回缺失项列表 */
export function validateConfig(): ValidationResult {
  const cfg = getConfig();
  const warnings: ValidationWarning[] = [];

  for (const def of KEY_FEATURES) {
    if (!cfg[def.key]) {
      warnings.push({
        envVar: def.envVar,
        feature: def.feature,
        services: def.services,
      });
    }
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}

/** 启动时打印降级提示（在应用入口调用一次） */
export function printConfigWarnings(): void {
  const result = validateConfig();

  if (result.valid) {
    console.log("[Config] ✅ 所有关键 API Key 已配置");
    return;
  }

  console.warn(
    `[Config] ⚠️ ${result.warnings.length} 个关键 API Key 未配置，以下功能将降级到 mock 数据：`,
  );

  for (const w of result.warnings) {
    console.warn(`  - ${w.feature} (${w.envVar}) → 影响服务: ${w.services.join(", ")}`);
  }

  console.warn("[Config] 请在 .env 文件或环境变量中配置上述 key，以获取真实 API 数据。");
}

/**
 * 获取指定 key 的数据来源标记
 *
 * @returns "real" | "mock"
 *
 * 用法:
 *   const source = getDataSource("googleMapsApiKey");
 *   // "real" 或 "mock"
 */
export function getDataSource(key: keyof AppConfig): "real" | "mock" {
  const cfg = getConfig();
  return cfg[key] ? "real" : "mock";
}
