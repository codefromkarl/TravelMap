/**
 * 行动链接生成步骤
 */

import type { TripPlan } from "../../../types/trip.js";
import { enrichTripWithLiveLinks } from "../../action-link-service.js";
import type { PostProcessConfig, PostProcessStep } from "../pipeline.js";

export class ActionLinksStep implements PostProcessStep {
  name = "action-links";

  isEnabled(config: PostProcessConfig): boolean {
    return config.enableActionLinks ?? true;
  }

  async run(tripPlan: TripPlan, _config: PostProcessConfig): Promise<TripPlan> {
    return enrichTripWithLiveLinks(tripPlan);
  }
}
