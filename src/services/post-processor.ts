/**
 * 编排后处理服务 — 确定性计算移出 LLM
 *
 * 在 LLM 编排完成行程后，通过代码层自动调用：
 *   1. 预算计算 (calculateBudget) — 纯数学求和
 *   2. 行动链接生成 (enrichTripWithLiveLinks) — API 调用 + URL 生成
 *
 * 核心优化：省掉 2-4 次 LLM 工具调用
 */

import type { TripPlan } from "../types/trip.js";
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
  } = config;

  let enriched = { ...tripPlan };
  let budgetCalculated = false;
  let linksGenerated = false;

  // 1. 预算计算
  try {
    const budget = calculateBudget({
      days: enriched.days,
      interCityTransportCost,
      dailyTransportBudget,
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

  return {
    tripPlan: enriched,
    budgetCalculated,
    linksGenerated,
    budgetCheck,
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
): TripPlan {
  const budget = calculateBudget({
    days: tripPlan.days,
    interCityTransportCost,
    dailyTransportBudget,
  });
  return { ...tripPlan, budget };
}

/**
 * 仅生成行动链接（异步，可能调用 trvl CLI）
 */
export async function enrichLinksForTrip(tripPlan: TripPlan): Promise<TripPlan> {
  return enrichTripWithLiveLinks(tripPlan);
}
