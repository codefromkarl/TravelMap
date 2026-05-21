import { Type } from "@earendil-works/pi-ai";
import { validateAndWarn, validateTripPlanSchema } from "./validate-trip.js";

// ─── 伴游问答工具 ──────────────────────────────────
export const companionQATool = {
  name: "query_trip_data",
  label: "伴游问答",
  description: "查询已生成的行程数据来回答用户追问。支持：门票价格、游览时间、预约信息、是否适合带孩子/老人、酒店价格/评分、预算明细、天气、交通方式等。",
  parameters: Type.Object({
    question: Type.String({ description: "用户的问题" }),
    tripPlan: Type.Object({
      city: Type.String(),
      cities: Type.Array(Type.String()),
      startDate: Type.String(),
      endDate: Type.String(),
      days: Type.Array(Type.Object({
        date: Type.String(),
        dayIndex: Type.Number(),
        city: Type.String(),
        transportation: Type.String(),
        attractions: Type.Array(Type.Object({
          name: Type.String(),
          nameZh: Type.String(),
          nameEn: Type.String(),
          address: Type.String(),
          visitDuration: Type.Number(),
          description: Type.String(),
          category: Type.String(),
          ticketPrice: Type.Number(),
          reservationRequired: Type.Boolean(),
        })),
        hotel: Type.Optional(Type.Object({
          name: Type.String(),
          priceRange: Type.String(),
          rating: Type.Number(),
          estimatedCost: Type.Number(),
        })),
      })),
      weatherInfo: Type.Array(Type.Object({
        date: Type.String(),
        city: Type.String(),
        dayWeather: Type.String(),
        dayTemp: Type.Number(),
        nightTemp: Type.Number(),
      })),
      budget: Type.Optional(Type.Object({
        totalAttractions: Type.Number(),
        totalHotels: Type.Number(),
        totalMeals: Type.Number(),
        totalTransportation: Type.Number(),
        totalInterCityTransport: Type.Number(),
        total: Type.Number(),
      })),
    }),
  }),
  execute: async (_id, params) => {
    const { question, tripPlan } = params;
    // 校验 tripPlan 坐标完整性
    validateAndWarn(tripPlan);
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
    const lines = [`**Q**: ${question}`, ""];
    const allAttractions = tripPlan.days?.flatMap(d => d.attractions || []) || [];
    const matched = allAttractions.filter(a =>
      question.includes(a.nameZh) || question.includes(a.nameEn) || question.includes(a.name)
    );
    if (matched.length > 0) {
      for (const a of matched) {
        lines.push(`**${a.nameZh}** (${a.nameEn})`);
        lines.push(`📍 ${a.address} | 🎫 ¥${a.ticketPrice} | ⏱ ${a.visitDuration}分钟`);
        if (a.reservationRequired) lines.push(`⚠️ 需预约`);
        lines.push(`${a.description}`);
      }
    } else if (question.includes("预算") || question.includes("费用")) {
      const b = tripPlan.budget;
      if (b) {
        lines.push(`💰 总预算: ¥${b.total}`);
        lines.push(`🎫 门票 ¥${b.totalAttractions} | 🏨 住宿 ¥${b.totalHotels} | 🍜 餐饮 ¥${b.totalMeals}`);
      }
    } else if (question.includes("天气") || question.includes("温度")) {
      for (const w of tripPlan.weatherInfo || []) {
        lines.push(`${w.date}: ${w.dayWeather} ${w.dayTemp}°C`);
      }
    } else {
      lines.push("请更具体地描述你想了解的行程细节，例如：故宫门票多少钱？");
    }
    return {
      content: [{ type: "text", text: lines.join("\n") }],
      details: { question, matched: matched.length },
    };
  },
};