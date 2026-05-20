/**
 * 天气查询服务 — 和风天气 > 高德天气 > OpenWeatherMap > mock
 *
 * 和风天气：7天预报，原生中文，1000次/天免费
 * 高德天气：3天预报，5000次/天免费
 * OpenWeatherMap：5天/3小时预报
 * 无 Key 时返回 mock 数据
 */

import type { WeatherInfo } from "../types/trip.js";
import { config } from "./config.js";
import { fetchWithTimeout } from "./http-client.js";
import { getLogger } from "./logger.js";

export interface WeatherSearchParams {
  city: string;
  days?: number;
}

// ─── OpenWeatherMap 类型 ─────────────────────────────────

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

// ─── 和风天气类型 ─────────────────────────────────────────

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

// ─── 高德天气类型 ─────────────────────────────────────────

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

interface AmapRegeocodeResponse {
  status: string;
  regeocode: {
    addressComponent: {
      adcode: string;
    };
  };
}

// ─── 辅助函数 ─────────────────────────────────────────────

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

/** 城市名 → 经纬度 (用于 OpenWeatherMap) */
async function geocodeCity(city: string, apiKey: string): Promise<{ lat: number; lon: number }> {
  const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${apiKey}`;
  const res = await fetchWithTimeout(url, { timeout: 5000 });
  if (!res.ok) throw new Error(`OWM Geocode error: ${res.status}`);
  const data = (await res.json()) as OWMGeocodeResponse[];
  if (!data.length) throw new Error(`City not found: ${city}`);
  return { lat: data[0].lat, lon: data[0].lon };
}

/** 高德：通过城市名获取 adcode */
async function getAmapAdcode(city: string, apiKey: string): Promise<string> {
  const url = `https://restapi.amap.com/v3/geocode/geo?key=${apiKey}&address=${encodeURIComponent(city)}&city=${encodeURIComponent(city)}`;
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

// ─── 和风天气数据源 ─────────────────────────────────────────

/**
 * 调用和风天气 7 天预报
 * 用经纬度查询，需先通过 OWM 或其他方式获取坐标
 */
async function fetchFromQWeather(params: WeatherSearchParams): Promise<WeatherInfo[]> {
  const apiKey = config.qweatherApiKey;
  if (!apiKey) throw new Error("QWEATHER_API_KEY not configured");

  // 先用 OWM geocode 或直接用城市名获取坐标
  // 和风天气支持城市名直查，但经纬度更准确
  // 这里复用 OWM geocode 如果有 OWM key，否则用城市名
  let location: string;

  const owmKey = config.openWeatherApiKey;
  if (owmKey) {
    try {
      const { lat, lon } = await geocodeCity(params.city, owmKey);
      location = `${lon.toFixed(2)},${lat.toFixed(2)}`;
    } catch {
      // OWM geocode 失败，回退到城市名
      location = params.city;
    }
  } else {
    location = params.city;
  }

  const url = `https://devapi.qweather.com/v7/weather/7d?location=${encodeURIComponent(location)}&key=${apiKey}`;
  const res = await fetchWithTimeout(url, { timeout: 8000 });
  if (!res.ok) throw new Error(`QWeather error: ${res.status}`);

  const data = (await res.json()) as QWeatherResponse;
  if (data.code !== "200" || !data.daily?.length) {
    throw new Error(`QWeather no data: code=${data.code}`);
  }

  const days = params.days ?? 7;
  return data.daily.slice(0, days).map((item) => ({
    date: item.fxDate,
    city: params.city,
    dayWeather: item.textDay,
    nightWeather: item.textNight,
    dayTemp: Number.parseInt(item.tempMax, 10),
    nightTemp: Number.parseInt(item.tempMin, 10),
    windDirection: item.windDirDay,
    windPower: item.windScaleDay.includes("级") ? item.windScaleDay : `${item.windScaleDay}级`,
  }));
}

// ─── 高德天气数据源 ─────────────────────────────────────────

/** 调用高德天气 3 天预报 */
async function fetchFromAmapWeather(params: WeatherSearchParams): Promise<WeatherInfo[]> {
  const apiKey = config.amapWebKey;
  if (!apiKey) throw new Error("AMAP_WEB_KEY not configured");

  const adcode = await getAmapAdcode(params.city, apiKey);
  const url = `https://restapi.amap.com/v3/weather/weatherInfo?city=${adcode}&key=${apiKey}&extensions=all`;
  const res = await fetchWithTimeout(url, { timeout: 8000 });
  if (!res.ok) throw new Error(`Amap weather error: ${res.status}`);

  const data = (await res.json()) as AmapWeatherResponse;
  if (data.status !== "1" || !data.forecasts?.length || !data.forecasts[0].casts?.length) {
    throw new Error(`Amap weather no data: ${params.city}`);
  }

  const casts = data.forecasts[0].casts;
  const days = Math.min(params.days ?? 3, casts.length);

  return casts.slice(0, days).map((cast) => ({
    date: cast.date,
    city: params.city,
    dayWeather: cast.dayweather,
    nightWeather: cast.nightweather,
    dayTemp: Number.parseInt(cast.daytemp, 10),
    nightTemp: Number.parseInt(cast.nighttemp, 10),
    windDirection: cast.daywind,
    windPower: cast.daypower,
  }));
}

// ─── OpenWeatherMap 数据源（已有）──────────────────────────

/** 从 3 小时预报中提取每日摘要 */
function dailySummaryFromForecast(
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
      // 取白天时段 (06:00-18:00)
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
      nightTemp: Math.round(nightItem.main.temp_min),
      windDirection: windDirToZh(dayItem.wind.deg),
      windPower: windSpeedToPower(dayItem.wind.speed),
    });
  }

  return result;
}

