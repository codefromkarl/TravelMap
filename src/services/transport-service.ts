/**
 * 格式化交通票价：price=0 且非 trvl 源时显示「价格待查」
 */
export function formatTransportPrice(price: number, source: string): string {
  if (price > 0) return `¥${price}`;
  if (source === "trvl") return "¥0";
  if (source === "amap") return "价格待查（以12306为准）";
  return "价格待查";
}

/**
 * 城际交通查询服务 — 统一的航班/火车/大巴查询
 *
 * 数据源分层：
 *   L1 航班 — trvl CLI（复用 searchFlights）
 *   L2 火车 — 高德路线规划 API
 *   L3 mock — 无 API 时返回估算方案
 *
 * 核心功能：
 *   - searchIntercityTransport — 查询城际交通方案
 *   - enrichTransferDays — 自动为 TripPlan 移动日填充交通方案
 */

import { LRUCache } from "lru-cache";
import type { TransportOption, TripPlan } from "../types/trip.js";
import { config } from "./config.js";
import { dualGeocode } from "./dual-map-service.js";
import { fetchWithRetry } from "./http-client.js";
import { getLogger } from "./logger.js";
import { isTrvlAvailable, searchFlights } from "./trvl-service.js";

// ─── LRU 缓存 ────────────────────────────────────────────

interface CacheEntry {
  result: TransportOption[];
}

const cache = new LRUCache<string, CacheEntry>({
  max: 300,
  ttl: 2 * 60 * 60 * 1000, // 2 小时
  allowStale: false,
  ttlAutopurge: true,
});

function getCacheKey(
  originCity: string,
  destCity: string,
  date: string,
  transportType: string,
): string {
  return `${originCity}:${destCity}:${date}:${transportType}`;
}

/** 清除缓存（测试用） */
export function clearTransportCache(): void {
  cache.clear();
}

// ─── 高德路线规划 API 类型 ───────────────────────────────

interface AmapTransitSegment {
  transit_mode?: string;
  bus?: {
    buslines: Array<{
      departure_stop: { name: string; location: string };
      arrival_stop: { name: string; location: string };
      name: string;
      start_time?: string;
      end_time?: string;
    }>;
  };
}

interface AmapTransitResponse {
  status: string;
  route?: {
    transits?: Array<{
      cost: {
        duration: string;
        transit_fee?: string;
      };
      distance?: string;
      segments?: AmapTransitSegment[];
    }>;
  };
}

// ─── 火车搜索（高德 API）─────────────────────────────────

/**
 * 通过高德路线规划 API 搜索火车方案
 *
 * 坐标格式：经度,纬度（longitude FIRST）
 */
async function searchTrainsFromAmap(
  originCity: string,
  destCity: string,
  date: string,
): Promise<TransportOption[]> {
  const key = config.amapWebKey;
  if (!key) {
    getLogger().child({ component: "transport-service" }).warn("高德 API Key 未配置，跳过火车搜索");
    return [];
  }

  // 获取城市坐标
  const [originGeo, destGeo] = await Promise.all([
    dualGeocode(originCity, originCity),
    dualGeocode(destCity, destCity),
  ]);

  // 高德坐标格式：经度,纬度
  const origin = `${originGeo.location.longitude},${originGeo.location.latitude}`;
  const destination = `${destGeo.location.longitude},${destGeo.location.latitude}`;

  const url =
    `https://restapi.amap.com/v3/direction/transit/integrated` +
    `?key=${key}` +
    `&origin=${origin}` +
    `&destination=${destination}` +
    `&city=${encodeURIComponent(originCity)}` +
    `&cityd=${encodeURIComponent(destCity)}` +
    `&strategy=0` + // 最快路线
    `&nightflag=0` +
    `&date=${date}` +
    `&time=08:00`;

  const res = await fetchWithRetry(url, { timeout: 8000 });
  const data = (await res.json()) as AmapTransitResponse;

  if (data.status !== "1" || !data.route?.transits) {
    getLogger()
      .child({ component: "transport-service" })
      .warn("高德路线规划无结果", { status: data.status });
    return [];
  }

  const options: TransportOption[] = [];

  for (const transit of data.route.transits) {
    const durationSeconds = Number.parseInt(transit.cost.duration, 10) || 0;
    const price = Number.parseFloat(transit.cost.transit_fee ?? "0") || 0;

    for (const segment of transit.segments ?? []) {
      if (segment.transit_mode !== "火车" && segment.transit_mode !== "列车") continue;

      for (const busline of segment.bus?.buslines ?? []) {
        const code = busline.name;
        if (!code) continue;

        // 推断座位类型
        let seatType: string | undefined;
        if (code.startsWith("G") || code.startsWith("D")) {
          seatType = "二等座";
        } else if (code.startsWith("C")) {
          seatType = "二等座";
        }

        options.push({
          type: "train",
          code,
          departureTime: busline.start_time ?? "",
          arrivalTime: busline.end_time ?? "",
          durationMinutes: Math.round(durationSeconds / 60),
          price,
          departureStation: busline.departure_stop.name,
          arrivalStation: busline.arrival_stop.name,
          seatType,
          bookingUrl: `https://kyfw.12306.cn/otn/leftTicket/init?linktypeid=dc&fs=${encodeURIComponent(originCity)}&ts=${encodeURIComponent(destCity)}&date=${date}`,
          source: "amap",
        });
      }
    }
  }

  // 去重（同一班次可能出现在不同路线方案中）
  const seen = new Set<string>();
  return options.filter((opt) => {
    if (seen.has(opt.code)) return false;
    seen.add(opt.code);
    return true;
  });
}

