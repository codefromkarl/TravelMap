/**
 * 天气查询 Agent Tool
 */

import { Type } from "@earendil-works/pi-ai";
import { searchWeather } from "../services/weather-service.js";
import { defineTool } from "./define-tool.js";

export const searchWeatherTool = defineTool({
  name: "search_weather",
  costTier: "cheap",
  label: "天气查询",
  description: "查询指定城市未来几天的天气预报，返回日期、天气状况、温度、风向风力",
  parameters: Type.Object({
    city: Type.String({ description: "城市名称" }),
    days: Type.Optional(Type.Number({ description: "查询天数，默认7天", default: 7 })),
  }),
  execute: async (params) => {
    const { city, days } = params as { city: string; days?: number };
    return searchWeather({ city, days: days ?? 7 });
  },
  format: (result, params) => {
    const { city } = params as { city: string };
    const summary = result.weather
      .map(
        (w) =>
          `${w.date}: 白天${w.dayWeather} ${w.dayTemp}°C / 夜间${w.nightWeather} ${w.nightTemp}°C | ${w.windDirection} ${w.windPower}`,
      )
      .join("\n");
    return `## ${city}天气预报 (数据源: ${result.source})\n\n${summary}`;
  },
  errorHint: (params) => {
    const { city } = params as { city: string };
    return `建议根据季节给出${city}穿衣建议`;
  },
});
