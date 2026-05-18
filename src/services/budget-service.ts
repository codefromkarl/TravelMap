/**
 * 预算计算服务 — 从 TripPlan 自动汇总各项费用
 */

import type { Budget, DayPlan } from "../types/trip.js";

export interface BudgetCalcParams {
  days: DayPlan[];
  interCityTransportCost?: number;
  dailyTransportBudget?: number; // 每日市内交通预算
}

/** 计算门票总费用 */
function calcAttractions(days: DayPlan[]): number {
  return days.reduce((sum, day) => sum + day.attractions.reduce((s, a) => s + a.ticketPrice, 0), 0);
}

/** 计算住宿总费用 */
function calcHotels(days: DayPlan[]): number {
  return days.reduce((sum, day) => sum + (day.hotel?.estimatedCost ?? 0), 0);
}

/** 计算餐饮总费用 */
function calcMeals(days: DayPlan[]): number {
  return days.reduce((sum, day) => sum + day.meals.reduce((s, m) => s + m.estimatedCost, 0), 0);
}

/** 计算市内交通总费用 */
function calcTransportation(days: DayPlan[], dailyBudget: number): number {
  return days.length * dailyBudget;
}

/** 计算完整预算 */
export function calculateBudget(params: BudgetCalcParams): Budget {
  const { days, interCityTransportCost = 0, dailyTransportBudget = 50 } = params;

  const totalAttractions = calcAttractions(days);
  const totalHotels = calcHotels(days);
  const totalMeals = calcMeals(days);
  const totalTransportation = calcTransportation(days, dailyTransportBudget);
  const totalInterCityTransport = interCityTransportCost;

  const total =
    totalAttractions + totalHotels + totalMeals + totalTransportation + totalInterCityTransport;

  return {
    totalAttractions,
    totalHotels,
    totalMeals,
    totalTransportation,
    totalInterCityTransport,
    total,
  };
}

/** 检查预算是否超出上限，返回优化建议 */
export function checkBudgetOverrun(
  budget: Budget,
  limit: number,
): { overBudget: boolean; suggestions: string[] } {
  if (budget.total <= limit) {
    return { overBudget: false, suggestions: [] };
  }

  const suggestions: string[] = [];
  const overAmount = budget.total - limit;

  if (budget.totalAttractions > 0 && overAmount > budget.totalAttractions * 0.3) {
    suggestions.push("考虑减少付费景点，优先选择免费景点（如公园、街区）");
  }
  if (budget.totalHotels > 0 && overAmount > budget.totalHotels * 0.3) {
    suggestions.push("考虑降低住宿标准，选择经济型酒店或青年旅舍");
  }
  if (budget.totalMeals > 0 && overAmount > budget.totalMeals * 0.3) {
    suggestions.push("考虑部分餐食选择街边小吃或便利店，控制餐饮预算");
  }

  suggestions.push(`当前总预算 ¥${budget.total}，超出上限 ¥${overAmount}`);

  return { overBudget: true, suggestions };
}