// ─── 航班搜索（复用 trvl）────────────────────────────────

async function searchFlightsFromTrvl(
  originCity: string,
  destCity: string,
  date: string,
): Promise<TransportOption[]> {
  try {
    const available = await isTrvlAvailable();
    if (!available) return [];

    const result = await searchFlights(originCity, destCity, date);
    return result.flights.map((f) => {
      const leg = f.legs[0];
      return {
        type: "flight" as const,
        code: leg?.airline ?? "",
        departureTime: leg?.departure_time ?? "",
        arrivalTime: leg?.arrival_time ?? "",
        durationMinutes: f.duration,
        price: f.price,
        departureStation: leg?.departure_airport.name ?? originCity,
        arrivalStation: leg?.arrival_airport.name ?? destCity,
        seatType: "经济舱",
        bookingUrl: f.booking_url,
        source: "trvl" as const,
      };
    });
  } catch (err) {
    getLogger()
      .child({ component: "transport-service" })
      .warn("trvl 航班搜索失败", { error: err instanceof Error ? err.message : err });
    return [];
  }
}

// ─── Mock 降级数据 ────────────────────────────────────────

function getMockTransportOptions(
  originCity: string,
  destCity: string,
  _date: string,
  transportType: string,
): TransportOption[] {
  const options: TransportOption[] = [];

  if (transportType === "train" || transportType === "all") {
    options.push({
      type: "train",
      code: "G7500",
      departureTime: "08:00",
      arrivalTime: "09:30",
      durationMinutes: 90,
      price: 73,
      departureStation: `${originCity}站`,
      arrivalStation: `${destCity}站`,
      seatType: "二等座",
      source: "mock",
    });
    options.push({
      type: "train",
      code: "G7502",
      departureTime: "10:30",
      arrivalTime: "12:00",
      durationMinutes: 90,
      price: 73,
      departureStation: `${originCity}站`,
      arrivalStation: `${destCity}站`,
      seatType: "二等座",
      source: "mock",
    });
  }

  if (transportType === "flight" || transportType === "all") {
    options.push({
      type: "flight",
      code: "MU5000",
      departureTime: "07:30",
      arrivalTime: "09:30",
      durationMinutes: 120,
      price: 500,
      departureStation: `${originCity}机场`,
      arrivalStation: `${destCity}机场`,
      seatType: "经济舱",
      source: "mock",
    });
  }

  return options;
}

// ─── 主入口: searchIntercityTransport ─────────────────────

export interface SearchTransportParams {
  originCity: string;
  destCity: string;
  date: string;
  transportType?: "train" | "flight" | "all";
}

/**
 * 查询城际交通方案
 *
 * 数据源：trvl（航班）+ 高德（火车）→ mock 降级
 * 带缓存（同路线+日期 2 小时）
 */
