/**
 * 酒店搜索 Agent Tool — Phase 1 占位
 */

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

export const searchHotelsTool: AgentTool & { costTier: "cheap" } = {
  costTier: "cheap",
  name: "search_hotels",
  label: "酒店搜索",
  description: "搜索指定城市的酒店，根据预算和位置筛选",
  parameters: Type.Object({
    city: Type.String({ description: "城市名称" }),
    budget: Type.Optional(Type.String({ description: "预算范围，如 '300-500'" })),
    style: Type.Optional(Type.String({ description: "住宿风格，如 '经济型', '精品民宿'" })),
  }),
  execute: async (_toolCallId, params) => {
    const { city } = params as { city: string };
    // TODO: Phase 2 接入酒店 API
    return {
      content: [
        {
          type: "text" as const,
          text: `酒店搜索功能将在后续版本实现。城市: ${city}。建议推荐${city}的热门住宿区域。`,
        },
      ],
      details: { city },
    };
  },
};
