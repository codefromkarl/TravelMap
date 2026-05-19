/**
 * 酒店数据丰富步骤
 */

import type { TripPlan } from "../../../types/trip.js";
import { enrichHotelsForTrip } from "../../hotel-service.js";
import type { PostProcessConfig, PostProcessStep } from "../pipeline.js";

export class HotelEnrichStep implements PostProcessStep {
  name = "hotel-enrich";

  isEnabled(config: PostProcessConfig): boolean {
    return config.enableHotelEnrich ?? false;
  }

  async run(tripPlan: TripPlan, _config: PostProcessConfig): Promise<TripPlan> {
    return enrichHotelsForTrip(tripPlan);
  }
}
