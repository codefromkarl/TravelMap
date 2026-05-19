/**
 * 天气搜索 Provider
 */

import type { TripRequest, WeatherInfo } from "../../../types/trip.js";
import { searchWeather } from "../../weather-service.js";
import type { SearchProvider, SearchProviderResult } from "../types.js";

export class WeatherSearchProvider implements SearchProvider {
  name = "weather";
  resultKey = "weather";

  async search(request: TripRequest): Promise<SearchProviderResult> {
    const city = request.cities.length > 0 ? request.cities[0]!.city : request.city;
    const result = await searchWeather({ city, days: request.travelDays });

    return {
      key: this.resultKey,
      data: result.weather as WeatherInfo[],
      source: result.source,
    };
  }
}
