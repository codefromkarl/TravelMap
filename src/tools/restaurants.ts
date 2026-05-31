/**
 * 餐厅搜索 Agent Tool
 */

import { Type } from "@earendil-works/pi-ai";
import { searchNearbyRestaurants } from "../services/restaurant-service.js";
import { defineTool } from "./define-tool.js";

export const searchRestaurantsTool = defineTool({
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
  execute: async (params) => {
    const { city, latitude, longitude, radius, mealType, cuisine, limit } = params as {
      city: string;
      latitude: number;
      longitude: number;
      radius?: number;
      mealType?: "breakfast" | "lunch" | "dinner";
      cuisine?: string;
      limit?: number;
    };
    return searchNearbyRestaurants({
      location: { latitude, longitude },
      city,
      radius,
      mealType,
      cuisine,
      limit,
    });
  },
  format: (result, params) => {
    const { city } = params as { city: string };
    const lines = result.restaurants.map(
      (r) =>
        `- **${r.name}** | 评分: ${r.rating} | 人均: ¥${r.averageCost} | 距离: ${r.distance}m (步行${r.walkMinutes}分钟) | ${r.cuisine}${r.businessHours ? ` | 营业: ${r.businessHours}` : ""}`,
    );
    const header = result.warning ? `> ⚠️ ${result.warning}\n\n` : "";
    const sourceLabel = result.source === "mock" ? "（模拟数据）" : "（真实数据）";
    return `${header}## ${city}附近餐厅推荐 ${sourceLabel}\n\n${lines.join("\n")}`;
  },
  errorHint: (params) => {
    const { city } = params as { city: string };
    return `建议推荐${city}当地特色美食`;
  },
});
