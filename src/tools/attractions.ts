/**
 * 景点搜索 Agent Tool — 多数据源融合版
 */

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { searchAttractionsMultiSource } from "../services/multi-source-service.js";

export const searchAttractionsTool: AgentTool & { costTier: "cheap" } = {
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
  execute: async (_toolCallId, params) => {
    const { city, preferences, keywords } = params as {
      city: string;
      preferences?: string[];
      keywords?: string;
    };

    try {
      const { attractions, sources, fromCache } = await searchAttractionsMultiSource({
        city,
        preferences,
        keywords,
      });

      const cacheTag = fromCache ? " 📦(缓存)" : "";
      const summary = attractions
        .map((a, i) => {
          const reviews = a.ugcReviews
            .map(
              (r) => `     💬 [${r.source}] ${r.summary} (${r.rating ?? "-"}/5)\n     💡 ${r.tips}`,
            )
            .join("\n");

          return [
            `${i + 1}. **${a.nameZh}** (${a.nameEn})`,
            `   📍 ${a.address} | 🎫 ¥${a.ticketPrice} | ⏱ ${a.visitDuration}分钟`,
            a.reservationRequired ? `   ⚠️ 需预约: ${a.reservationTips}` : "",
            `   ${a.description}`,
            reviews ? `   \n${reviews}` : "",
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `## ${city}景点搜索结果${cacheTag}\n\n数据源: ${sources.join(" + ")} | 共 ${attractions.length} 个景点\n\n${summary}`,
          },
        ],
        details: { city, attractions, sources, fromCache },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text" as const,
            text: `景点搜索遇到问题（${city}）：${msg}。建议根据常识推荐${city}的热门景点。`,
          },
        ],
        details: { city, error: msg },
      };
    }
  },
};
