/**
 * 预算计算服务 — 从 TripPlan 自动汇总各项费用
 *
 * 支持根据出行人群画像精确计算：
 * - 门票：成人全价，老人/儿童半价，婴幼儿免费
 * - 酒店：按房间数计算（2人1间）
 * - 餐饮：成人全价，老人同成人，儿童半价，婴幼儿免费
 * - 交通：基础1人份，每多2人加1份
 */

import type { Budget, DayPlan, TravelerProfile } from "../types/trip.js";

export interface BudgetCalcParams {
  days: DayPlan[];
  interCityTransportCost?: number;
  dailyTransportBudget?: number; // 每日市内交通预算
  /** 出行人群画像，用于按人数精确计算预算 */
  travelers?: TravelerProfile;
}

// ─── 人数系数计算 ────────────────────────────────────────

/** 门票付费人数系数：成人全价，老人/儿童半价，婴幼儿免费 */
function getTicketMultiplier(travelers?: TravelerProfile): number {
  if (!travelers) return 1;
  return (
    travelers.adults + travelers.seniors * 0.5 + travelers.children * 0.5 + travelers.infants * 0
  );
}

/** 餐饮用餐人数系数：成人+老人全价，儿童半价，婴幼儿免费 */
function getMealMultiplier(travelers?: TravelerProfile): number {
  if (!travelers) return 1;
  return travelers.adults + travelers.seniors + travelers.children * 0.5 + travelers.infants * 0;
}

/** 酒店房间数：2人1间，3-4人2间，以此类推 */
function getRoomCount(travelers?: TravelerProfile): number {
  if (!travelers) return 1;
  const total = travelers.adults + travelers.seniors + travelers.children + travelers.infants;
  return Math.max(1, Math.ceil(total / 2));
}

/** 交通费用系数：基础1人份，每多2个付费出行者加1份 */
function getTransportFactor(travelers?: TravelerProfile): number {
  if (!travelers) return 1;
  const payingTravelers = travelers.adults + travelers.seniors + travelers.children;
  return 1 + (payingTravelers - 1) / 2;
}

// ─── 分项计算 ────────────────────────────────────────────

/** 计算门票总费用 */
function calcAttractions(days: DayPlan[], travelers?: TravelerProfile): number {
  const base = days.reduce(
    (sum, day) => sum + day.attractions.reduce((s, a) => s + a.ticketPrice, 0),
    0,
  );
  return Math.round(base * getTicketMultiplier(travelers));
}

/** 计算住宿总费用 */
function calcHotels(days: DayPlan[], travelers?: TravelerProfile): number {
  const roomCount = getRoomCount(travelers);
  return days.reduce((sum, day) => sum + (day.hotel?.estimatedCost ?? 0) * roomCount, 0);
}

/** 计算餐饮总费用 */
function calcMeals(days: DayPlan[], travelers?: TravelerProfile): number {
  const base = days.reduce(
    (sum, day) => sum + day.meals.reduce((s, m) => s + m.estimatedCost, 0),
    0,
  );
  return Math.round(base * getMealMultiplier(travelers));
}

/** 计算市内交通总费用 */
function calcTransportation(
  days: DayPlan[],
  dailyBudget: number,
  travelers?: TravelerProfile,
): number {
  return Math.round(days.length * dailyBudget * getTransportFactor(travelers));
}

// ─── 主入口 ──────────────────────────────────────────────

/** 计算完整预算 */
export function calculateBudget(params: BudgetCalcParams): Budget {
  const { days, interCityTransportCost = 0, dailyTransportBudget = 50, travelers } = params;

  const totalAttractions = calcAttractions(days, travelers);
  const totalHotels = calcHotels(days, travelers);
  const totalMeals = calcMeals(days, travelers);
  const totalTransportation = calcTransportation(days, dailyTransportBudget, travelers);
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

// ─── 快捷函数 ────────────────────────────────────────────

/**
 * 仅计算预算（同步，无 LLM 调用）
 */
export function calculateBudgetForTrip(
  tripPlan: { days: DayPlan[] },
  dailyTransportBudget = 50,
  interCityTransportCost = 0,
  travelers?: TravelerProfile,
): Budget {
  return calculateBudget({
    days: tripPlan.days,
    interCityTransportCost,
    dailyTransportBudget,
    travelers,
  });
}
