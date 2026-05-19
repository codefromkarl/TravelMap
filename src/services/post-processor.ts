/**
 * 编排后处理服务 — 确定性计算移出 LLM
 *
 * 在 LLM 编排完成行程后，通过代码层自动调用：
 *   1. 预算计算 (calculateBudget) — 纯数学求和
 *   2. 行动链接生成 (enrichTripWithLiveLinks) — API 调用 + URL 生成
 *
 * 核心优化：省掉 2-4 次 LLM 工具调用
 */

import type { TravelerProfile, TripPlan } from "../types/trip.js";
import { enrichTripWithLiveLinks } from "./action-link-service.js";
import { calculateBudget } from "./budget-service.js";

// ─── 后处理配置 ──────────────────────────────────────────────

export interface PostProcessorConfig {
  /** 每日市内交通预算（元） */
  dailyTransportBudget?: number;
  /** 城际交通总费用（元） */
  interCityTransportCost?: number;
  /** 预算上限（元），设置后检查超支 */
  budgetLimit?: number;
  /** 是否生成行动链接 */
  enableActionLinks?: boolean;
  /** 出行人群画像，用于按人数精确计算预算 */
  travelers?: TravelerProfile;
}

export interface PostProcessorResult {
  /** 处理后的行程（含 budget + links） */
  tripPlan: TripPlan;
  /** 是否成功计算了预算 */
  budgetCalculated: boolean;
  /** 是否成功生成了行动链接 */
  linksGenerated: boolean;
  /** 预算检查结果（仅当设置了 budgetLimit 时） */
  budgetCheck?: {
    overBudget: boolean;
    suggestions: string[];
  };
  /** 行程一致性校验结果 */
  consistencyCheck?: TripPlanConsistency;
}

// ─── 主入口 ──────────────────────────────────────────────

/**
 * 对编排完成的 TripPlan 进行后处理
 *
 * @param tripPlan LLM 编排生成的行程（无 budget/links）
 * @param config 后处理配置
 * @returns 处理后的完整行程
 */
export async function postProcessTripPlan(
  tripPlan: TripPlan,
  config: PostProcessorConfig = {},
): Promise<PostProcessorResult> {
  const {
    dailyTransportBudget = 50,
    interCityTransportCost = 0,
    budgetLimit,
    enableActionLinks = true,
    travelers,
  } = config;

  let enriched = { ...tripPlan };
  let budgetCalculated = false;
  let linksGenerated = false;

  // 1. 预算计算（含人群画像联动）
  try {
    const budget = calculateBudget({
      days: enriched.days,
      interCityTransportCost,
      dailyTransportBudget,
      travelers,
    });
    enriched.budget = budget;
    budgetCalculated = true;
  } catch (err) {
    console.warn("[PostProcessor] 预算计算失败:", err);
  }

  // 2. 行动链接生成
  if (enableActionLinks) {
    try {
      enriched = await enrichTripWithLiveLinks(enriched);
      linksGenerated = true;
    } catch (err) {
      console.warn("[PostProcessor] 行动链接生成失败:", err);
    }
  }

  // 3. 预算上限检查
  let budgetCheck: PostProcessorResult["budgetCheck"];
  if (budgetLimit != null && budgetLimit > 0 && enriched.budget) {
    const { checkBudgetOverrun } = await import("./budget-service.js");
    budgetCheck = checkBudgetOverrun(enriched.budget, budgetLimit);
  }

  // 4. 行程一致性校验
  const consistencyCheck = validateTripPlanConsistency(enriched);

  return {
    tripPlan: enriched,
    budgetCalculated,
    linksGenerated,
    budgetCheck,
    consistencyCheck,
  };
}

// ─── 快捷函数 ──────────────────────────────────────────────

/**
 * 仅计算预算（同步，无 LLM 调用）
 */
export function calculateBudgetForTrip(
  tripPlan: TripPlan,
  dailyTransportBudget = 50,
  interCityTransportCost = 0,
  travelers?: TravelerProfile,
): TripPlan {
  const budget = calculateBudget({
    days: tripPlan.days,
    interCityTransportCost,
    dailyTransportBudget,
    travelers,
  });
  return { ...tripPlan, budget };
}

/**
 * 仅生成行动链接（异步，可能调用 trvl CLI）
 */
export async function enrichLinksForTrip(tripPlan: TripPlan): Promise<TripPlan> {
  return enrichTripWithLiveLinks(tripPlan);
}

// ─── 行程一致性校验 ──────────────────────────────────────────

export interface TripPlanConsistency {
  /** 是否通过校验 */
  valid: boolean;
  /** 警告列表 */
  warnings: string[];
  /** 错误列表（严重问题） */
  errors: string[];
}

/**
 * 校验 TripPlan 一致性 — 日期连续性、天数匹配、城市覆盖
 *
 * 确定性检查，不依赖 LLM：
 *   - 日期是否连续无间隙
 *   - days 数组长度是否匹配 travelDays
 *   - 每天是否至少有 1 个景点
 *   - 多城市行程是否有城际移动日
 */
export function validateTripPlanConsistency(tripPlan: TripPlan): TripPlanConsistency {
  const warnings: string[] = [];
  const errors: string[] = [];

  // 1. 天数检查
  if (tripPlan.days.length === 0) {
    errors.push("行程没有任何天数数据");
  }

  // 2. 日期连续性
  if (tripPlan.days.length > 1) {
    for (let i = 1; i < tripPlan.days.length; i++) {
      const prev = new Date(tripPlan.days[i - 1]!.date);
      const curr = new Date(tripPlan.days[i]!.date);
      const diffMs = curr.getTime() - prev.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays !== 1) {
        if (diffDays <= 0) {
          errors.push(
            `第 ${i + 1} 天日期(${tripPlan.days[i]!.date})不晚于第 ${i} 天(${tripPlan.days[i - 1]!.date})`,
          );
        } else {
          warnings.push(
            `第 ${i} 天(${tripPlan.days[i - 1]!.date})和第 ${i + 1} 天(${tripPlan.days[i]!.date})之间有 ${diffDays - 1} 天空隙`,
          );
        }
      }
    }
  }

  // 3. 每天至少 1 个景点
  for (const day of tripPlan.days) {
    if (day.attractions.length === 0 && !day.isTransferDay) {
      warnings.push(`${day.date}(${day.city})没有安排景点`);
    }
  }

  // 4. 多城市行程检查城际移动日
  if (tripPlan.cities.length > 1) {
    const hasTransferDay = tripPlan.days.some((d) => d.isTransferDay);
    if (!hasTransferDay) {
      warnings.push(`多城市行程(${tripPlan.cities.join("→")})没有城际移动日`);
    }
  }

  // 5. dayIndex 连续性
  for (let i = 0; i < tripPlan.days.length; i++) {
    const expected = i + 1;
    if (tripPlan.days[i]!.dayIndex !== expected) {
      warnings.push(`第 ${i + 1} 天的 dayIndex 为 ${tripPlan.days[i]!.dayIndex}，期望 ${expected}`);
    }
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}
