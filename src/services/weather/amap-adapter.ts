/**
 * 高德天气适配器
 *
 * 特点：3天预报，中文，5000次/天免费
 * API: https://restapi.amap.com/v3/weather/weatherInfo
 */

import type { WeatherInfo } from "../../types/trip.js";
import { fetchWithTimeout } from "../http-client.js";
import type { WeatherProvider, WeatherResult, WeatherSearchParams } from "./types.js";

interface AmapWeatherCast {
  date: string;
  dayweather: string;
  nightweather: string;
  daytemp: string;
  nighttemp: string;
  daywind: string;
  nightwind: string;
  daypower: string;
  nightpower: string;
}

interface AmapWeatherResponse {
  status: string;
  forecasts: Array<{
    city: string;
    casts: AmapWeatherCast[];
  }>;
}

export class AmapWeatherProvider implements WeatherProvider {
  name = "amap";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async fetchWeather(params: WeatherSearchParams): Promise<WeatherResult> {
    const adcode = await this.getAdcode(params.city);
    const url = `https://restapi.amap.com/v3/weather/weatherInfo?city=${adcode}&key=${this.apiKey}&extensions=all`;
    const res = await fetchWithTimeout(url, { timeout: 8000 });
    if (!res.ok) throw new Error(`Amap weather error: ${res.status}`);

    const data = (await res.json()) as AmapWeatherResponse;
    if (data.status !== "1" || !data.forecasts?.length || !data.forecasts[0].casts?.length) {
      throw new Error(`Amap weather no data: ${params.city}`);
    }

    const casts = data.forecasts[0].casts;
    const days = Math.min(params.days ?? 3, casts.length);

    const weather: WeatherInfo[] = casts.slice(0, days).map((cast) => ({
      date: cast.date,
      city: params.city,
      dayWeather: cast.dayweather,
      nightWeather: cast.nightweather,
      dayTemp: Number.parseInt(cast.daytemp, 10),
      nightTemp: Number.parseInt(cast.nighttemp, 10),
      windDirection: cast.daywind,
      windPower: cast.daypower,
    }));

    return { weather, source: this.name };
  }

  private async getAdcode(city: string): Promise<string> {
    const url = `https://restapi.amap.com/v3/geocode/geo?key=${this.apiKey}&address=${encodeURIComponent(city)}&city=${encodeURIComponent(city)}`;
    const res = await fetchWithTimeout(url, { timeout: 5000 });
    if (!res.ok) throw new Error(`Amap geocode error: ${res.status}`);
    const data = (await res.json()) as {
      status: string;
      geocodes: { adcode: string }[];
    };
    if (data.status !== "1" || !data.geocodes?.length || !data.geocodes[0].adcode) {
      throw new Error(`Amap adcode not found for: ${city}`);
    }
    return data.geocodes[0].adcode;
  }
}
