/**
 * 多城市行程编排服务 — 城际移动日生成 + 交通建议 + 景点地理排序
 */

import type { CityStay } from "../types/trip.js";

// ─── 城际交通数据 ──────────────────────────────────────────

interface CityRoute {
  distance: number; // km
  highSpeedRail: { hours: number; cost: number };
  flight: { hours: number; cost: number };
}

/** 常见中国城市间交通数据 */
const CITY_ROUTES: Record<string, Record<string, CityRoute>> = {
  北京: {
    上海: {
      distance: 1200,
      highSpeedRail: { hours: 4.5, cost: 550 },
      flight: { hours: 2, cost: 800 },
    },
    西安: {
      distance: 1100,
      highSpeedRail: { hours: 5.5, cost: 520 },
      flight: { hours: 2, cost: 700 },
    },
    成都: {
      distance: 1800,
      highSpeedRail: { hours: 8, cost: 750 },
      flight: { hours: 2.5, cost: 900 },
    },
    广州: {
      distance: 2200,
      highSpeedRail: { hours: 8, cost: 800 },
      flight: { hours: 3, cost: 850 },
    },
    杭州: {
      distance: 1300,
      highSpeedRail: { hours: 5, cost: 580 },
      flight: { hours: 2, cost: 750 },
    },
    南京: {
      distance: 1000,
      highSpeedRail: { hours: 3.5, cost: 440 },
      flight: { hours: 1.5, cost: 650 },
    },
  },
  上海: {
    北京: {
      distance: 1200,
      highSpeedRail: { hours: 4.5, cost: 550 },
      flight: { hours: 2, cost: 800 },
    },
    杭州: {
      distance: 180,
      highSpeedRail: { hours: 1, cost: 70 },
      flight: { hours: 0.5, cost: 400 },
    },
    南京: {
      distance: 300,
      highSpeedRail: { hours: 1.5, cost: 135 },
      flight: { hours: 0.5, cost: 450 },
    },
    西安: {
      distance: 1500,
      highSpeedRail: { hours: 6, cost: 650 },
      flight: { hours: 2.5, cost: 750 },
    },
    成都: {
      distance: 2000,
      highSpeedRail: { hours: 12, cost: 900 },
      flight: { hours: 3, cost: 850 },
    },
    广州: {
      distance: 1500,
      highSpeedRail: { hours: 7, cost: 750 },
      flight: { hours: 2.5, cost: 800 },
    },
  },
  西安: {
    北京: {
      distance: 1100,
      highSpeedRail: { hours: 5.5, cost: 520 },
      flight: { hours: 2, cost: 700 },
    },
    上海: {
      distance: 1500,
      highSpeedRail: { hours: 6, cost: 650 },
      flight: { hours: 2.5, cost: 750 },
    },
    成都: {
      distance: 700,
      highSpeedRail: { hours: 3.5, cost: 350 },
      flight: { hours: 1.5, cost: 550 },
    },
    广州: {
      distance: 1600,
      highSpeedRail: { hours: 7, cost: 700 },
      flight: { hours: 2.5, cost: 800 },
    },
  },
  成都: {
    北京: {
      distance: 1800,
      highSpeedRail: { hours: 8, cost: 750 },
      flight: { hours: 2.5, cost: 900 },
    },
    上海: {
      distance: 2000,
      highSpeedRail: { hours: 12, cost: 900 },
      flight: { hours: 3, cost: 850 },
    },
    西安: {
      distance: 700,
      highSpeedRail: { hours: 3.5, cost: 350 },
      flight: { hours: 1.5, cost: 550 },
    },
    重庆: {
      distance: 300,
      highSpeedRail: { hours: 1.5, cost: 150 },
      flight: { hours: 0.5, cost: 400 },
    },
  },
  广州: {
    北京: {
      distance: 2200,
      highSpeedRail: { hours: 8, cost: 800 },
      flight: { hours: 3, cost: 850 },
    },
    上海: {
      distance: 1500,
      highSpeedRail: { hours: 7, cost: 750 },
      flight: { hours: 2.5, cost: 800 },
    },
    深圳: {
      distance: 140,
      highSpeedRail: { hours: 0.5, cost: 75 },
      flight: { hours: 0.3, cost: 350 },
    },
  },
};

/** 获取两城市间的交通信息 */
function getRoute(from: string, to: string): CityRoute | null {
  return CITY_ROUTES[from]?.[to] ?? CITY_ROUTES[to]?.[from] ?? null;
}

