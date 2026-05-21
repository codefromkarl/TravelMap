/**
 * 后处理管线 — Step 接口与 Pipeline 执行引擎
 *
 * 每个后处理步骤实现 PostProcessStep 接口，
 * Pipeline 负责按序执行、错误隔离、结果收集。
 *
 * 添加新步骤只需实现 PostProcessStep 并注册到 pipeline。
 */

import type { TravelerProfile, TripPlan } from "../../types/trip.js";
import { getLogger } from "../logger.js";

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

// ─── Step 分组 ─────────────────────────────────────────────

/** 步骤分组 — 同组内步骤并行执行，不同组之间串行 */
export interface StepGroup {
  /** 分组名称（用于日志） */
  name: string;
  /** 同组内并行执行的步骤 */
  steps: PostProcessStep[];
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
  /** 总执行时间（毫秒） */
  totalDuration: number;
}

export class PostProcessPipeline {
  private steps: PostProcessStep[] = [];
  private groups: StepGroup[] = [];
  private useGroupedExecution = false;

  /** 注册单个步骤（串行模式，向后兼容） */
  add(step: PostProcessStep): this {
    this.steps.push(step);
    return this;
  }

  /** 注册一个步骤分组（组内并行执行） */
  addGroup(group: StepGroup): this {
    this.groups.push(group);
    this.useGroupedExecution = true;
    return this;
  }

  /** 获取已注册的步骤列表（串行模式） */
  getSteps(): readonly PostProcessStep[] {
    return this.steps;
  }

  /** 获取已注册的分组列表 */
  getGroups(): readonly StepGroup[] {
    return this.groups;
  }

  /** 执行管线（自动选择串行或分组并行模式） */
  async run(tripPlan: TripPlan, config: PostProcessConfig): Promise<PipelineResult> {
    if (this.useGroupedExecution) {
      return this.runGrouped(tripPlan, config);
    }
    return this.runSequential(tripPlan, config);
  }

  /** Pipeline 整体超时（毫秒） */
  private static readonly PIPELINE_TIMEOUT_MS = 30_000;

  /** 分组并行执行 — 组内真正并行，组间串行 */
  private async runGrouped(tripPlan: TripPlan, config: PostProcessConfig): Promise<PipelineResult> {
    const logger = getLogger().child({ component: "post-process-pipeline" });
    const pipelineStart = Date.now();
    let current = tripPlan;
    const stepResults: StepResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const group of this.groups) {
      // 检查整体超时
      if (Date.now() - pipelineStart > PostProcessPipeline.PIPELINE_TIMEOUT_MS) {
        logger.warn("pipeline 整体超时，跳过剩余分组", {
          group: group.name,
          elapsed: Date.now() - pipelineStart,
        });
        stepResults.push({
          stepName: group.name,
          tripPlan: current,
          success: false,
          error: `Pipeline timeout after ${PostProcessPipeline.PIPELINE_TIMEOUT_MS}ms`,
        });
        failureCount++;
        break;
      }

      // 过滤出启用的步骤
      const enabledSteps = group.steps.filter((s) => s.isEnabled(config));

      if (enabledSteps.length === 0) {
        logger.debug("分组跳过（无启用步骤）", { group: group.name });
        continue;
      }

      if (enabledSteps.length === 1) {
        // 单步骤直接执行，无需 Promise.all
        const step = enabledSteps[0]!;
        const start = Date.now();
        try {
          current = await step.run(current, config);
          const duration = Date.now() - start;
          logger.debug("步骤完成", { group: group.name, step: step.name, duration });
          stepResults.push({ stepName: step.name, tripPlan: current, success: true });
          successCount++;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          logger.warn("步骤失败", {
            group: group.name,
            step: step.name,
            duration: Date.now() - start,
            error: errorMsg,
          });
          stepResults.push({
            stepName: step.name,
            tripPlan: current,
            success: false,
            error: errorMsg,
          });
          failureCount++;
        }
        continue;
      }

      // 组内步骤串行执行（每步接收前一步的输出，保证数据依赖正确）
      const groupStart = Date.now();
      logger.info("分组开始", { group: group.name, stepCount: enabledSteps.length });

      for (const step of enabledSteps) {
        const start = Date.now();
        try {
          current = await step.run(current, config);
          const duration = Date.now() - start;
          logger.debug("步骤完成", { group: group.name, step: step.name, duration });
          stepResults.push({ stepName: step.name, tripPlan: current, success: true });
          successCount++;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          logger.warn("步骤失败", {
            group: group.name,
            step: step.name,
            duration: Date.now() - start,
            error: errorMsg,
          });
          stepResults.push({
            stepName: step.name,
            tripPlan: current,
            success: false,
            error: errorMsg,
          });
          failureCount++;
        }
      }

      const groupDuration = Date.now() - groupStart;
      logger.info("分组完成", { group: group.name, duration: groupDuration });
    }

    const totalDuration = Date.now() - pipelineStart;
    logger.info("pipeline 完成（分组并行）", {
      successCount,
      failureCount,
      totalSteps: stepResults.length,
      totalDuration,
    });
    return { tripPlan: current, stepResults, successCount, failureCount, totalDuration };
  }

  /** 串行执行（向后兼容） */
  private async runSequential(
    tripPlan: TripPlan,
    config: PostProcessConfig,
  ): Promise<PipelineResult> {
    const logger = getLogger().child({ component: "post-process-pipeline" });
    const pipelineStart = Date.now();
    let current = tripPlan;
    const stepResults: StepResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const step of this.steps) {
      // 检查整体超时
      if (Date.now() - pipelineStart > PostProcessPipeline.PIPELINE_TIMEOUT_MS) {
        logger.warn("pipeline 整体超时，跳过剩余步骤", {
          step: step.name,
          elapsed: Date.now() - pipelineStart,
        });
        stepResults.push({
          stepName: step.name,
          tripPlan: current,
          success: false,
          error: `Pipeline timeout after ${PostProcessPipeline.PIPELINE_TIMEOUT_MS}ms`,
        });
        failureCount++;
        break;
      }

      if (!step.isEnabled(config)) {
        logger.debug("步骤跳过（未启用）", { step: step.name });
        continue;
      }

      const start = Date.now();
      try {
        current = await step.run(current, config);
        const duration = Date.now() - start;
        logger.debug("步骤完成", { step: step.name, duration });
        stepResults.push({ stepName: step.name, tripPlan: current, success: true });
        successCount++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.warn("步骤失败", { step: step.name, duration: Date.now() - start, error: errorMsg });
        stepResults.push({
          stepName: step.name,
          tripPlan: current,
          success: false,
          error: errorMsg,
        });
        failureCount++;
      }
    }

    const totalDuration = Date.now() - pipelineStart;
    logger.info("pipeline 完成", {
      successCount,
      failureCount,
      totalSteps: stepResults.length,
      totalDuration,
    });
    return { tripPlan: current, stepResults, successCount, failureCount, totalDuration };
  }
}
