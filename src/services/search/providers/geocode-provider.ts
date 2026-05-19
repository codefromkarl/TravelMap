/**
 * 地理编码 Provider
 */

import type { TripRequest } from "../../../types/trip.js";
import { dualGeocode } from "../../dual-map-service.js";
import type { SearchProvider, SearchProviderResult } from "../types.js";

export class GeocodeSearchProvider implements SearchProvider {
  name = "geocode";
  resultKey = "cityCoords";

  async search(request: TripRequest): Promise<SearchProviderResult> {
    const cities = request.cities.length > 0 ? request.cities.map((c) => c.city) : [request.city];
    const cityCoords = new Map<string, { latitude: number; longitude: number }>();

    await Promise.all(
      cities.map(async (city) => {
        try {
          const { location } = await dualGeocode(city, city);
          cityCoords.set(city, location);
        } catch {
          cityCoords.set(city, { latitude: 0, longitude: 0 });
        }
      }),
    );

    return {
      key: this.resultKey,
      data: cityCoords,
      source: "dual-geocode",
    };
  }
}
