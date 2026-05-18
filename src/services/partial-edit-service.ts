/**
 * 局部修改服务 — 只重算受影响的日期，已确认行程保持不变
 *
 * 核心逻辑：
 *   1. 从已有 TripPlan 中锁定用户已确认的天数
 *   2. 仅对目标天数重新搜索景点/编排
 *   3. 预算自动重算
 */

import type { DayPlan, TripPlan } from "../types/trip.js";
import { searchAttractions } from "./attraction-service.js";
import { calculateBudget } from "./budget-service.js";

export interface PartialEditRequest {
  /** 原始行程 */
  tripPlan: TripPlan;
  /** 需要修改的天数索引（0-based） */
  targetDays: number[];
  /** 修改指令（自然语言） */
  instruction: string;
}

/** 提取修改指令中的偏好关键词 */
function extractPreferences(instruction: string): string[] {
  const prefMap: Record<string, string[]> = {
    文化: ["历史文化", "博物馆"],
    博物馆: ["博物馆"],
    美食: ["美食"],
    自然: ["自然风光", "公园"],
    购物: ["购物"],
    历史: ["历史文化"],
    古迹: ["历史遗迹"],
    公园: ["公园"],
    乐园: ["主题乐园"],
    艺术: ["艺术", "画廊"],
  };

  const prefs: string[] = [];
  for (const [keyword, tags] of Object.entries(prefMap)) {
    if (instruction.includes(keyword)) {
      prefs.push(...tags);
    }
  }
  return prefs.length > 0 ? [...new Set(prefs)] : [];
}

/** 重编单日行程 */
async function regenerateDay(day: DayPlan, instruction: string): Promise<DayPlan> {
  const prefs = extractPreferences(instruction);
  const { attractions } = await searchAttractions({
    city: day.city,
    preferences: prefs,
    keywords: instruction,
  });

  // 取前 2-3 个景点
  const selectedAttractions = attractions.slice(0, 3);

  // 估算餐饮费用（保持或重设）
  const meals =
    day.meals.length > 0
      ? day.meals
      : [
          {
            type: "breakfast" as const,
            name: `${day.city}特色早餐`,
            description: "当地早餐",
            estimatedCost: 30,
          },
          { type: "lunch" as const, name: "午餐", description: "景区附近", estimatedCost: 60 },
          { type: "dinner" as const, name: "晚餐", description: "市区餐厅", estimatedCost: 80 },
        ];

  return {
    ...day,
    description: `已根据"${instruction}"重新安排`,
    attractions: selectedAttractions,
    meals,
  };
}

/** 执行局部修改 */
export async function applyPartialEdit(request: PartialEditRequest): Promise<TripPlan> {
  const { tripPlan, targetDays, instruction } = request;

  // 深拷贝 days
  const newDays: DayPlan[] = tripPlan.days.map((d) => ({ ...d }));

  // 仅修改目标天数
  for (const idx of targetDays) {
    if (idx >= 0 && idx < newDays.length) {
      newDays[idx] = await regenerateDay(newDays[idx], instruction);
    }
  }

  // 重算预算
  const budget = calculateBudget({ days: newDays });

  return {
    ...tripPlan,
    days: newDays,
    budget,
  };
}

/** 从自然语言中提取目标天数 */
export function parseTargetDays(instruction: string, totalDays: number): number[] {
  const days: number[] = [];

  // 匹配 "第X天" 或 "第X-X天"
  const rangeMatch = instruction.match(/第(\d+)[-到~](\d+)天/);
  if (rangeMatch) {
    const start = Number.parseInt(rangeMatch[1], 10);
    const end = Number.parseInt(rangeMatch[2], 10);
    for (let i = start; i <= end && i <= totalDays; i++) {
      days.push(i - 1); // 0-based
    }
    return days;
  }

  // 匹配单个 "第X天"
  const singleMatches = instruction.matchAll(/第(\d+)天/g);
  for (const m of singleMatches) {
    const dayNum = Number.parseInt(m[1], 10);
    if (dayNum >= 1 && dayNum <= totalDays) {
      days.push(dayNum - 1);
    }
  }

  // 匹配 "第二天" / "第三天" 等中文序数
  const zhOrdinals: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  const zhMatch = instruction.match(/第([一二两三四五六七八九十]+)天/);
  if (zhMatch && !days.length) {
    const ord = zhOrdinals[zhMatch[1]];
    if (ord && ord <= totalDays) {
      days.push(ord - 1);
    }
  }

  // 匹配 "明天" / "后天"
  if (instruction.includes("明天") && totalDays >= 1) {
    days.push(0);
  }
  if (instruction.includes("后天") && totalDays >= 2) {
    days.push(1);
  }

  // 匹配 "最后一天"
  if (instruction.includes("最后一天") && totalDays > 0) {
    days.push(totalDays - 1);
  }

  // 匹配 "所有天" / "全部"
  if (instruction.includes("所有") || instruction.includes("全部")) {
    return Array.from({ length: totalDays }, (_, i) => i);
  }

  // 默认：如果没有匹配到任何天数，返回空数组
  return [...new Set(days)].sort((a, b) => a - b);
}
