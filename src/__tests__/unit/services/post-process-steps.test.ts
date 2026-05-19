/**
 * Post-process Steps — 集成冒烟测试
 *
 * 验证每个步骤可以被实例化且接口满足 PostProcessStep。
 * 深度测试由 post-processor.test.ts 和 pipeline 测试覆盖。
 */

import { describe, expect, it } from "vitest";
import type { PostProcessStep } from "../../../services/post-process/pipeline.js";
import { ActionLinksStep } from "../../../services/post-process/steps/action-links-step.js";
import { BudgetCalcStep } from "../../../services/post-process/steps/budget-calc-step.js";
import { BudgetCheckStep } from "../../../services/post-process/steps/budget-check-step.js";
import { ConsistencyCheckStep } from "../../../services/post-process/steps/consistency-check-step.js";
import { HotelEnrichStep } from "../../../services/post-process/steps/hotel-enrich-step.js";
import { ReservationTimelineStep } from "../../../services/post-process/steps/reservation-timeline-step.js";
import { RestaurantEnrichStep } from "../../../services/post-process/steps/restaurant-enrich-step.js";
import { TransportEnrichStep } from "../../../services/post-process/steps/transport-enrich-step.js";

const steps: PostProcessStep[] = [
  new RestaurantEnrichStep(),
  new TransportEnrichStep(),
  new HotelEnrichStep(),
  new ReservationTimelineStep(),
  new BudgetCalcStep(),
  new ActionLinksStep(),
  new BudgetCheckStep(),
  new ConsistencyCheckStep(),
];

describe("Post-process Steps 冒烟测试", () => {
  it("所有步骤都有唯一的名称", () => {
    const names = steps.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("每个步骤都有 isEnabled 方法", () => {
    for (const step of steps) {
      expect(typeof step.isEnabled).toBe("function");
    }
  });

  it("每个步骤都有 run 方法", () => {
    for (const step of steps) {
      expect(typeof step.run).toBe("function");
    }
  });
});
