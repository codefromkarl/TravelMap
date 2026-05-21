/**
 * 默认 Pipeline 工厂 — 注册所有标准后处理步骤
 */

import { type PostProcessConfig, PostProcessPipeline } from "./pipeline.js";
import { ActionLinksStep } from "./steps/action-links-step.js";
import { BudgetCalcStep } from "./steps/budget-calc-step.js";
import { BudgetCheckStep } from "./steps/budget-check-step.js";
import { ConsistencyCheckStep } from "./steps/consistency-check-step.js";
import { GeocodeEnrichStep } from "./steps/geocode-enrich-step.js";
import { HotelEnrichStep } from "./steps/hotel-enrich-step.js";
import { ReservationTimelineStep } from "./steps/reservation-timeline-step.js";
import { RestaurantEnrichStep } from "./steps/restaurant-enrich-step.js";
import { TransportEnrichStep } from "./steps/transport-enrich-step.js";

export type { PipelineResult, PostProcessStep, StepGroup, StepResult } from "./pipeline.js";
export type { PostProcessConfig };
export { PostProcessPipeline };

/**
 * 创建默认后处理管线（混合并行 + 串行执行）
 *
 * 分组策略：
 *   Phase 1 (串行): 餐厅丰富 → 城际交通丰富 → 酒店丰富 → 预约时间轴 → 预算计算 → 行动链接
 *     （这些步骤修改 tripPlan 的不同嵌套属性，串行避免合并冲突）
 *   Phase 2 (并行): 预算上限检查 + 一致性校验
 *     （只读步骤，互不依赖，可安全并行）
 */
export function createDefaultPipeline(): PostProcessPipeline {
  return new PostProcessPipeline()
    .addGroup({
      name: "enrich-and-calc",
      steps: [
        new GeocodeEnrichStep(), // 最先执行：补全缺失坐标
        new RestaurantEnrichStep(),
        new TransportEnrichStep(),
        new HotelEnrichStep(),
        new ReservationTimelineStep(),
        new BudgetCalcStep(),
        new ActionLinksStep(),
      ],
    })
    .addGroup({
      name: "validate",
      steps: [new BudgetCheckStep(), new ConsistencyCheckStep()],
    });
}
