/**
 * 预算上限检查步骤
 *
 * 不修改 tripPlan，只记录检查结果到 stepResult 的 metadata 中。
 */

import type { TripPlan } from "../../../types/trip.js";
import { checkBudgetOverrun } from "../../budget-service.js";
import type { PostProcessConfig, PostProcessStep, StepResult } from "../pipeline.js";

export interface BudgetCheckOutput {
  overBudget: boolean;
  suggestions: string[];
}

/** 扩展 StepResult 以携带预算检查结果 */
export interface BudgetCheckStepResult extends StepResult {
  budgetCheck?: BudgetCheckOutput;
}

export class BudgetCheckStep implements PostProcessStep {
  name = "budget-check";
  /** 预算检查结果（步骤执行后可读取） */
  budgetCheck?: BudgetCheckOutput;

  isEnabled(config: PostProcessConfig): boolean {
    return config.budgetLimit != null && config.budgetLimit > 0;
  }

  async run(tripPlan: TripPlan, config: PostProcessConfig): Promise<TripPlan> {
    if (tripPlan.budget && config.budgetLimit) {
      this.budgetCheck = checkBudgetOverrun(tripPlan.budget, config.budgetLimit);
    }
    return tripPlan; // 不修改行程，只记录检查结果
  }
}
