/**
 * 伴游问答 Agent Tool — 基于行程数据回答用户追问
 *
 * 行程生成后，用户可随时针对行程细节追问。
 * 此工具查询行程中的具体数据（门票、时间、天气、预算等）并返回结构化回答。
 */

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { queryTripData } from "../services/companion-service.js";

export const companionQATool: AgentTool = {
  name: "query_trip_data",
  label: "伴游问答",
  description:
    "查询已生成的行程数据来回答用户的追问。支持：门票价格、游览时间、预约信息、是否适合带孩子/老人、酒店价格/评分、预算明细、天气、交通方式等。当用户针对已生成的行程提问时使用此工具。",
  parameters: Type.Object({
    question: Type.String({ description: "用户的问题" }),
    tripPlan: Type.Object({
      city: Type.String(),
      cities: Type.Array(Type.String()),
      startDate: Type.String(),
      endDate: Type.String(),
      days: Type.Array(
        Type.Object({
          date: Type.String(),
          dayIndex: Type.Number(),
          city: Type.String(),
          isTransferDay: Type.Optional(Type.Boolean()),
          transferInfo: Type.Optional(Type.String()),
          transportation: Type.String(),
          accommodation: Type.String(),
          attractions: Type.Array(
            Type.Object({
              name: Type.String(),
              nameZh: Type.String(),
              nameEn: Type.String(),
              address: Type.String(),
              visitDuration: Type.Number(),
              description: Type.String(),
              category: Type.String(),
              ticketPrice: Type.Number(),
              reservationRequired: Type.Boolean(),
              reservationTips: Type.Optional(Type.String()),
              bookingUrl: Type.Optional(Type.String()),
            }),
          ),
          hotel: Type.Optional(
            Type.Object({
              name: Type.String(),
              priceRange: Type.String(),
              rating: Type.Number(),
              estimatedCost: Type.Number(),
            }),
          ),
          meals: Type.Array(
            Type.Object({
              type: Type.String(),
              name: Type.String(),
              estimatedCost: Type.Number(),
            }),
          ),
        }),
      ),
      weatherInfo: Type.Array(
        Type.Object({
          date: Type.String(),
          city: Type.String(),
          dayWeather: Type.String(),
          nightWeather: Type.String(),
          dayTemp: Type.Number(),
          nightTemp: Type.Number(),
          windDirection: Type.String(),
          windPower: Type.String(),
        }),
      ),
      budget: Type.Optional(
        Type.Object({
          totalAttractions: Type.Number(),
          totalHotels: Type.Number(),
          totalMeals: Type.Number(),
          totalTransportation: Type.Number(),
          totalInterCityTransport: Type.Number(),
          total: Type.Number(),
        }),
      ),
    }),
  }),
  execute: async (_toolCallId, params) => {
    const { question, tripPlan } = params as Parameters<typeof queryTripData>[0];

    const result = queryTripData({ question, tripPlan });

    const header = result.found
      ? `## 💬 行程问答\n\n**Q**: ${question}\n\n**A**:\n${result.answer}`
      : `## 💬 行程问答\n\n**Q**: ${question}\n\n${result.answer}`;

    return {
      content: [{ type: "text" as const, text: header }],
      details: result,
    };
  },
};
