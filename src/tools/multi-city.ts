/**
 * 多城市行程编排 Agent Tool
 */

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { planMultiCityRoute } from "../services/multi-city-service.js";

export const planMultiCityTool: AgentTool = {
  name: "plan_multi_city",
  label: "多城市规划",
  description:
    "为多城市旅行生成行程框架：自动插入城际移动日、计算交通方式和费用。输入城市和停留天数即可。",
  parameters: Type.Object({
    cities: Type.Array(
      Type.Object({
        city: Type.String({ description: "城市名" }),
        days: Type.Number({ description: "停留天数" }),
      }),
      { description: "城市停留配置，按游览顺序排列" },
    ),
    startDate: Type.String({ description: "出发日期，格式 YYYY-MM-DD" }),
  }),
  execute: async (_toolCallId, params) => {
    const { cities, startDate } = params as {
      cities: Array<{ city: string; days: number }>;
      startDate: string;
    };

    if (cities.length === 0) {
      return {
        content: [{ type: "text" as const, text: "请至少指定一个城市。" }],
        details: {},
      };
    }

    const plan = planMultiCityRoute(cities, startDate);

    const lines = [`## 🗺️ 多城市行程框架`, ""];

    // 城市概览
    lines.push(`**路线**: ${cities.map((c) => `${c.city}(${c.days}天)`).join(" → ")}`);
    lines.push(`**总天数**: ${plan.totalDays}天（含 ${plan.transfers.length} 个城际移动日）`);
    lines.push(`**城际交通费用**: ¥${plan.totalTransportCost}`);
    lines.push("");

    // 每日概览
    lines.push("### 📅 每日概览");
    for (const day of plan.dayOutline) {
      if (day.isTransferDay) {
        lines.push(`- Day ${day.dayIndex + 1} (${day.date}) 🚄 **城际移动** ${day.transferInfo}`);
      } else {
        lines.push(`- Day ${day.dayIndex + 1} (${day.date}) 📍 ${day.city}`);
      }
    }

    // 交通详情
    if (plan.transfers.length > 0) {
      lines.push("", "### 🚄 城际交通");
      for (const t of plan.transfers) {
        lines.push(
          `- **${t.from} → ${t.to}**: ${t.transport.mode} ~${t.transport.hours}h ¥${t.transport.cost}`,
        );
      }
    }

    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
      details: plan,
    };
  },
};
