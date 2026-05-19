/**
 * 餐厅搜索 Agent Tool
 */

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { searchNearbyRestaurants } from "../services/restaurant-service.js";

export const searchRestaurantsTool: AgentTool & { costTier: "cheap" } = {
  name: "search_restaurants",
  costTier: "cheap",
  label: "餐厅搜索",
  description:
    "搜索指定位置附近的餐厅，返回名称、评分、人均消费、距离等信息。支持按餐类（早餐/午餐/晚餐）和菜系筛选。",
  parameters: Type.Object({
    city: Type.String({ description: "城市名称" }),
    latitude: Type.Number({ description: "搜索中心点纬度" }),
    longitude: Type.Number({ description: "搜索中心点经度" }),
    radius: Type.Optional(Type.Number({ description: "搜索半径（米），默认1000", default: 1000 })),
    mealType: Type.Optional(
      Type.String({
        description: "餐类: breakfast / lunch / dinner",
        enum: ["breakfast", "lunch", "dinner"],
      }),
    ),
    cuisine: Type.Optional(Type.String({ description: "菜系偏好，如 '川菜'、'日料'" })),
    limit: Type.Optional(Type.Number({ description: "返回数量上限，默认5", default: 5 })),
  }),
  execute: async (_toolCallId, params) => {
    const { city, latitude, longitude, radius, mealType, cuisine, limit } = params as {
      city: string;
      latitude: number;
      longitude: number;
      radius?: number;
      mealType?: "breakfast" | "lunch" | "dinner";
      cuisine?: string;
      limit?: number;
    };

    try {
      const { restaurants, source, warning } = await searchNearbyRestaurants({
        location: { latitude, longitude },
        city,
        radius,
        mealType,
        cuisine,
        limit,
      });

      const lines = restaurants.map(
        (r) =>
          `- **${r.name}** | 评分: ${r.rating} | 人均: ¥${r.averageCost} | 距离: ${r.distance}m (步行${r.walkMinutes}分钟) | ${r.cuisine}${r.businessHours ? ` | 营业: ${r.businessHours}` : ""}`,
      );

      const header = warning ? `> ⚠️ ${warning}\n\n` : "";
      const sourceLabel = source === "mock" ? "（模拟数据）" : "（真实数据）";

      return {
        content: [
          {
            type: "text" as const,
            text: `${header}## ${city}附近餐厅推荐 ${sourceLabel}\n\n${lines.join("\n")}`,
          },
        ],
        details: { city, restaurants, source, warning },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text" as const,
            text: `餐厅搜索遇到问题（${city}）：${msg}。建议推荐当地特色美食。`,
          },
        ],
        details: { city, error: msg },
      };
    }
  },
};
