import { Type } from "@earendil-works/pi-ai";
import { validateAndWarn } from "./validate-trip.js";
import { getCurrentTripPlan } from "../trip/trip-state.js";
import { currentLang } from "../infra/context.js";
import { I18N } from "../i18n.js";
import { safeMarkdown } from "../infra/content-safety.js";

// ─── 伴游问答工具 ──────────────────────────────────
export const companionQATool = {
  name: "query_trip_data",
  label: "伴游问答",
  description: "查询已生成的行程数据来回答用户追问。支持：门票价格、游览时间、预约信息、是否适合带孩子/老人、酒店价格/评分、预算明细、天气、交通方式等。",
  parameters: Type.Object({
    question: Type.String({ description: "用户的问题" }),
    tripPlan: Type.Optional(Type.Object({
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
          visitDuration: Type.Union([Type.Null(), Type.Number()]),
          description: Type.String(),
          category: Type.String(),
          ticketPrice: Type.Union([Type.Null(), Type.Number()]),
          reservationRequired: Type.Boolean(),
        })),
        hotel: Type.Optional(Type.Object({
          name: Type.String(),
          priceRange: Type.String(),
          rating: Type.Number(),
          estimatedCost: Type.Union([Type.Null(), Type.Number()]),
        })),
      })),
      weatherInfo: Type.Array(Type.Object({
        date: Type.String(),
        city: Type.String(),
        dayWeather: Type.String(),
        dayTemp: Type.Union([Type.Null(), Type.Number()]),
        nightTemp: Type.Union([Type.Null(), Type.Number()]),
      })),
      budget: Type.Optional(Type.Object({
        totalAttractions: Type.Union([Type.Null(), Type.Number()]),
        totalHotels: Type.Union([Type.Null(), Type.Number()]),
        totalMeals: Type.Union([Type.Null(), Type.Number()]),
        totalTransportation: Type.Union([Type.Null(), Type.Number()]),
        totalInterCityTransport: Type.Union([Type.Null(), Type.Number()]),
        total: Type.Union([Type.Null(), Type.Number()]),
      })),
    })),
  }),
  execute: async (_id, params) => {
    const { question } = params;
    const tripPlan = getCurrentTripPlan() || params.tripPlan;
    const dict = I18N[currentLang] || I18N.zh;
    if (!tripPlan) {
      return { content: [{ type: "text", text: dict.companionNoTrip }], details: { question, matched: 0 } };
    }
    // Querying is read-only: model-supplied arguments cannot replace the current itinerary.
    validateAndWarn(tripPlan);
    const price = value => typeof value === "number" && Number.isFinite(value) && value >= 0
      ? `¥${value}` : dict.tripPriceUnknown;
    const lines = [`**Q**: ${question}`, ""];
    const allAttractions = tripPlan.days?.flatMap(d => d.attractions || []) || [];
    const matched = allAttractions.filter(a =>
      [a.nameZh, a.nameEn, a.name].some(name => typeof name === "string" && name.length > 0 && question.includes(name))
    );
    if (matched.length > 0) {
      for (const a of matched) {
        lines.push(`**${a.nameZh}** (${a.nameEn})`);
        const duration = typeof a.visitDuration === "number" && Number.isFinite(a.visitDuration) && a.visitDuration >= 0
          ? `${a.visitDuration}${dict.tripDurationMinutes}` : dict.tripPriceUnknown;
        lines.push(`📍 ${a.address || ""} | 🎫 ${price(a.ticketPrice)} | ⏱ ${duration}`);
        if (a.reservationRequired) lines.push(`⚠️ 需预约`);
        lines.push(`${a.description}`);
      }
    } else if (question.includes("预算") || question.includes("费用")) {
      const b = tripPlan.budget;
      if (b) {
        lines.push(`💰 总预算: ${price(b.total)}`);
        lines.push(`🎫 门票 ${price(b.totalAttractions)} | 🏨 住宿 ${price(b.totalHotels)} | 🍜 餐饮 ${price(b.totalMeals)}`);
      }
    } else if (question.includes("天气") || question.includes("温度")) {
      for (const w of tripPlan.weatherInfo || []) {
        lines.push(`${w.date}: ${w.dayWeather} ${w.dayTemp}°C`);
      }
    } else {
      lines.push("请更具体地描述你想了解的行程细节，例如：故宫门票多少钱？");
    }
    return {
      content: [{ type: "text", text: safeMarkdown(lines.join("\n")) }],
      details: { question, matched: matched.length },
    };
  },
};