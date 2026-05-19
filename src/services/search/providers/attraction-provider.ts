/**
 * 景点搜索 Provider
 */

import type { TripRequest } from "../../../types/trip.js";
import type { EnrichedAttraction } from "../../multi-source-service.js";
import { searchAttractionsMultiSource } from "../../multi-source-service.js";
import type { SearchProvider, SearchProviderResult } from "../types.js";

export class AttractionSearchProvider implements SearchProvider {
  name = "attractions";
  resultKey = "attractions";

  async search(request: TripRequest): Promise<SearchProviderResult> {
    const city = request.cities.length > 0 ? request.cities[0]!.city : request.city;
    const result = await searchAttractionsMultiSource({
      city,
      preferences: request.preferences,
    });

    return {
      key: this.resultKey,
      data: result.attractions as EnrichedAttraction[],
      source: result.sources.join(","),
    };
  }
}
