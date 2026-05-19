/**
 * 默认 Pipeline 工厂 — 注册所有标准后处理步骤
 */

import { type PostProcessConfig, PostProcessPipeline } from "./pipeline.js";
import { ActionLinksStep } from "./steps/action-links-step.js";
import { BudgetCalcStep } from "./steps/budget-calc-step.js";
import { BudgetCheckStep } from "./steps/budget-check-step.js";
import { ConsistencyCheckStep } from "./steps/consistency-check-step.js";
import { HotelEnrichStep } from "./steps/hotel-enrich-step.js";
import { ReservationTimelineStep } from "./steps/reservation-timeline-step.js";
import { RestaurantEnrichStep } from "./steps/restaurant-enrich-step.js";
import { TransportEnrichStep } from "./steps/transport-enrich-step.js";

export type { PipelineResult, PostProcessStep, StepResult } from "./pipeline.js";
export type { PostProcessConfig };
export { PostProcessPipeline };

/**
 * 创建默认后处理管线（包含所有标准步骤）
 *
 * 步骤执行顺序：
 *   1. 餐厅丰富（在预算前，以使用真实人均消费）
 *   2. 城际交通丰富（在预算前）
 *   3. 酒店丰富（在预算前，以使用真实酒店价格）
 *   4. 预约时间轴（在链接前）
 *   5. 预算计算
 *   6. 行动链接
 *   7. 预算上限检查
 *   8. 一致性校验
 */
export function createDefaultPipeline(): PostProcessPipeline {
  return new PostProcessPipeline()
    .add(new RestaurantEnrichStep())
    .add(new TransportEnrichStep())
    .add(new HotelEnrichStep())
    .add(new ReservationTimelineStep())
    .add(new BudgetCalcStep())
    .add(new ActionLinksStep())
    .add(new BudgetCheckStep())
    .add(new ConsistencyCheckStep());
}