export async function searchIntercityTransport(
  params: SearchTransportParams,
): Promise<TransportOption[]> {
  const { originCity, destCity, date, transportType = "all" } = params;

  // 查缓存
  const cacheKey = getCacheKey(originCity, destCity, date, transportType);
  const cached = cache.get(cacheKey);
  if (cached) return cached.result;

  const options: TransportOption[] = [];
  let anyRealSource = false;

  // 火车搜索
  if (transportType === "train" || transportType === "all") {
    try {
      const trains = await searchTrainsFromAmap(originCity, destCity, date);
      if (trains.length > 0) {
        options.push(...trains);
        anyRealSource = true;
      }
    } catch (err) {
      getLogger()
        .child({ component: "transport-service" })
        .warn("高德火车搜索失败", { error: err instanceof Error ? err.message : err });
    }
  }

  // 航班搜索
  if (transportType === "flight" || transportType === "all") {
    try {
      const flights = await searchFlightsFromTrvl(originCity, destCity, date);
      if (flights.length > 0) {
        options.push(...flights);
        anyRealSource = true;
      }
    } catch (err) {
      getLogger()
        .child({ component: "transport-service" })
        .warn("航班搜索失败", { error: err instanceof Error ? err.message : err });
    }
  }

  // 全部无数据 → mock 降级
  if (!anyRealSource) {
    const mockOptions = getMockTransportOptions(originCity, destCity, date, transportType);
    options.push(...mockOptions);
  }

  // 写缓存
  cache.set(cacheKey, { result: options });

  return options;
}

// ─── enrichTransferDays ──────────────────────────────────

/**
 * 为城际移动日自动填充交通方案
 *
 * 逻辑：
 *   1. 找到所有 isTransferDay 的天
 *   2. 从前后城市推断出发/目的地
 *   3. 并行查询航班 + 火车
 *   4. 取价格最优的 2-3 个方案写入 transferInfo
 */
export async function enrichTransferDays(tripPlan: TripPlan): Promise<TripPlan> {
  const enriched: TripPlan = { ...tripPlan, days: [...tripPlan.days] };

  // 找移动日
  const transferDays = enriched.days.filter((d) => d.isTransferDay);
  if (transferDays.length === 0) return enriched;

  // 并行查询每个移动日的交通方案
  const enrichPromises = transferDays.map(async (day) => {
    const dayIndex = enriched.days.indexOf(day);

    // 推断出发城市：前一天的 city
    const prevDay = enriched.days[dayIndex - 1];
    const originCity = prevDay?.city ?? day.city;

    // 目标城市就是当天 city
    const destCity = day.city;

    if (!originCity || !destCity || originCity === destCity) return;

    try {
      const options = await searchIntercityTransport({
        originCity,
        destCity,
        date: day.date,
        transportType: "all",
      });

      // 按价格排序，取前 3
      const bestOptions = options.sort((a, b) => a.price - b.price).slice(0, 3);

      // 生成格式化的 transferInfo
      const transferInfo = bestOptions
        .map((opt) => {
          const durationStr =
            opt.durationMinutes >= 60
              ? `${Math.floor(opt.durationMinutes / 60)}小时${opt.durationMinutes % 60}分`
              : `${opt.durationMinutes}分钟`;
          return `${opt.type === "train" ? "🚄" : opt.type === "flight" ? "✈️" : "🚌"} ${opt.code} ${opt.departureTime}→${opt.arrivalTime}（${durationStr}）${formatTransportPrice(opt.price, opt.source)} ${opt.departureStation}→${opt.arrivalStation}${opt.seatType ? ` ${opt.seatType}` : ""}`;
        })
        .join("\n");

      // 更新该天
      const dayIdx = enriched.days.findIndex((d) => d.dayIndex === day.dayIndex);
      if (dayIdx >= 0) {
        enriched.days[dayIdx] = {
          ...enriched.days[dayIdx]!,
          transferInfo: transferInfo || enriched.days[dayIdx]!.transferInfo,
        };
      }
    } catch (err) {
      getLogger()
        .child({ component: "transport-service" })
        .warn("移动日交通查询失败", {
          date: day.date,
          error: err instanceof Error ? err.message : err,
        });
    }
  });

  await Promise.all(enrichPromises);
  return enriched;
}
