import { Type } from "@earendil-works/pi-ai";

// ─── 多城市规划工具 ──────────────────────────────────
export const planMultiCityTool = {
  name: "plan_multi_city",
  label: "多城市规划",
  description: "为多城市旅行生成行程框架：自动插入城际移动日、计算交通方式和费用。",
  parameters: Type.Object({
    cities: Type.Array(Type.Object({
      city: Type.String({ description: "城市名" }),
      days: Type.Number({ description: "停留天数" }),
    })),
    startDate: Type.String({ description: "出发日期" }),
  }),
  execute: async (_id, params) => {
    const { cities, startDate } = params;
    if (!cities || cities.length === 0) {
      return { content: [{ type: "text", text: "请至少指定一个城市。" }] };
    }
    const lines = ["## 🗺️ 多城市行程框架", ""]
    lines.push("**路线**: " + cities.map(c => `${c.city}(${c.days}天)`).join(" → "));
    const transfers = [];
    let transportCost = 0;
    for (let i = 0; i < cities.length - 1; i++) {
      transfers.push(`${cities[i].city} → ${cities[i+1].city}`);
      transportCost += 500;
    }
    const totalDays = cities.reduce((s, c) => s + c.days, 0) + transfers.length;
    lines.push(`**总天数**: ${totalDays}天（含 ${transfers.length} 个城际移动日）`);
    lines.push(`**城际交通费用**: ~¥${transportCost}`);
    if (transfers.length > 0) {
      lines.push("", "### 🚄 城际交通");
      for (const t of transfers) lines.push(`- ${t}`);
    }
    return { content: [{ type: "text", text: lines.join("\n") }], details: { cities, totalDays, transportCost } };
  },
};