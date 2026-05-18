/**
 * 天气查询 Agent Tool
 */

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { searchWeather } from "../services/weather-service.js";

export const searchWeatherTool: AgentTool = {
  name: "search_weather",
  label: "天气查询",
  description: "查询指定城市未来几天的天气预报，返回日期、天气状况、温度、风向风力",
  parameters: Type.Object({
    city: Type.String({ description: "城市名称" }),
    days: Type.Optional(Type.Number({ description: "查询天数，默认7天", default: 7 })),
  }),
  execute: async (_toolCallId, params) => {
    const { city, days } = params as { city: string; days?: number };

    try {
      const { weather, source } = await searchWeather({ city, days: days ?? 7 });

      const summary = weather
        .map(
          (w) =>
            `${w.date}: 白天${w.dayWeather} ${w.dayTemp}°C / 夜间${w.nightWeather} ${w.nightTemp}°C | ${w.windDirection} ${w.windPower}`,
        )
        .join("\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `## ${city}天气预报 (数据源: ${source})\n\n${summary}`,
          },
        ],
        details: { city, weather, source },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text" as const,
            text: `天气查询遇到问题（${city}）：${msg}。建议根据季节给出穿衣建议。`,
          },
        ],
        details: { city, error: msg },
      };
    }
  },
};
