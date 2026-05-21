import { Type } from "@earendil-works/pi-ai";
import { validateAndWarn, validateToMarkdown, validateTripPlanSchema } from "./validate-trip.js";

// ─── 补给详情丰富工具 ──────────────────────────────────
export const enrichSupplyDetailsTool = {
  name: "enrich_supply_details",
  label: "补给详情",
  description: "为已生成的行程丰富景点内部补给点详情：验证每个途经点附近的餐厅/商店/休息区的精确坐标、人均消费、营业时间。在粗略行程生成后调用。",
  parameters: Type.Object({
    tripPlan: Type.Object({
      city: Type.String(),
      days: Type.Array(Type.Object({
        date: Type.String(),
        city: Type.String(),
        attractions: Type.Array(Type.Object({
          name: Type.String(),
          nameZh: Type.String(),
          location: Type.Object({ latitude: Type.Number(), longitude: Type.Number() }),
          routes: Type.Optional(Type.Array(Type.Object({
            id: Type.String(),
            name: Type.String(),
            waypoints: Type.Array(Type.Object({
              name: Type.String(),
              location: Type.Object({ latitude: Type.Number(), longitude: Type.Number() }),
              supplyPoints: Type.Optional(Type.Array(Type.Object({
                name: Type.String(),
                type: Type.String(),
                description: Type.String(),
                estimatedCost: Type.Number(),
                isRecommended: Type.Boolean(),
              }))),
            })),
          }))),
        })),
      })),
    }),
  }),
  execute: async (_id, params) => {
    const { tripPlan } = params;
    // 校验 tripPlan 坐标完整性
    const validation = validateAndWarn(tripPlan);
    // 同步行程数据到地图（解耦对 generate_action_links 的单点依赖）
    if (tripPlan && tripPlan.days) {
      const schemaResult = validateTripPlanSchema(tripPlan);
      if (!schemaResult.valid) {
        console.warn('[TripPlan] 结构校验失败:', schemaResult.errors);
      }
      window._lastTripPlan = tripPlan;
      document.getElementById("btn-map")?.classList.remove("disabled-ghost");
      if (window.currentPage === "page-map" && typeof window._initPageMap === "function") {
        window._initPageMap();
      }
    }
    const lines = ["## 🍴 补给详情", ""];
    let totalSupplyPoints = 0;
    let exactCount = 0;

    for (const day of tripPlan.days) {
      for (const attr of day.attractions) {
        if (!attr.routes?.some(r => r.waypoints.some(wp => wp.supplyPoints?.length))) continue;
        lines.push(`### ${attr.nameZh || attr.name}`);
        for (const route of attr.routes) {
          if (!route.waypoints.some(wp => wp.supplyPoints?.length)) continue;
          lines.push(`**${route.name}**`);
          for (const wp of route.waypoints) {
            if (!wp.supplyPoints?.length) continue;
            totalSupplyPoints += wp.supplyPoints.length;
            const exactSp = wp.supplyPoints.filter(sp => sp.locationAccuracy === "exact");
            exactCount += exactSp.length;
            const summary = wp.supplyPoints.map(sp =>
              `${sp.name}(¥${sp.estimatedCost}${sp.locationAccuracy === "exact" ? "✓" : "?"})`
            ).join(", ");
            lines.push(`- ${wp.name}: ${summary}`);
          }
        }
        lines.push("");
      }
    }

    lines.push(`---`);
    lines.push(`共 **${totalSupplyPoints}** 个补给点，其中 **${exactCount}** 个已验证精确坐标。`);
    lines.push(`> 💡 提示：精确坐标和实时价格需要配置高德/Google API Key 后自动获取。`);
    if (validation.hasIssues) {
      lines.push('');
      lines.push(`> ⚠️ ${validation.summary}`);
    }

    return {
      content: [{ type: "text", text: lines.join("\n") }],
      details: { tripPlan, totalSupplyPoints, exactCount },
    };
  },
};