/**
 * 编排后处理服务 — 确定性计算移出 LLM
 *
 * 在 LLM 编排完成行程后，通过代码层自动调用：
 *   1. 预算计算 (calculateBudget) — 纯数学求和
 *   2. 行动链接生成 (enrichTripWithLiveLinks) — API 调用 + URL 生成
 *
 * 内部使用 Pipeline + Step 模式，每个步骤独立可测。
 * 此文件保留原有公共 API 的向后兼容入口。
 */

import type { TravelerProfile, TripPlan } from "../types/trip.js";
import { enrichTripWithLiveLinks } from "./action-link-service.js";
import { calculateBudget } from "./budget-service.js";
import { getAttractionImages } from "./image-service.js";
import {
  createDefaultPipeline,
  type PostProcessConfig as PipelineConfig,
} from "./post-process/index.js";
import type { BudgetCheckStep } from "./post-process/steps/budget-check-step.js";
import type { ConsistencyCheckStep } from "./post-process/steps/consistency-check-step.js";

// ─── 后处理配置（向后兼容）──────────────────────────────

export interface PostProcessorConfig {
  /** 每日市内交通预算（元） */
  dailyTransportBudget?: number;
  /** 城际交通总费用（元） */
  interCityTransportCost?: number;
  /** 预算上限（元），设置后检查超支 */
  budgetLimit?: number;
  /** 是否生成行动链接 */
  enableActionLinks?: boolean;
  /** 是否启用餐厅推荐丰富 */
  enableRestaurantEnrich?: boolean;
  /** 是否启用城际交通方案丰富 */
  enableTransportEnrich?: boolean;
  /** 是否启用酒店数据丰富 */
  enableHotelEnrich?: boolean;
  /** 出行人群画像 */
  travelers?: TravelerProfile;
  /** 是否启用景点图片丰富（需配置 Unsplash/Pexels API Key） */
  enableImageEnrich?: boolean;
}

export interface PostProcessorResult {
  tripPlan: TripPlan;
  budgetCalculated: boolean;
  linksGenerated: boolean;
  budgetCheck?: {
    overBudget: boolean;
    suggestions: string[];
  };
  consistencyCheck?: TripPlanConsistency;
}

// ─── 主入口 ──────────────────────────────────────────────

/**
 * 对编排完成的 TripPlan 进行后处理
 *
 * 使用 Pipeline 引擎按序执行各步骤，
 * 单个步骤失败不阻塞后续步骤。
 */
export async function postProcessTripPlan(
  tripPlan: TripPlan,
  config: PostProcessorConfig = {},
): Promise<PostProcessorResult> {
  const pipeline = createDefaultPipeline();

  // 将旧配置映射到 pipeline 配置
  const pipelineConfig: PipelineConfig = {
    dailyTransportBudget: config.dailyTransportBudget ?? 50,
    interCityTransportCost: config.interCityTransportCost ?? 0,
    budgetLimit: config.budgetLimit,
    enableActionLinks: config.enableActionLinks ?? true,
    enableRestaurantEnrich: config.enableRestaurantEnrich ?? false,
    enableTransportEnrich: config.enableTransportEnrich ?? false,
    enableHotelEnrich: config.enableHotelEnrich ?? false,
    travelers: config.travelers,
  };

  const result = await pipeline.run(tripPlan, pipelineConfig);

  // 从步骤实例中提取检查结果（兼容串行和分组模式）
  const allSteps = [...pipeline.getSteps(), ...pipeline.getGroups().flatMap((g) => g.steps)];
  const budgetCheckStep = allSteps.find((s) => s.name === "budget-check") as
    | BudgetCheckStep
    | undefined;
  const consistencyCheckStep = allSteps.find((s) => s.name === "consistency-check") as
    | ConsistencyCheckStep
    | undefined;

  return {
    tripPlan: result.tripPlan,
    budgetCalculated: result.stepResults.some((r) => r.stepName === "budget-calc" && r.success),
    linksGenerated: result.stepResults.some((r) => r.stepName === "action-links" && r.success),
    budgetCheck: budgetCheckStep?.budgetCheck,
    consistencyCheck: consistencyCheckStep?.consistency,
  };
}

// ─── 图片丰富（独立步骤，在 pipeline 外执行）───────────────

/** 为行程中的景点添加图片（需配置图片 API Key） */
export async function enrichTripImages(tripPlan: TripPlan): Promise<TripPlan> {
  const enriched = structuredClone(tripPlan);

  for (const day of enriched.days) {
    for (const attr of day.attractions) {
      if (!attr.images || attr.images.length === 0) {
        try {
          attr.images = await getAttractionImages(
            attr.nameZh || attr.name,
            day.city || enriched.city,
          );
        } catch {
          // 图片丰富失败不阻塞行程
          attr.images = [];
        }
      }
    }
  }

  return enriched;
}

// ─── 快捷函数 ──────────────────────────────────────────────

/** 仅计算预算（同步，无 LLM 调用） */
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

/** 仅生成行动链接（异步，可能调用 trvl CLI） */
export async function enrichLinksForTrip(tripPlan: TripPlan): Promise<TripPlan> {
  return enrichTripWithLiveLinks(tripPlan);
}

// ─── 行程一致性校验 ──────────────────────────────────────────

export interface TripPlanConsistency {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * 校验 TripPlan 一致性 — 日期连续性、天数匹配、城市覆盖
 */
export function validateTripPlanConsistency(tripPlan: TripPlan): TripPlanConsistency {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (tripPlan.days.length === 0) {
    errors.push("行程没有任何天数数据");
  }

  if (tripPlan.days.length > 1) {
    for (let i = 1; i < tripPlan.days.length; i++) {
      const prev = new Date(tripPlan.days[i - 1]!.date);
      const curr = new Date(tripPlan.days[i]!.date);
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));

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

  for (const day of tripPlan.days) {
    if (day.attractions.length === 0 && !day.isTransferDay) {
      warnings.push(`${day.date}(${day.city})没有安排景点`);
    }
  }

  if (tripPlan.cities.length > 1) {
    const hasTransferDay = tripPlan.days.some((d) => d.isTransferDay);
    if (!hasTransferDay) {
      warnings.push(`多城市行程(${tripPlan.cities.join("→")})没有城际移动日`);
    }
  }

  for (let i = 0; i < tripPlan.days.length; i++) {
    const expected = i + 1;
    if (tripPlan.days[i]!.dayIndex !== expected) {
      warnings.push(`第 ${i + 1} 天的 dayIndex 为 ${tripPlan.days[i]!.dayIndex}，期望 ${expected}`);
    }
  }

  // 坐标完整性检查
  for (const day of tripPlan.days) {
    for (const attr of day.attractions) {
      const loc = attr.location;
      if (!loc || !loc.latitude || !loc.longitude || (loc.latitude === 0 && loc.longitude === 0)) {
        errors.push(`${day.date} 的景点 "${attr.nameZh || attr.name}" 缺少坐标（location），地图无法渲染`);
      }
    }
  }

  return { valid: errors.length === 0, warnings, errors };
}
