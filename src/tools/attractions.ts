/**
 * 景点搜索 Agent Tool — 多数据源融合版
 */

import { Type } from "@earendil-works/pi-ai";
import { searchAttractionsMultiSource } from "../services/multi-source-service.js";
import { defineTool } from "./define-tool.js";

const FREE_CATEGORIES = ["公园", "自然风光"];

function formatTicketPrice(price: number, category: string): string {
  if (price > 0) return `¥${price}（参考价，以景区为准）`;
  if (FREE_CATEGORIES.includes(category)) return "免费";
  return "价格待查";
}

export const searchAttractionsTool = defineTool({
  name: "search_attractions",
  costTier: "cheap",
  label: "景点搜索",
  description:
    "搜索指定城市的景点信息，从多个数据源（Google Places + UGC点评）融合，返回景点名称、地址、经纬度、描述、门票价格、真实评价和避坑指南",
  parameters: Type.Object({
    city: Type.String({ description: "城市名称" }),
    preferences: Type.Optional(
      Type.Array(Type.String(), {
        description: "兴趣偏好标签，如 '历史文化', '美食', '自然风光'",
      }),
    ),
    keywords: Type.Optional(Type.String({ description: "额外搜索关键词" })),
  }),
  execute: async (params) => {
    const { city, preferences, keywords } = params as {
      city: string;
      preferences?: string[];
      keywords?: string;
    };
    return searchAttractionsMultiSource({ city, preferences, keywords });
  },
  format: (result, params) => {
    const { city } = params as { city: string };
    const cacheTag = result.fromCache ? " 📦(缓存)" : "";
    const summary = result.attractions
      .map((a, i) => {
        const reviews = a.ugcReviews
          .map(
            (r) => `     💬 [${r.source}] ${r.summary} (${r.rating ?? "-"}/5)\n     💡 ${r.tips}`,
          )
          .join("\n");

        return [
          `${i + 1}. **${a.nameZh}** (${a.nameEn})`,
          `   📍 ${a.address} | 🎫 ${formatTicketPrice(a.ticketPrice, a.category)} | ⏱ ${a.visitDuration}分钟`,
          a.reservationRequired ? `   ⚠️ 需预约: ${a.reservationTips}` : "",
          `   ${a.description}`,
          reviews ? `   \n${reviews}` : "",
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n");

    return `## ${city}景点搜索结果${cacheTag}\n\n数据源: ${result.sources.join(", ")}\n\n${summary}`;
  },
  errorHint: (params) => {
    const { city } = params as { city: string };
    return `建议推荐${city}的经典景点`;
  },
});
