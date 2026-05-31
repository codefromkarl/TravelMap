/**
 * 天气 Provider 接口
 *
 * 所有天气后端（和风、高德、OpenWeatherMap、Mock）实现此接口。
 * 统一输入输出，便于测试和扩展。
 */

import type { WeatherInfo } from "../../types/trip.js";

/** 天气搜索参数 */
export interface WeatherSearchParams {
  city: string;
  days?: number;
}

/** 天气查询结果 */
export interface WeatherResult {
  /** 天气数据 */
  weather: WeatherInfo[];
  /** 数据来源 */
  source: string;
}

/** 天气 Provider 接口 */
export interface WeatherProvider {
  /** 引擎名称（如 "qweather", "amap", "openweathermap", "mock"） */
  name: string;

  /** 是否可用（检查 API Key 等配置） */
  isAvailable(): boolean;

  /** 查询天气 */
  fetchWeather(params: WeatherSearchParams): Promise<WeatherResult>;
}
