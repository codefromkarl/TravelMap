/**
 * 双地图引擎 — 国内高德 / 国外 Google Maps，自动检测降级
 *
 * 核心逻辑：
 *   1. 判断目标城市是国内还是国外
 *   2. 国内优先高德，国外优先 Google
 *   3. 全局标记：某引擎失败后不再重复尝试（避免逐个超时）
 *   4. 支持代理配置（国内访问 Google）
 *
 * 使用 GeocodeProvider 接口，每个后端独立为 adapter。
 */

import type { Location } from "../types/trip.js";
import { config as appConfig } from "./config.js";
import { AmapGeocodeProvider } from "./geo/amap-adapter.js";
import { GoogleGeocodeProvider } from "./geo/google-adapter.js";
import { NominatimGeocodeProvider } from "./geo/nominatim-adapter.js";
import type { GeocodeProvider } from "./geo/types.js";
import { getLogger } from "./logger.js";

// ─── 配置 ────────────────────────────────────────────────

export interface DualMapConfig {
  /** 高德 API Key (国内) */
  amapKey?: string;
  /** Google Maps API Key (国外/备用) */
  googleKey?: string;
  /** 代理 URL (国内访问 Google 用) */
  proxyUrl?: string;
  /** 单次请求超时 ms */
  timeout?: number;
}

// ─── 国内城市判断 ─────────────────────────────────────────

/** 国内城市名 / 省份前缀 */
const DOMESTIC_INDICATORS = [
  "北京",
  "上海",
  "广州",
  "深圳",
  "成都",
  "杭州",
  "西安",
  "重庆",
  "南京",
  "武汉",
  "长沙",
  "苏州",
  "厦门",
  "青岛",
  "大连",
  "昆明",
  "丽江",
  "三亚",
  "桂林",
  "张家界",
  "黄山",
  "九寨沟",
  "拉萨",
  "天津",
  "哈尔滨",
  "沈阳",
  "济南",
  "郑州",
  "福州",
  "合肥",
  "贵阳",
  "南宁",
  "海口",
  "石家庄",
  "太原",
  "兰州",
  "银川",
  "西宁",
  "呼和浩特",
  "乌鲁木齐",
  "长春",
  "南昌",
];

/** 判断是否为国内目的地 */
export function isDomesticCity(city: string): boolean {
  return DOMESTIC_INDICATORS.some((c) => city.includes(c) || c.includes(city));
}

// ─── 坐标系转换：GCJ-02 ↔ WGS-84 ─────────────────────────
// 高德 API 返回 GCJ-02（火星坐标），Leaflet 使用 WGS-84
// 不转换会导致 100-500m 偏移

const PI = Math.PI;
const A = 6378245.0;
// biome-ignore lint/correctness/noPrecisionLoss: GCJ-02 偏移算法需要精确常量
const EE = 0.00669342162296594323;

function outOfChina(lat: number, lng: number): boolean {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x: number, y: number): number {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function transformLng(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;
  return ret;
}

/** GCJ-02 → WGS-84（高德坐标转国际标准坐标） */
export function gcj02ToWgs84(lat: number, lng: number): Location {
  if (outOfChina(lat, lng)) return { latitude: lat, longitude: lng };
  const dLat = transformLat(lng - 105.0, lat - 35.0);
  const dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  const convertedLat = lat - (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
  const convertedLng = lng - (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
  return { latitude: convertedLat, longitude: convertedLng };
}

/** WGS-84 → GCJ-02（国际标准坐标转高德坐标） */
export function wgs84ToGcj02(lat: number, lng: number): Location {
  if (outOfChina(lat, lng)) return { latitude: lat, longitude: lng };
  const dLat = transformLat(lng - 105.0, lat - 35.0);
  const dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  const convertedLat = lat + (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
  const convertedLng = lng + (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
  return { latitude: convertedLat, longitude: convertedLng };
}

// ─── 全局引擎状态 ─────────────────────────────────────────

/** 引擎失败标记 — 进程级单例 */
const engineFailures = new Set<string>();

/** 标记引擎失败 */
function markEngineFailed(engine: string): void {
  engineFailures.add(engine);
}

/** 检查引擎是否已失败 */
function isEngineFailed(engine: string): boolean {
  return engineFailures.has(engine);
}

/** 重置引擎状态（测试用） */
export function resetEngineState(): void {
  engineFailures.clear();
}

// ─── 默认坐标（GCJ-02 坐标系，与存储格式一致） ─────────────

function defaultLocation(city: string): Location {
  const defaults: Record<string, Location> = {
    北京: { latitude: 39.9087, longitude: 116.4214 },
    上海: { latitude: 31.2345, longitude: 121.4879 },
    广州: { latitude: 23.1317, longitude: 113.2786 },
    深圳: { latitude: 22.5467, longitude: 114.0733 },
    成都: { latitude: 30.5763, longitude: 104.0804 },
    杭州: { latitude: 30.2783, longitude: 120.1693 },
    西安: { latitude: 34.3453, longitude: 108.9537 },
    重庆: { latitude: 29.5666, longitude: 106.5653 },
  };
  return defaults[city] ?? { latitude: 31.2345, longitude: 121.4879 };
}

// ─── Provider 工厂 ─────────────────────────────────────────

function createProviders(cfg: DualMapConfig, domestic: boolean): GeocodeProvider[] {
  const providers: GeocodeProvider[] = [];

  if (domestic) {
    // 国内：高德优先
    if (cfg.amapKey && !isEngineFailed("amap")) {
      providers.push(new AmapGeocodeProvider(cfg.amapKey, cfg.timeout));
    }
  }

  // Google（国内外都可用）
  if (cfg.googleKey && !isEngineFailed("google")) {
    providers.push(
      new GoogleGeocodeProvider({
        key: cfg.googleKey,
        proxyUrl: cfg.proxyUrl,
        timeout: cfg.timeout,
      }),
    );
  }

  // Nominatim 兜底
  if (!isEngineFailed("nominatim")) {
    providers.push(new NominatimGeocodeProvider(cfg.timeout));
  }

  return providers;
}

// ─── 主入口: 双引擎地理编码 ───────────────────────────────

export interface DualGeocodeResult {
  location: Location;
  engine: string;
  warning?: string;
}

/**
 * 双地图地理编码
 *
 * 国内: 高德优先 → Google 备用 → Nominatim 兜底
 * 国外: Google 优先 → Nominatim 兜底
 */
export async function dualGeocode(
  address: string,
  city: string,
  config?: Partial<DualMapConfig>,
): Promise<DualGeocodeResult> {
  const cfg: DualMapConfig = {
    amapKey: config?.amapKey ?? appConfig.amapWebKey,
    googleKey: config?.googleKey ?? appConfig.googleMapsApiKey,
    proxyUrl: config?.proxyUrl ?? appConfig.httpsProxy,
    timeout: config?.timeout ?? 4000,
  };

  const domestic = isDomesticCity(city);
  const warnings: string[] = [];

  // 获取可用的 providers
  const providers = createProviders(cfg, domestic);

  // 按优先级尝试
  for (const provider of providers) {
    try {
      const result = await provider.geocode(address, city);
      return { location: result.location, engine: result.engine };
    } catch (err) {
      markEngineFailed(provider.name);
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`${provider.name}: ${msg}`);
      getLogger()
        .child({ component: "dual-map-service" })
        .warn("引擎失败", { engine: provider.name, error: msg });
    }
  }

  // 全部失败
  return {
    location: defaultLocation(city),
    engine: "default",
    warning: `所有引擎失败 (${warnings.join("; ")})，使用${city}市中心坐标`,
  };
}