/** 调用 OpenWeatherMap 5-day forecast */
async function fetchFromOWM(params: WeatherSearchParams, apiKey: string): Promise<WeatherInfo[]> {
  const { lat, lon } = await geocodeCity(params.city, apiKey);
  const days = params.days ?? 7;

  const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&cnt=56&appid=${apiKey}`;
  const res = await fetchWithTimeout(url, { timeout: 8000 });
  if (!res.ok) throw new Error(`OWM Forecast error: ${res.status}`);

  const data = (await res.json()) as OWMForecastResponse;
  return dailySummaryFromForecast(data.list, params.city, days);
}

// ─── Mock 数据 ─────────────────────────────────────────────

/** Mock 天气数据 */
function mockWeather(params: WeatherSearchParams): WeatherInfo[] {
  const days = params.days ?? 7;
  const city = params.city;
  const weathers = ["晴", "多云", "晴", "阴", "小雨", "多云", "晴"];
  const result: WeatherInfo[] = [];

  const baseDate = new Date();
  for (let i = 0; i < days; i++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split("T")[0];
    const dayHigh = 20 + Math.floor(Math.random() * 10);
    const nightLow = dayHigh - 8 - Math.floor(Math.random() * 5);

    result.push({
      date: dateStr,
      city,
      dayWeather: weathers[i % weathers.length],
      nightWeather: i % 3 === 0 ? "晴" : "多云",
      dayTemp: dayHigh,
      nightTemp: nightLow,
      windDirection: "东南风",
      windPower: "3级",
    });
  }

  return result;
}

// ─── 主入口：优先级链 ──────────────────────────────────────

/** 查询天气 — 主入口 */
export async function searchWeather(params: WeatherSearchParams): Promise<{
  weather: WeatherInfo[];
  source: string;
}> {
  const logger = getLogger().child({ component: "weather-service" });

  // 1. 和风天气（7天，中文原生）
  if (config.qweatherApiKey) {
    try {
      const weather = await fetchFromQWeather(params);
      return { weather, source: "qweather" };
    } catch (err) {
      logger.warn("QWeather failed, degrading", {
        error: err instanceof Error ? err.message : err,
      });
    }
  }

  // 2. 高德天气（3天，中文）
  if (config.amapWebKey) {
    try {
      const weather = await fetchFromAmapWeather(params);
      return { weather, source: "amap" };
    } catch (err) {
      logger.warn("Amap weather failed, degrading", {
        error: err instanceof Error ? err.message : err,
      });
    }
  }

  // 3. OpenWeatherMap（5天，需翻译）— 已有实现
  if (config.openWeatherApiKey) {
    try {
      const weather = await fetchFromOWM(params, config.openWeatherApiKey);
      return { weather, source: "openweathermap" };
    } catch (err) {
      logger.warn("OpenWeatherMap failed, using mock", {
        error: err instanceof Error ? err.message : err,
      });
    }
  }

  // 4. Mock 降级
  return { weather: mockWeather(params), source: "mock" };
}
