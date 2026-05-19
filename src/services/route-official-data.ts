/**
 * 景点官方路线数据 — 加载器 + 查询 API
 *
 * 静态数据存储在 routes/official-routes.json
 * 此模块提供加载、查询和 mock 降级功能
 */

import type { AttractionRoute } from "../types/route.js";
import officialRoutesData from "./routes/official-routes.json";

// ─── 类型 ─────────────────────────────────────────────────

interface OfficialRouteData {
  /** 匹配的景点名（支持多个别名） */
  names: string[];
  /** 城市 */
  city: string;
  /** 路线列表 */
  routes: AttractionRoute[];
}

const ALL_OFFICIAL_ROUTES: OfficialRouteData[] = officialRoutesData as OfficialRouteData[];

// ─── 查询 API ────────────────────────────────────────────

/** 根据景点名获取官方路线 */
export function getOfficialRoutes(attractionName: string, city: string): AttractionRoute[] {
  for (const data of ALL_OFFICIAL_ROUTES) {
    const matchesName = data.names.some(
      (n) => n === attractionName || attractionName.includes(n) || n.includes(attractionName),
    );
    const matchesCity = !data.city || data.city === city;
    if (matchesName && matchesCity) {
      return data.routes;
    }
  }
  return [];
}

/** 获取所有已收录的景区名称列表 */
export function getAvailableAttractionNames(): string[] {
  return ALL_OFFICIAL_ROUTES.flatMap((d) => d.names);
}

/** Mock 路线数据（用于未收录景区的降级） */
export function getMockRoutes(attractionName: string, _city: string): AttractionRoute[] {
  // 仅对疑似大型景区生成 mock 路线
  if (
    !attractionName.includes("景区") &&
    !attractionName.includes("公园") &&
    !attractionName.includes("风景区") &&
    attractionName.length < 3
  ) {
    return [];
  }

  const baseRoute: AttractionRoute = {
    id: `mock_${attractionName}_classic`,
    name: `${attractionName}经典路线`,
    description: `${attractionName}的经典游览路线，覆盖主要景点`,
    duration: 180,
    waypoints: [
      {
        name: `${attractionName}主入口`,
        location: { latitude: 0, longitude: 0 },
        visitDuration: 10,
        isOptional: false,
      },
      {
        name: `${attractionName}核心景区`,
        location: { latitude: 0, longitude: 0 },
        visitDuration: 60,
        isOptional: false,
      },
      {
        name: `${attractionName}观景台`,
        location: { latitude: 0, longitude: 0 },
        visitDuration: 30,
        isOptional: false,
      },
      {
        name: `${attractionName}出口`,
        location: { latitude: 0, longitude: 0 },
        visitDuration: 5,
        isOptional: false,
      },
    ],
    tags: ["经典"],
    source: "llm_knowledge",
    difficulty: 2,
    supplyStrategy: {
      waterStations: 1,
      restAreas: 1,
      recommendedBreaks: [
        {
          afterWaypointIndex: 1,
          duration: 15,
          location: "核心景区",
          availableSupply: "可能有便利店或自动售货机",
        },
      ],
      warnings: ["Mock 路线补给信息有限，建议进入景区前确认补给点位置，自备饮水"],
    },
  };

  return [baseRoute];
}
