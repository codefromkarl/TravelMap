/**
 * 和风天气适配器
 *
 * 特点：7天预报，原生中文，1000次/天免费
 * API: https://devapi.qweather.com/v7/weather/7d
 */

import type { WeatherInfo } from "../../types/trip.js";
import { fetchWithTimeout } from "../http-client.js";
import type { WeatherProvider, WeatherResult, WeatherSearchParams } from "./types.js";

interface QWeatherDailyItem {
  fxDate: string;
  textDay: string;
  textNight: string;
  tempMax: string;
  tempMin: string;
  windDirDay: string;
  windScaleDay: string;
}

interface QWeatherResponse {
  code: string;
  daily: QWeatherDailyItem[];
}

export interface QWeatherConfig {
  apiKey: string;
  /** 可选：用于获取经纬度的 OWM API Key */
  owmApiKey?: string;
}

export class QWeatherProvider implements WeatherProvider {
  name = "qweather";
  private config: QWeatherConfig;

  constructor(config: QWeatherConfig) {
    this.config = config;
  }

  isAvailable(): boolean {
    return !!this.config.apiKey;
  }

  async fetchWeather(params: WeatherSearchParams): Promise<WeatherResult> {
    // 和风天气支持城市名直查，但经纬度更准确
    // 这里复用 OWM geocode 如果有 OWM key，否则用城市名
    let location: string;

    if (this.config.owmApiKey) {
      try {
        const { lat, lon } = await this.geocodeCity(params.city, this.config.owmApiKey);
        location = `${lon.toFixed(2)},${lat.toFixed(2)}`;
      } catch {
        location = params.city;
      }
    } else {
      location = params.city;
    }

    const url = `https://devapi.qweather.com/v7/weather/7d?location=${encodeURIComponent(location)}&key=${this.config.apiKey}`;
    const res = await fetchWithTimeout(url, { timeout: 8000 });
    if (!res.ok) throw new Error(`QWeather error: ${res.status}`);

    const data = (await res.json()) as QWeatherResponse;
    if (data.code !== "200" || !data.daily?.length) {
      throw new Error(`QWeather no data: code=${data.code}`);
    }

    const days = params.days ?? 7;
    const weather: WeatherInfo[] = data.daily.slice(0, days).map((item) => ({
      date: item.fxDate,
      city: params.city,
      dayWeather: item.textDay,
      nightWeather: item.textNight,
      dayTemp: Number.parseInt(item.tempMax, 10),
      nightTemp: Number.parseInt(item.tempMin, 10),
      windDirection: item.windDirDay,
      windPower: item.windScaleDay.includes("级") ? item.windScaleDay : `${item.windScaleDay}级`,
    }));

    return { weather, source: this.name };
  }

  private async geocodeCity(city: string, apiKey: string): Promise<{ lat: number; lon: number }> {
    const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${apiKey}`;
    const res = await fetchWithTimeout(url, { timeout: 5000 });
    if (!res.ok) throw new Error(`OWM Geocode error: ${res.status}`);
    const data = (await res.json()) as { lat: number; lon: number }[];
    if (!data.length) throw new Error(`City not found: ${city}`);
    return { lat: data[0].lat, lon: data[0].lon };
  }
}
