/**
 * 预算计算 Agent Tool
 */

import { Type } from "@earendil-works/pi-ai";
import { calculateBudget, checkBudgetOverrun } from "../services/budget-service.js";
import type { DayPlan } from "../types/trip.js";
import { defineTool } from "./define-tool.js";

/** 预算 schema — 从结构化行程数据中提取 */
const AttractionSchema = Type.Object({
  name: Type.String(),
  ticketPrice: Type.Number(),
});

const MealSchema = Type.Object({
  type: Type.String(),
  name: Type.String(),
  estimatedCost: Type.Number(),
});

const HotelSchema = Type.Object({
  name: Type.String(),
  estimatedCost: Type.Number(),
});

const DayPlanSchema = Type.Object({
  date: Type.String(),
  dayIndex: Type.Number(),
  city: Type.String(),
  attractions: Type.Array(AttractionSchema),
  meals: Type.Array(MealSchema),
  hotel: Type.Optional(HotelSchema),
});

export const calculateBudgetTool = defineTool({
  name: "calculate_budget",
  label: "预算计算",
  description:
    "根据行程数据自动计算预算明细（门票、住宿、餐饮、交通）。传入每日行程数据即可自动汇总。可设置预算上限检查是否超支。",
  parameters: Type.Object({
    days: Type.Array(DayPlanSchema, { description: "每日行程数据（含景点、餐饮、住宿费用）" }),
    budgetLimit: Type.Optional(
      Type.Number({ description: "预算上限（元），设置后会检查是否超支并给出建议" }),
    ),
    interCityTransportCost: Type.Optional(
      Type.Number({ description: "城际交通总费用", default: 0 }),
    ),
    dailyTransportBudget: Type.Optional(
      Type.Number({ description: "每日市内交通预算（元）", default: 50 }),
    ),
  }),
  execute: async (params) => {
    const {
      days,
      interCityTransportCost = 0,
      dailyTransportBudget = 50,
    } = params as {
      days: DayPlan[];
      interCityTransportCost?: number;
      dailyTransportBudget?: number;
    };
    return calculateBudget({ days, interCityTransportCost, dailyTransportBudget });
  },
  format: (budget, params) => {
    const { budgetLimit } = params as { budgetLimit?: number };

    const lines = [
      "## 💰 预算明细",
      "",
      `| 项目 | 金额 |`,
      `|------|------|`,
      `| 🎫 门票 | ¥${budget.totalAttractions} |`,
      `| 🏨 住宿 | ¥${budget.totalHotels} |`,
      `| 🍜 餐饮 | ¥${budget.totalMeals} |`,
      `| 🚌 市内交通 | ¥${budget.totalTransportation} |`,
      `| 🚄 城际交通 | ¥${budget.totalInterCityTransport} |`,
      `| **总计** | **¥${budget.total}** |`,
    ];

    if (budgetLimit != null && budgetLimit > 0) {
      const { overBudget, suggestions } = checkBudgetOverrun(budget, budgetLimit);
      if (overBudget) {
        lines.push("", `⚠️ **超出预算上限 ¥${budgetLimit}**`, "");
        for (const s of suggestions) {
          lines.push(`- ${s}`);
        }
      } else {
        lines.push("", `✅ 在预算上限 ¥${budgetLimit} 以内，剩余 ¥${budgetLimit - budget.total}`);
      }
    }

    return lines.join("\n");
  },
  details: (budget, params) => ({
    budget,
    budgetLimit: (params as { budgetLimit?: number }).budgetLimit,
  }),
});
