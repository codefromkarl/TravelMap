/**
 * 后处理管线 — Step 接口与 Pipeline 执行引擎
 *
 * 每个后处理步骤实现 PostProcessStep 接口，
 * Pipeline 负责按序执行、错误隔离、结果收集。
 *
 * 添加新步骤只需实现 PostProcessStep 并注册到 pipeline。
 */

import type { TravelerProfile, TripPlan } from "../../types/trip.js";

// ─── 配置 ────────────────────────────────────────────────

export interface PostProcessConfig {
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
}

// ─── Step 接口 ───────────────────────────────────────────

/** 单个后处理步骤的结果 */
export interface StepResult {
  /** 步骤名称 */
  stepName: string;
  /** 处理后的行程 */
  tripPlan: TripPlan;
  /** 是否成功执行 */
  success: boolean;
  /** 错误信息（失败时） */
  error?: string;
}

/** 后处理步骤接口 */
export interface PostProcessStep {
  /** 步骤名称（用于日志和调试） */
  name: string;
  /** 是否启用（由 config 控制） */
  isEnabled(config: PostProcessConfig): boolean;
  /** 执行步骤 */
  run(tripPlan: TripPlan, config: PostProcessConfig): Promise<TripPlan>;
}

// ─── Pipeline ────────────────────────────────────────────

export interface PipelineResult {
  /** 最终处理后的行程 */
  tripPlan: TripPlan;
  /** 各步骤执行结果 */
  stepResults: StepResult[];
  /** 成功的步骤数 */
  successCount: number;
  /** 失败的步骤数 */
  failureCount: number;
}

export class PostProcessPipeline {
  private steps: PostProcessStep[] = [];

  /** 注册一个步骤 */
  add(step: PostProcessStep): this {
    this.steps.push(step);
    return this;
  }

  /** 获取已注册的步骤列表 */
  getSteps(): readonly PostProcessStep[] {
    return this.steps;
  }

  /** 按序执行所有启用的步骤，单个步骤失败不阻塞后续 */
  async run(tripPlan: TripPlan, config: PostProcessConfig): Promise<PipelineResult> {
    let current = tripPlan;
    const stepResults: StepResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const step of this.steps) {
      if (!step.isEnabled(config)) continue;

      try {
        current = await step.run(current, config);
        stepResults.push({ stepName: step.name, tripPlan: current, success: true });
        successCount++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.warn(`[PostProcessPipeline] 步骤 "${step.name}" 失败:`, errorMsg);
        stepResults.push({
          stepName: step.name,
          tripPlan: current,
          success: false,
          error: errorMsg,
        });
        failureCount++;
        // 错误隔离：继续执行后续步骤，使用当前行程
      }
    }

    return { tripPlan: current, stepResults, successCount, failureCount };
  }
}
