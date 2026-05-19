/**
 * 补给点丰富服务 — 将补给验证从路线查询中解耦，作为独立的"细节丰富"步骤
 *
 * 使用时机：
 *   1. 粗略行程已生成后，用户要求"查看补给详情"
 *   2. Agent 编排完成后，post-processor 可选调用
 *   3. 用户点击地图上的"丰富补给数据"按钮
 *
 * 设计原则：
 *   - 与路线查询解耦：enrichAttractionWithRoutes 只做路线查询，不做补给验证
 *   - 按需调用：用户不要求时不触发网络请求（节省 API 额度）
 *   - 渐进增强：先显示静态估算数据，丰富后显示精确坐标+实时价格
 */

import type { Attraction, TripPlan } from "../types/trip.js";
import { validateRouteSupplies } from "./supply-validation-service.js";

// ─── 配置 ────────────────────────────────────────────────

export interface SupplyEnrichConfig {
  /** 是否跳过已验证的补给点（默认 true） */
  skipValidated?: boolean;
  /** 是否仅验证推荐休息点（默认 false） */
  onlyRecommended?: boolean;
}

// ─── 景点级丰富 ──────────────────────────────────────────

/**
 * 为单个景点丰富补给点数据并收集统计
 *
 * @param attraction 已附加路线的景点
 * @param city 城市名
 * @param config 丰富配置
 * @returns 补给点已验证的景点和统计信息
 */
export async function enrichAttractionSuppliesWithStats(
  attraction: Attraction,
  city: string,
  config: SupplyEnrichConfig = {},
  stats: SupplyEnrichStats = {
    attractionsProcessed: 0,
    routesProcessed: 0,
    supplyPointsValidated: 0,
    supplyPointsSkipped: 0,
  },
): Promise<{ attraction: Attraction; stats: SupplyEnrichStats }> {
  if (!attraction.routes || attraction.routes.length === 0) {
    return { attraction, stats };
  }

  stats.attractionsProcessed++;

  const { skipValidated = true } = config;
  const enrichedRoutes = await Promise.all(
    attraction.routes.map(async (route) => {
      stats.routesProcessed++;
      const waypoints = [...route.waypoints];
      let hasChanges = false;

      for (let i = 0; i < waypoints.length; i++) {
        const wp = waypoints[i];
        if (!wp.supplyPoints || wp.supplyPoints.length === 0) continue;

        if (skipValidated) {
          const allExact = wp.supplyPoints.every(
            (sp) => sp.locationAccuracy === "exact" && sp.priceConfidence === "api",
          );
          if (allExact) {
            stats.supplyPointsSkipped += wp.supplyPoints.length;
            continue;
          }
        }

        const validated = await validateRouteSupplies(wp.supplyPoints, city);
        waypoints[i] = { ...wp, supplyPoints: validated };
        stats.supplyPointsValidated += wp.supplyPoints.length;
        hasChanges = true;
      }

      if (!hasChanges) return route;
      return { ...route, waypoints };
    }),
  );

  return {
    attraction: { ...attraction, routes: enrichedRoutes },
    stats,
  };
}

/**
 * 为单个景点丰富补给点数据（无统计）
 *
 * @param attraction 已附加路线的景点
 * @param city 城市名
 * @param config 丰富配置
 * @returns 补给点已验证的景点
 */
export async function enrichAttractionSupplies(
  attraction: Attraction,
  city: string,
  config: SupplyEnrichConfig = {},
): Promise<Attraction> {
  const result = await enrichAttractionSuppliesWithStats(attraction, city, config);
  return result.attraction;
}

// ─── 行程级丰富 ──────────────────────────────────────────

/**
 * 为整个行程丰富补给点数据
 *
 * @param tripPlan 粗略行程计划（已生成但未验证补给）
 * @param config 丰富配置
 * @returns 补给点已验证的行程
 */
export async function enrichTripPlanSupplies(
  tripPlan: TripPlan,
  config: SupplyEnrichConfig = {},
): Promise<TripPlan> {
  const enrichedDays = await Promise.all(
    tripPlan.days.map(async (day) => {
      const enrichedAttractions = await Promise.all(
        day.attractions.map((attr) => enrichAttractionSupplies(attr, day.city, config)),
      );
      return { ...day, attractions: enrichedAttractions };
    }),
  );

  return { ...tripPlan, days: enrichedDays };
}

// ─── 丰富统计 ────────────────────────────────────────────

export interface SupplyEnrichStats {
  /** 处理的景点数量 */
  attractionsProcessed: number;
  /** 处理的路线数量 */
  routesProcessed: number;
  /** 验证的补给点数量 */
  supplyPointsValidated: number;
  /** 跳过的补给点数量（已 exact+api） */
  supplyPointsSkipped: number;
}

/**
 * 丰富行程补给并返回统计信息
 *
 * 复用 enrichAttractionSuppliesWithStats，消除嵌套循环重复
 */
export async function enrichTripPlanSuppliesWithStats(
  tripPlan: TripPlan,
  config: SupplyEnrichConfig = {},
): Promise<{ tripPlan: TripPlan; stats: SupplyEnrichStats }> {
  const stats: SupplyEnrichStats = {
    attractionsProcessed: 0,
    routesProcessed: 0,
    supplyPointsValidated: 0,
    supplyPointsSkipped: 0,
  };

  const enrichedDays = await Promise.all(
    tripPlan.days.map(async (day) => {
      const enrichedAttractions = await Promise.all(
        day.attractions.map(async (attr) => {
          const result = await enrichAttractionSuppliesWithStats(attr, day.city, config, stats);
          return result.attraction;
        }),
      );
      return { ...day, attractions: enrichedAttractions };
    }),
  );

  return { tripPlan: { ...tripPlan, days: enrichedDays }, stats };
}
