/**
 * Agent Tool: enrich_supply_details — 丰富行程补给点详情
 *
 * 使用时机：粗略行程已生成后，用户要求查看补给详情、或 Agent 判断需要补充。
 * 功能：验证景点内部路线补给点的坐标、价格、营业时间。
 *
 * 与 calculate_budget 的区别：
 *   - calculate_budget 计算日级别的餐饮总费用
 *   - enrich_supply_details 精确到景点内部的每个补给点（星巴克/便利店/休息亭）
 */

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { enrichTripPlanSuppliesWithStats } from "../services/supply-enrich-service.js";
import type { TripPlan } from "../types/trip.js";

export const enrichSupplyDetailsTool: AgentTool = {
  name: "enrich_supply_details",
  label: "补给详情",
  description:
    "为已生成的行程丰富景点内部补给点详情：验证每个途经点附近的餐厅/商店/休息区的精确坐标、人均消费、营业时间。" +
    "在粗略行程生成后调用，作为细节增强步骤。",
  parameters: Type.Object({
    tripPlan: Type.Object({
      city: Type.String(),
      days: Type.Array(
        Type.Object({
          date: Type.String(),
          city: Type.String(),
          attractions: Type.Array(
            Type.Object({
              name: Type.String(),
              nameZh: Type.String(),
              location: Type.Object({
                latitude: Type.Number(),
                longitude: Type.Number(),
              }),
              routes: Type.Optional(
                Type.Array(
                  Type.Object({
                    id: Type.String(),
                    name: Type.String(),
                    waypoints: Type.Array(
                      Type.Object({
                        name: Type.String(),
                        location: Type.Object({
                          latitude: Type.Number(),
                          longitude: Type.Number(),
                        }),
                        supplyPoints: Type.Optional(
                          Type.Array(
                            Type.Object({
                              name: Type.String(),
                              type: Type.String(),
                              description: Type.String(),
                              estimatedCost: Type.Number(),
                              isRecommended: Type.Boolean(),
                            }),
                          ),
                        ),
                      }),
                    ),
                  }),
                ),
              ),
            }),
          ),
        }),
      ),
    }),
  }),
  execute: async (_toolCallId, params) => {
    const { tripPlan } = params as { tripPlan: TripPlan };

    try {
      const { tripPlan: enriched, stats } = await enrichTripPlanSuppliesWithStats(tripPlan, {
        skipValidated: true,
      });

      const lines = ["## 🍴 补给详情丰富完成", ""];
      lines.push(
        `已处理 **${stats.attractionsProcessed}** 个景点 · **${stats.routesProcessed}** 条路线`,
      );
      lines.push(
        `验证补给点: **${stats.supplyPointsValidated}** 个 · 跳过已验证: **${stats.supplyPointsSkipped}** 个`,
      );
      lines.push("");

      // 汇总每个景点的补给变化
      for (const day of enriched.days) {
        for (const attr of day.attractions) {
          if (!attr.routes?.some((r) => r.waypoints.some((wp) => wp.supplyPoints?.length))) {
            continue;
          }

          lines.push(`### ${attr.nameZh}`);
          for (const route of attr.routes) {
            if (!route.waypoints.some((wp) => wp.supplyPoints?.length)) continue;

            lines.push(`**${route.name}**`);
            for (const wp of route.waypoints) {
              if (!wp.supplyPoints?.length) continue;
              const exactSp = wp.supplyPoints.filter((sp) => sp.locationAccuracy === "exact");
              if (exactSp.length > 0) {
                lines.push(
                  `- ${wp.name}: ${exactSp.map((sp) => `${sp.name}(¥${sp.estimatedCost}${sp.priceConfidence === "api" ? "实时" : ""})`).join(", ")}`,
                );
              }
            }
          }
          lines.push("");
        }
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { tripPlan: enriched, stats },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `补给详情丰富失败: ${msg}` }],
        details: { error: msg },
      };
    }
  },
};
