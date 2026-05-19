import { Type } from "@earendil-works/pi-ai";

// ─── 天气查询工具 ──────────────────────────────────────
export const searchWeatherTool = {
  name: "search_weather",
  label: "天气查询",
  description: "查询城市天气预报",
  parameters: Type.Object({
    city: Type.String(),
    days: Type.Optional(Type.Number({ default: 7 })),
  }),
  execute: async (_id, params) => {
    const { city, days = 7 } = params;
    const weathers = ["晴", "多云", "小雨", "阴"];
    const result = Array.from({ length: days }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() + i);
      return `${d.toISOString().split("T")[0]}: ${weathers[i % weathers.length]} ${18+Math.floor(Math.random()*8)}°C`;
    });
    return {
      content: [{ type: "text", text: `## ${city} ${days}天天气预报\n\n${result.join("\n")}` }],
      details: { city, weather: result },
    };
  },
};