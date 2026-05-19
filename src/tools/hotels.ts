/**
 * 酒店搜索 Agent Tool — 基于高德 POI / Google Places 的真实酒店搜索
 */

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { searchHotels } from "../services/hotel-service.js";

export const searchHotelsTool: AgentTool & { costTier: "cheap" } = {
  costTier: "cheap",
  name: "search_hotels",
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
  execute: async (_toolCallId, params) => {
    const { city, latitude, longitude, budget, style, commuteMode, commuteMinutes } = params as {
      city: string;
      latitude?: number;
      longitude?: number;
      budget?: string;
      style?: string;
      commuteMode?: "walk" | "transit" | "any";
      commuteMinutes?: number;
    };

    try {
      const location = latitude != null && longitude != null ? { latitude, longitude } : undefined;

      const mode = commuteMode ?? "walk";
      const minutes = commuteMinutes ?? 30;

      const commuteLabel =
        mode === "walk"
          ? `🚶 步行${minutes}分钟内`
          : mode === "transit"
            ? `🚌 公交${minutes}分钟内`
            : "🚗 任意通勤方式";

      const { hotels, source, warning } = await searchHotels({
        city,
        location,
        budget,
        style,
        commuteMode: mode,
        commuteMinutes: minutes,
      });

      const lines = hotels
        .map((h, i) => {
          const tagsStr =
            h.tags.length > 0 ? ` · 标签: ${h.tags.map((t) => `[${t}]`).join(" ")}` : "";
          const transitStr = h.transitAccessible ? "🚌 公共交通可达" : "";
          return (
            `${i + 1}. 🏨 ${h.name}\n` +
            `   📍 距搜索中心 ${(h.distance / 1000).toFixed(1)}km · 🚶 步行约${h.walkMinutes}分钟${transitStr ? " · " + transitStr : ""}\n` +
            `   💰 ${h.priceRange}/晚 · ⭐ ${h.rating}${tagsStr}`
          );
        })
        .join("\n\n");

      const sourceLabel = source === "mock" ? "（模拟数据）" : "（真实数据）";
      const header = warning ? `> ⚠️ ${warning}\n\n` : "";

      return {
        content: [
          {
            type: "text" as const,
            text: `${header}## ${city}酒店搜索结果 ${sourceLabel}\n\n数据源: ${source} | 通勤: ${commuteLabel} | 共 ${hotels.length} 家\n\n${lines}`,
          },
        ],
        details: { city, hotels, source, warning },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text" as const,
            text: `酒店搜索遇到问题（${city}）：${msg}。建议推荐${city}的热门住宿区域。`,
          },
        ],
        details: { city, error: msg },
      };
    }
  },
};
