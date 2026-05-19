import { Type } from "@earendil-works/pi-ai";

// ─── 酒店搜索工具 ──────────────────────────────────────
export const searchHotelsTool = {
  name: "search_hotels",
  label: "酒店搜索",
  description: "搜索城市酒店",
  parameters: Type.Object({
    city: Type.String(),
    budget: Type.Optional(Type.String()),
  }),
  execute: async (_id, params) => {
    const { city } = params;
    return {
      content: [{ type: "text", text: `## ${city}酒店推荐\n\n1. **经济型** ¥200-400/晚\n2. **舒适型** ¥400-800/晚\n3. **高端型** ¥800+/晚` }],
      details: { city },
    };
  },
};