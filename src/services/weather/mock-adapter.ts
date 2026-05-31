/**
 * Mock 天气适配器
 *
 * 特点：无 API 依赖，返回模拟数据
 * 用途：开发测试、无 Key 时降级
 */

import type { WeatherInfo } from "../../types/trip.js";
import type { WeatherProvider, WeatherResult, WeatherSearchParams } from "./types.js";

export class MockWeatherProvider implements WeatherProvider {
  name = "mock";

  isAvailable(): boolean {
    return true; // Mock 总是可用
  }

  async fetchWeather(params: WeatherSearchParams): Promise<WeatherResult> {
    const days = params.days ?? 7;
    const city = params.city;
    const weathers = ["晴", "多云", "晴", "阴", "小雨", "多云", "晴"];
    const weather: WeatherInfo[] = [];

    const baseDate = new Date();
    for (let i = 0; i < days; i++) {
      const date = new Date(baseDate);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split("T")[0];
      const dayHigh = 20 + Math.floor(Math.random() * 10);
      const nightLow = dayHigh - 8 - Math.floor(Math.random() * 5);

      weather.push({
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

    return { weather, source: this.name };
  }
}