/** 选择最佳交通方式 */
function selectTransport(route: CityRoute): { mode: string; hours: number; cost: number } {
  // 短距离优选高铁，长距离优选飞机
  if (route.distance <= 500) {
    return { mode: "高铁", hours: route.highSpeedRail.hours, cost: route.highSpeedRail.cost };
  }
  // 按时间优先选择
  if (route.flight.hours * 1.5 < route.highSpeedRail.hours) {
    return { mode: "飞机", hours: route.flight.hours, cost: route.flight.cost };
  }
  return { mode: "高铁", hours: route.highSpeedRail.hours, cost: route.highSpeedRail.cost };
}

/** 估算未知路线（按直线距离近似） */
function estimateTransport(
  from: string,
  to: string,
): { mode: string; hours: number; cost: number } {
  const route = getRoute(from, to);
  if (route) return selectTransport(route);

  // 默认估算
  return { mode: "高铁/飞机", hours: 4, cost: 500 };
}

// ─── 排序工具 ──────────────────────────────────────────────

/** Haversine 距离（km） */
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface AttractionWithLocation {
  name: string;
  latitude?: number;
  longitude?: number;
  [key: string]: unknown;
}

/** 贪心最近邻排序（按地理位置） */
export function sortByProximity<T extends AttractionWithLocation>(attractions: T[]): T[] {
  if (attractions.length <= 2) return [...attractions];
  if (!attractions.every((a) => a.latitude != null && a.longitude != null)) return [...attractions];

  const result: T[] = [attractions[0]];
  const remaining = attractions.slice(1);

  while (remaining.length > 0) {
    const last = result[result.length - 1];
    let nearestIdx = 0;
    let nearestDist = Number.POSITIVE_INFINITY;

    for (let i = 0; i < remaining.length; i++) {
      const dist = haversine(
        last.latitude!,
        last.longitude!,
        remaining[i].latitude!,
        remaining[i].longitude!,
      );
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }

    result.push(remaining.splice(nearestIdx, 1)[0]);
  }

  return result;
}

// ─── 多城市编排结果 ────────────────────────────────────────

export interface TransferDayInfo {
  from: string;
  to: string;
  transport: { mode: string; hours: number; cost: number };
  date: string;
}

export interface MultiCityPlan {
  /** 城市停留配置 */
  cityStays: CityStay[];
  /** 编排后的天数列表（含城际移动日的 dayIndex 和 city） */
  dayOutline: Array<{
    dayIndex: number;
    date: string;
    city: string;
    isTransferDay: boolean;
    transferInfo?: string;
  }>;
  /** 城际移动详情 */
  transfers: TransferDayInfo[];
  /** 总天数 */
  totalDays: number;
  /** 城际交通总费用 */
  totalTransportCost: number;
}

/**
 * 编排多城市行程框架
 * - 在城市间插入城际移动日
 * - 计算总天数和交通费用
 */
export function planMultiCityRoute(cityStays: CityStay[], startDate: string): MultiCityPlan {
  if (cityStays.length === 0) {
    return { cityStays: [], dayOutline: [], transfers: [], totalDays: 0, totalTransportCost: 0 };
  }

  const transfers: TransferDayInfo[] = [];
  const dayOutline: MultiCityPlan["dayOutline"] = [];
  let dayIndex = 0;
  let totalTransportCost = 0;

  const start = new Date(startDate);

  for (let i = 0; i < cityStays.length; i++) {
    const stay = cityStays[i];

    // 城市停留天数
    for (let d = 0; d < stay.days; d++) {
      const date = new Date(start);
      date.setDate(date.getDate() + dayIndex);
      dayOutline.push({
        dayIndex,
        date: date.toISOString().split("T")[0],
        city: stay.city,
        isTransferDay: false,
      });
      dayIndex++;
    }

    // 城际移动日（非最后一个城市）
    if (i < cityStays.length - 1) {
      const nextCity = cityStays[i + 1].city;
      const transport = estimateTransport(stay.city, nextCity);
      const date = new Date(start);
      date.setDate(date.getDate() + dayIndex);

      const transferInfo = `${stay.city}→${nextCity} | ${transport.mode}约${transport.hours}小时 | 建议早班出发`;

      transfers.push({
        from: stay.city,
        to: nextCity,
        transport,
        date: date.toISOString().split("T")[0],
      });

      dayOutline.push({
        dayIndex,
        date: date.toISOString().split("T")[0],
        city: nextCity,
        isTransferDay: true,
        transferInfo,
      });

      totalTransportCost += transport.cost;
      dayIndex++;
    }
  }

  return {
    cityStays,
    dayOutline,
    transfers,
    totalDays: dayIndex,
    totalTransportCost,
  };
}
