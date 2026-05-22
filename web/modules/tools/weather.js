import { Type } from "@earendil-works/pi-ai";
import { CITY_CENTERS } from '../context.js?v=4';

// ─── 天气代码映射 ────────────────────────────────────────
const WMO_CODES = {
  0: "☀️ 晴", 1: "🌤️ 大部晴", 2: "⛅ 多云", 3: "☁️ 阴",
  45: "🌫️ 雾", 48: "🌫️ 冻雾",
  51: "🌦️ 小毛毛雨", 53: "🌦️ 毛毛雨", 55: "🌧️ 大毛毛雨",
  61: "🌧️ 小雨", 63: "🌧️ 中雨", 65: "🌧️ 大雨",
  71: "🌨️ 小雪", 73: "🌨️ 中雪", 75: "🌨️ 大雪",
  80: "🌦️ 阵雨", 81: "🌧️ 中阵雨", 82: "🌧️ 大阵雨",
  95: "⛈️ 雷暴", 96: "⛈️ 雷暴+小冰雹", 99: "⛈️ 雷暴+大冰雹",
};

// ─── 天气查询工具 ──────────────────────────────────────
export const searchWeatherTool = {
  name: "search_weather",
  label: "天气查询",
  description: "查询城市天气预报（真实数据）",
  parameters: Type.Object({
    city: Type.String({ description: "城市名称" }),
    days: Type.Optional(Type.Number({ description: "预报天数，默认7", default: 7 })),
  }),
  execute: async (_id, params) => {
    const { city, days = 7 } = params;

    const coords = CITY_CENTERS[city];
    if (!coords) {
      return {
        content: [{ type: "text", text: `## ${city}天气\n\n> ⚠️ 未知城市坐标: ${city}` }],
        details: { city, source: "none" },
      };
    }

    const [lat, lng] = coords;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia/Shanghai&forecast_days=${Math.min(days, 16)}`;

    try {
      const resp = await fetch(url);
      const data = await resp.json();

      if (!data.daily?.time?.length) {
        return {
          content: [{ type: "text", text: `## ${city}天气\n\n> 未获取到天气数据` }],
          details: { city, source: "open-meteo-empty" },
        };
      }

      const lines = data.daily.time.map((date, i) => {
        const code = data.daily.weather_code[i];
        const desc = WMO_CODES[code] ?? `代码${code}`;
        const max = Math.round(data.daily.temperature_2m_max[i]);
        const min = Math.round(data.daily.temperature_2m_min[i]);
        const rain = data.daily.precipitation_probability_max[i];
        const rainStr = rain > 0 ? ` · 🌧️ 降雨概率${rain}%` : "";
        return `${date}: ${desc} ${min}°C ~ ${max}°C${rainStr}`;
      });

      return {
        content: [{
          type: "text",
          text: `## ${city} ${days}天天气预报（真实数据）\n\n数据源: Open-Meteo\n\n${lines.join("\n")}`
        }],
        details: { city, weather: lines, source: "open-meteo" },
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `## ${city}天气\n\n> ⚠️ 获取失败: ${err.message}` }],
        details: { city, source: "error", error: err.message },
      };
    }
  },
};
