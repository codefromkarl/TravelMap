/**
 * 酒店搜索 Agent Tool — 基于高德 POI / Google Places 的真实酒店搜索
 */

import { Type } from "@earendil-works/pi-ai";
import { searchHotels } from "../services/hotel-service.js";
import { defineTool } from "./define-tool.js";

export const searchHotelsTool = defineTool({
  name: "search_hotels",
  costTier: "cheap",
  label: "酒店搜索",
  description:
    "搜索指定城市或景点附近的酒店，支持按预算、风格和通勤方式筛选。返回酒店名称、价格、评分、距离等信息。",
  parameters: Type.Object({
    city: Type.String({ description: "城市名称" }),
    latitude: Type.Optional(Type.Number({ description: "搜索中心点纬度（景点坐标）" })),
    longitude: Type.Optional(Type.Number({ description: "搜索中心点经度（景点坐标）" })),
    budget: Type.Optional(Type.String({ description: "预算范围，如 '300-500'" })),
    style: Type.Optional(
      Type.String({
        description: "住宿风格: 经济型 | 精品民宿 | 豪华",
      }),
    ),
    commuteMode: Type.Optional(
      Type.String({
        description: "通勤方式: walk | transit | any",
        enum: ["walk", "transit", "any"],
      }),
    ),
    commuteMinutes: Type.Optional(Type.Number({ description: "通勤时间上限（分钟）, 默认30" })),
  }),
  execute: async (params) => {
    const { city, latitude, longitude, budget, style, commuteMode, commuteMinutes } = params as {
      city: string;
      latitude?: number;
      longitude?: number;
      budget?: string;
      style?: string;
      commuteMode?: "walk" | "transit" | "any";
      commuteMinutes?: number;
    };
    const location = latitude != null && longitude != null ? { latitude, longitude } : undefined;
    return searchHotels({
      city,
      location,
      budget,
      style,
      commuteMode: commuteMode ?? "walk",
      commuteMinutes: commuteMinutes ?? 30,
    });
  },
  format: (result, params) => {
    const { city, commuteMode, commuteMinutes } = params as {
      city: string;
      commuteMode?: string;
      commuteMinutes?: number;
    };
    const mode = commuteMode ?? "walk";
    const minutes = commuteMinutes ?? 30;
    const commuteLabel =
      mode === "walk"
        ? `🚶 步行${minutes}分钟内`
        : mode === "transit"
          ? `🚌 公交${minutes}分钟内`
          : "🚗 任意通勤方式";

    const lines = result.hotels
      .map((h, i) => {
        const tagsStr =
          h.tags.length > 0 ? ` · 标签: ${h.tags.map((t) => `[${t}]`).join(" ")}` : "";
        const transitStr = h.transitAccessible ? "🚌 公共交通可达" : "";
        return (
          `${i + 1}. 🏨 ${h.name}\n` +
          `   📍 距搜索中心 ${(h.distance / 1000).toFixed(1)}km · 🚶 步行约${h.walkMinutes}分钟${transitStr ? ` · ${transitStr}` : ""}\n` +
          `   💰 ${h.priceRange}/晚 · ⭐ ${h.rating}${tagsStr}`
        );
      })
      .join("\n\n");

    const sourceLabel = result.source === "mock" ? "（模拟数据）" : "（真实数据）";
    const header = result.warning ? `> ⚠️ ${result.warning}\n\n` : "";
    return `${header}## ${city}酒店搜索结果 ${sourceLabel}\n\n数据源: ${result.source} | 通勤: ${commuteLabel} | 共 ${result.hotels.length} 家\n\n${lines}`;
  },
  errorHint: (params) => {
    const { city } = params as { city: string };
    return `建议推荐${city}的热门住宿区域`;
  },
});
