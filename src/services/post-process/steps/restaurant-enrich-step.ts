/**
 * 餐厅推荐丰富步骤
 */

import type { TripPlan } from "../../../types/trip.js";
import { enrichDayMeals } from "../../restaurant-service.js";
import type { PostProcessConfig, PostProcessStep } from "../pipeline.js";

export class RestaurantEnrichStep implements PostProcessStep {
  name = "restaurant-enrich";

  isEnabled(config: PostProcessConfig): boolean {
    return config.enableRestaurantEnrich ?? false;
  }

  async run(tripPlan: TripPlan, _config: PostProcessConfig): Promise<TripPlan> {
    const enrichedDays = await Promise.all(tripPlan.days.map((day) => enrichDayMeals(day)));
    return { ...tripPlan, days: enrichedDays };
  }
}
