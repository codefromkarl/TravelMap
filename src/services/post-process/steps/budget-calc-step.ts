/**
 * 预算计算步骤
 */

import type { TripPlan } from "../../../types/trip.js";
import { calculateBudget } from "../../budget-service.js";
import type { PostProcessConfig, PostProcessStep } from "../pipeline.js";

export class BudgetCalcStep implements PostProcessStep {
  name = "budget-calc";

  isEnabled(_config: PostProcessConfig): boolean {
    return true; // 始终启用
  }

  async run(tripPlan: TripPlan, config: PostProcessConfig): Promise<TripPlan> {
    const budget = calculateBudget({
      days: tripPlan.days,
      interCityTransportCost: config.interCityTransportCost ?? 0,
      dailyTransportBudget: config.dailyTransportBudget ?? 50,
      travelers: config.travelers,
    });
    return { ...tripPlan, budget };
  }
}
