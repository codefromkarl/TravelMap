/**
 * OpenWeatherMap 适配器
 *
 * 特点：5天/3小时预报，需翻译英文描述
 * API: https://api.openweathermap.org/data/2.5/forecast
 */

import type { WeatherInfo } from "../../types/trip.js";
import { fetchWithTimeout } from "../http-client.js";
import type { WeatherProvider, WeatherResult, WeatherSearchParams } from "./types.js";

interface OWMForecastItem {
  dt: number;
  main: { temp: number; temp_min: number; temp_max: number };
  weather: { id: number; main: string; description: string; icon: string }[];
  wind: { speed: number; deg: number };
  dt_txt: string;
}

interface OWMForecastResponse {
  cod: string;
  list: OWMForecastItem[];
  city: { name: string; country: string };
}

interface OWMGeocodeResponse {
  name: string;
  lat: number;
  lon: number;
  country: string;
}

/** OpenWeatherMap 天气描述翻译 */
const weatherDescMap: Record<string, string> = {
  "clear sky": "晴",
  "few clouds": "少云",
  "scattered clouds": "多云",
  "broken clouds": "阴",
  "overcast clouds": "阴",
  "light rain": "小雨",
  "moderate rain": "中雨",
  "heavy intensity rain": "大雨",
  "very heavy rain": "暴雨",
  "light snow": "小雪",
  "heavy snow": "大雪",
  thunderstorm: "雷阵雨",
  mist: "雾",
  fog: "雾",
  haze: "霾",
};

function translateWeather(desc: string): string {
  return weatherDescMap[desc.toLowerCase()] ?? desc;
}

/** 风向角度转中文 */
function windDirToZh(deg: number): string {
  const dirs = ["北风", "东北风", "东风", "东南风", "南风", "西南风", "西风", "西北风"];
  const idx = Math.round(deg / 45) % 8;
  return dirs[idx];
}

/** 风速转风力等级 */
function windSpeedToPower(speed: number): string {
  if (speed < 1) return "1级";
  if (speed < 2) return "2级";
  if (speed < 4) return "3级";
  if (speed < 6) return "4级";
  if (speed < 8) return "5级";
  if (speed < 11) return "6级";
  if (speed < 14) return "7级";
  return "8级以上";
}

export class OpenWeatherMapProvider implements WeatherProvider {
  name = "openweathermap";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async fetchWeather(params: WeatherSearchParams): Promise<WeatherResult> {
    const { lat, lon } = await this.geocodeCity(params.city);
    const days = params.days ?? 7;

    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&cnt=56&appid=${this.apiKey}`;
    const res = await fetchWithTimeout(url, { timeout: 8000 });
    if (!res.ok) throw new Error(`OWM Forecast error: ${res.status}`);

    const data = (await res.json()) as OWMForecastResponse;
    const weather = this.dailySummaryFromForecast(data.list, params.city, days);

    return { weather, source: this.name };
  }

  private async geocodeCity(city: string): Promise<{ lat: number; lon: number }> {
    const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${this.apiKey}`;
    const res = await fetchWithTimeout(url, { timeout: 5000 });
    if (!res.ok) throw new Error(`OWM Geocode error: ${res.status}`);
    const data = (await res.json()) as OWMGeocodeResponse[];
    if (!data.length) throw new Error(`City not found: ${city}`);
    return { lat: data[0].lat, lon: data[0].lon };
  }

  private dailySummaryFromForecast(
    items: OWMForecastItem[],
    city: string,
    days: number,
  ): WeatherInfo[] {
    // 按日期分组
    const byDate = new Map<string, OWMForecastItem[]>();
    for (const item of items) {
      const date = item.dt_txt.split(" ")[0];
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date)!.push(item);
    }

    const result: WeatherInfo[] = [];
    const entries = [...byDate.entries()].slice(0, days);

    for (const [date, dayItems] of entries) {
      const dayTemps = dayItems.filter((_, i) => {
        const hour = Number.parseInt(dayItems[i].dt_txt.split(" ")[1].split(":")[0], 10);
        return hour >= 6 && hour < 18;
      });
      const nightTemps = dayItems.filter((_, i) => {
        const hour = Number.parseInt(dayItems[i].dt_txt.split(" ")[1].split(":")[0], 10);
        return hour < 6 || hour >= 18;
      });

      const dayItem = dayTemps[0] ?? dayItems[0];
      const nightItem = nightTemps[0] ?? dayItems[dayItems.length - 1];

      result.push({
        date,
        city,
        dayWeather: translateWeather(dayItem.weather[0]?.description ?? "晴"),
        nightWeather: translateWeather(nightItem.weather[0]?.description ?? "晴"),
        dayTemp: Math.round(dayItem.main.temp_max),
        nightTemp: Math.round(dayItem.main.temp_min),
        windDirection: windDirToZh(dayItem.wind.deg),
        windPower: windSpeedToPower(dayItem.wind.speed),
      });
    }

    return result;
  }
}
