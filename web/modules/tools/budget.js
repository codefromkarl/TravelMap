import { Type } from "@earendil-works/pi-ai";

// ─── 预算计算工具 ──────────────────────────────────────
export const calculateBudgetTool = {
  name: "calculate_budget",
  label: "预算计算",
  description: "自动计算旅行预算明细",
  parameters: Type.Object({
    totalAttractions: Type.Number({ description: "门票总费用" }),
    totalHotels: Type.Number({ description: "住宿总费用" }),
    totalMeals: Type.Number({ description: "餐饮总费用" }),
    totalTransportation: Type.Number({ description: "交通总费用" }),
    budgetLimit: Type.Optional(Type.Number({ description: "预算上限" })),
  }),
  execute: async (_id, params) => {
    const { totalAttractions, totalHotels, totalMeals, totalTransportation, budgetLimit } = params;
    const total = totalAttractions + totalHotels + totalMeals + totalTransportation;
    const lines = [
      "## 💰 预算明细",
      `🎫 门票: ¥${totalAttractions}`,
      `🏨 住宿: ¥${totalHotels}`,
      `🍜 餐饮: ¥${totalMeals}`,
      `🚌 交通: ¥${totalTransportation}`,
      `**总计: ¥${total}**`,
    ];
    if (budgetLimit) {
      lines.push(total > budgetLimit
        ? `\n⚠️ 超出预算上限 ¥${budgetLimit}，超出 ¥${total - budgetLimit}`
        : `\n✅ 在预算 ¥${budgetLimit} 以内，剩余 ¥${budgetLimit - total}`);
    }
    return { content: [{ type: "text", text: lines.join("\n") }], details: { total, budgetLimit } };
  },
};