/**
 * 行程一致性校验步骤
 *
 * 不修改 tripPlan，只记录校验结果到步骤属性中。
 */

import type { TripPlan } from "../../../types/trip.js";
import { type TripPlanConsistency, validateTripPlanConsistency } from "../../post-processor.js";
import type { PostProcessConfig, PostProcessStep } from "../pipeline.js";

export class ConsistencyCheckStep implements PostProcessStep {
  name = "consistency-check";
  /** 一致性校验结果（步骤执行后可读取） */
  consistency?: TripPlanConsistency;

  isEnabled(_config: PostProcessConfig): boolean {
    return true; // 始终启用
  }

  async run(tripPlan: TripPlan, _config: PostProcessConfig): Promise<TripPlan> {
    this.consistency = validateTripPlanConsistency(tripPlan);
    return tripPlan; // 不修改行程，只记录校验结果
  }
}
