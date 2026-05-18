/**
 * 局部修改服务 — 只重算受影响的日期，已确认行程保持不变
 *
 * 核心逻辑：
 *   1. 从已有 TripPlan 中锁定用户已确认的天数
 *   2. 仅对目标天数重新搜索景点/编排
 *   3. 预算自动重算
 */

import type { Attraction, DayPlan, TripPlan } from "../types/trip.js";
import { searchAttractions } from "./attraction-service.js";
import { calculateBudget } from "./budget-service.js";
import { parseRouteEditIntent, switchAttractionRoute } from "./route-service.js";

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

  // 先检测是否为路线级修改意图（如"西湖换成西线"）
  const routeEdit = await tryRouteEdit(tripPlan, targetDays, instruction);
  if (routeEdit) return routeEdit;

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

/**
 * 尝试路线级修改：当用户指令针对某个景点的内部路线时
 * 只切换路线，不重新搜索景点，不重算预算（同一景区门票不变）
 *
 * 返回 null 表示不是路线级修改，需要走天级别替换
 */
async function tryRouteEdit(
  tripPlan: TripPlan,
  targetDays: number[],
  instruction: string,
): Promise<TripPlan | null> {
  // 收集目标天的所有景点名
  const targetAttractions = targetDays.flatMap((idx) =>
    (tripPlan.days[idx]?.attractions ?? []).map((a) => a.nameZh || a.name),
  );

  // 解析路线修改意图
  const intent = parseRouteEditIntent(instruction, targetAttractions);
  if (!intent) return null;

  // 在目标天中找到对应景点并尝试切换路线
  const newDays = tripPlan.days.map((day, idx) => {
    if (!targetDays.includes(idx)) return day;

    const newAttractions: Attraction[] = [];
    let modified = false;

    for (const attraction of day.attractions) {
      const name = attraction.nameZh || attraction.name;
      if (
        name === intent.attractionName ||
        name.includes(intent.attractionName) ||
        intent.attractionName.includes(name)
      ) {
        // 如果已有路线，尝试切换
        if (attraction.routes?.length) {
          const matchById =
            intent.preferenceTags.length === 0
              ? attraction.routes[0]
              : (attraction.routes.find((r) =>
                  intent.preferenceTags.some((tag) => r.tags.includes(tag) || r.name.includes(tag)),
                ) ?? attraction.routes[0]);

          const updated = switchAttractionRoute(attraction, matchById.id);
          newAttractions.push(updated);
          modified = true;
        } else {
          // 没有路线数据，搜索后附加
          // 注意：这里不 await，保持同步。路线数据会在后续 enrich 阶段补全
          newAttractions.push(attraction);
        }
      } else {
        newAttractions.push(attraction);
      }
    }

    return modified ? { ...day, attractions: newAttractions } : day;
  });

  // 检查是否真的做了修改
  const changed = newDays.some((d, i) => d !== tripPlan.days[i]);
  if (!changed) return null;

  return { ...tripPlan, days: newDays };
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
