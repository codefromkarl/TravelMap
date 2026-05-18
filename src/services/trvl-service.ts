/**
 * trvl CLI 集成服务 — 通过 trvl 获取实时航班/酒店数据
 *
 * trvl 是开源旅行 CLI（https://github.com/MikkoParkkola/trvl），
 * 支持 Google Flights/Hotels/Trivago 等 21 个数据源，无需 API Key。
 *
 * 调用方必须在 catch 中实现 fallback 到 URL 模板逻辑。
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { TrvlFlightSearchResult, TrvlHotelSearchResult } from "../types/trip.js";

const execFileAsync = promisify(execFile);

const TRVL_TIMEOUT_MS = 30_000;

// ─── 城市→IATA 机场代码映射 ────────────────────────────────

const CITY_IATA_MAP: Record<string, string[]> = {
  北京: ["PEK", "PKX"],
  上海: ["PVG", "SHA"],
  广州: ["CAN"],
  深圳: ["SZX"],
  成都: ["CTU", "TFU"],
  西安: ["XIY"],
  杭州: ["HGH"],
  重庆: ["CKG"],
  南京: ["NKG"],
  武汉: ["WUH"],
  长沙: ["CSX"],
  青岛: ["TAO"],
  大连: ["DLC"],
  厦门: ["XMN"],
  昆明: ["KMG"],
  三亚: ["SYX"],
  海口: ["HAK"],
  哈尔滨: ["HRB"],
  沈阳: ["SHE"],
  天津: ["TSN"],
  郑州: ["CGO"],
  贵阳: ["KWE"],
  南宁: ["NNG"],
  兰州: ["LHW"],
  乌鲁木齐: ["URC"],
  拉萨: ["LXA"],
  桂林: ["KWL"],
  丽江: ["LJG"],
  大理: ["DLU"],
  张家界: ["DYG"],
  九寨沟: ["JZH"],
  黄山: ["TXN"],
  洛阳: ["LYA"],
  苏州: ["WUX"], // 无锡硕放（苏州最近机场）
  宁波: ["NGB"],
  福州: ["FOC"],
  济南: ["TNA"],
  合肥: ["HFE"],
  太原: ["TYN"],
  石家庄: ["SJW"],
  呼和浩特: ["HET"],
  长春: ["CGQ"],
  南昌: ["KHN"],
  珠海: ["ZUH"],
};

/**
 * 获取城市的主要 IATA 机场代码（取第一个）
 * 找不到时返回城市拼音首字母大写作为 fallback（trvl 可能也识别不了）
 */
export function cityToIATA(city: string): string {
  const codes = CITY_IATA_MAP[city];
  if (codes && codes.length > 0) return codes[0];
  return city;
}

/** 获取城市的所有 IATA 代码（用于多机场搜索） */
export function cityToAllIATA(city: string): string[] {
  return CITY_IATA_MAP[city] ?? [city];
}

// ─── 可用性检测 ────────────────────────────────────────────

let _availabilityCache: boolean | null = null;

/**
 * 检测 trvl CLI 是否可用
 * 结果会缓存，除非强制刷新
 */
export async function isTrvlAvailable(forceRefresh = false): Promise<boolean> {
  if (_availabilityCache !== null && !forceRefresh) {
    return _availabilityCache;
  }

  try {
    await execFileAsync("trvl", ["version"], { timeout: 5_000 });
    _availabilityCache = true;
  } catch {
    _availabilityCache = false;
  }

  return _availabilityCache;
}

/** 重置可用性缓存（测试用） */
export function _resetAvailabilityCache(): void {
  _availabilityCache = null;
}

// ─── 航班搜索 ──────────────────────────────────────────────

/**
 * 搜索航班
 * @throws trvl 不可用、超时、或返回错误时抛出异常
 */
export async function searchFlights(
  originCity: string,
  destCity: string,
  date: string,
  options?: { returnDate?: string; currency?: string },
): Promise<TrvlFlightSearchResult> {
  const origin = cityToIATA(originCity);
  const dest = cityToIATA(destCity);

  const args = [
    "flights",
    origin,
    dest,
    date,
    "--format",
    "json",
    "--sort",
    "price",
    "--currency",
    options?.currency ?? "CNY",
  ];

  if (options?.returnDate) {
    args.push("--return", options.returnDate);
  }

  const { stdout, stderr } = await execFileAsync("trvl", args, {
    timeout: TRVL_TIMEOUT_MS,
  });

  if (stderr) {
    console.warn("[TrvlService] flights stderr:", stderr);
  }

  let result: TrvlFlightSearchResult;
  try {
    result = JSON.parse(stdout) as TrvlFlightSearchResult;
  } catch (parseErr) {
    const snippet = stdout.slice(0, 200).replace(/\s+/g, " ");
    throw new Error(`trvl flights output is not valid JSON. stdout snippet: "${snippet}..."`, {
      cause: parseErr,
    });
  }

  if (!result.success) {
    throw new Error(`trvl flights failed: ${result.error ?? "unknown error"}`);
  }

  return result;
}

// ─── 酒店搜索 ──────────────────────────────────────────────

/**
 * 搜索酒店
 * @throws trvl 不可用、超时、或返回错误时抛出异常
 */
export async function searchHotels(
  city: string,
  checkin: string,
  checkout: string,
  options?: { currency?: string },
): Promise<TrvlHotelSearchResult> {
  const args = [
    "hotels",
    city,
    "--checkin",
    checkin,
    "--checkout",
    checkout,
    "--format",
    "json",
    "--sort",
    "cheapest",
    "--currency",
    options?.currency ?? "CNY",
  ];

  const { stdout, stderr } = await execFileAsync("trvl", args, {
    timeout: TRVL_TIMEOUT_MS,
  });

  if (stderr) {
    console.warn("[TrvlService] hotels stderr:", stderr);
  }

  let result: TrvlHotelSearchResult;
  try {
    result = JSON.parse(stdout) as TrvlHotelSearchResult;
  } catch (parseErr) {
    const snippet = stdout.slice(0, 200).replace(/\s+/g, " ");
    throw new Error(`trvl hotels output is not valid JSON. stdout snippet: "${snippet}..."`, {
      cause: parseErr,
    });
  }

  if (!result.success) {
    throw new Error(`trvl hotels failed: ${result.error ?? "unknown error"}`);
  }

  return result;
}
