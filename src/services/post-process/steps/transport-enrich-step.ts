/**
 * 城际交通方案丰富步骤
 */

import type { TripPlan } from "../../../types/trip.js";
import { enrichTransferDays } from "../../transport-service.js";
import type { PostProcessConfig, PostProcessStep } from "../pipeline.js";

export class TransportEnrichStep implements PostProcessStep {
  name = "transport-enrich";

  isEnabled(config: PostProcessConfig): boolean {
    return config.enableTransportEnrich ?? false;
  }

  async run(tripPlan: TripPlan, _config: PostProcessConfig): Promise<TripPlan> {
    return enrichTransferDays(tripPlan);
  }
}
