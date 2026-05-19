/**
 * 预约时间轴计算步骤
 */

import type { TripPlan } from "../../../types/trip.js";
import { enrichReservationTimeline } from "../../reservation-timeline-service.js";
import type { PostProcessConfig, PostProcessStep } from "../pipeline.js";

export class ReservationTimelineStep implements PostProcessStep {
  name = "reservation-timeline";

  isEnabled(_config: PostProcessConfig): boolean {
    return true; // 始终启用
  }

  async run(tripPlan: TripPlan, _config: PostProcessConfig): Promise<TripPlan> {
    return {
      ...tripPlan,
      days: enrichReservationTimeline(tripPlan.days),
    };
  }
}
