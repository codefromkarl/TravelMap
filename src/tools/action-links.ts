/**
 * 行动链接生成 Agent Tool — 为行程嵌入景点预约、酒店比价、机票比价链接
 *
 * 优先使用 trvl CLI 获取实时价格，fallback 到 URL 模板。
 */

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { enrichTripWithLiveLinks } from "../services/action-link-service.js";
import type { TripPlan } from "../types/trip.js";

export const generateActionLinksTool: AgentTool = {
  name: "generate_action_links",
  label: "行动链接",
  description:
    "为旅行计划生成实用行动链接：需预约景点的官方预约链接、酒店比价（实时价格/Booking/飞猪/去哪儿）、城际交通机票火车票搜索链接。传入完整行程数据即可。",
  parameters: Type.Object({
    tripPlan: Type.Object({
      city: Type.String({ description: "主城市名" }),
      cities: Type.Array(Type.String(), { description: "所有城市列表" }),
      startDate: Type.String({ description: "开始日期" }),
      endDate: Type.String({ description: "结束日期" }),
      days: Type.Array(
        Type.Object({
          date: Type.String(),
          dayIndex: Type.Number(),
          city: Type.String(),
          isTransferDay: Type.Optional(Type.Boolean()),
          attractions: Type.Array(
            Type.Object({
              name: Type.String(),
              nameZh: Type.String(),
              reservationRequired: Type.Optional(Type.Boolean()),
              reservationTips: Type.Optional(Type.String()),
            }),
          ),
          hotel: Type.Optional(
            Type.Object({
              name: Type.String(),
            }),
          ),
        }),
      ),
    }),
  }),
  execute: async (_toolCallId, params) => {
    const { tripPlan } = params as { tripPlan: TripPlan };

    const enriched = await enrichTripWithLiveLinks(tripPlan);

    // 统计链接数
    let linkCount = 0;
    const reservationList: string[] = [];
    const hotelLinks: string[] = [];
    const flightLinks: string[] = [];

    for (const day of enriched.days) {
      for (const attr of day.attractions) {
        if (attr.bookingUrl) {
          if (attr.reservationRequired) {
            const tl = (attr as any).reservationTimeline;
            let entry = `- **${attr.nameZh}** → [预约链接](${attr.bookingUrl})`;
            if (tl) {
              const urgencyEmoji =
                { expired: "🔴", urgent: "🟡", normal: "🟢" }[tl.urgency as string] ?? "";
              entry += `\n  ${urgencyEmoji} 游玩日 ${day.date} · 需提前${tl.advanceDays}天`;
              entry += tl.releaseTime ? ` · 每日${tl.releaseTime}放票` : "";
              if (tl.altChannels?.length) {
                entry += `\n  📎 备选: ${tl.altChannels.map((c: any) => `[${c.platform}](${c.url})`).join(" | ")}`;
              }
            }
            reservationList.push(entry);
          }
          linkCount++;
        }
      }

      if (day.hotel?.comparisonLinks) {
        hotelLinks.push(`- **${day.hotel.name}**:`);
        for (const link of day.hotel.comparisonLinks) {
          const priceTag = link.price ? ` ¥${link.price}` : "";
          const sourceTag = link.source === "trvl" ? " 📡实时" : "";
          hotelLinks.push(
            `  - [${link.platform}](${link.url}) — ${link.label}${priceTag}${sourceTag}`,
          );
          linkCount++;
        }
      }
    }

    if (enriched.flightLinks) {
      flightLinks.push("**城际交通搜索**:");
      for (const link of enriched.flightLinks) {
        const priceTag = link.price ? ` ¥${link.price}` : "";
        const sourceTag = link.source === "trvl" ? " 📡实时" : "";
        flightLinks.push(
          `- [${link.platform}](${link.url}) — ${link.label}${priceTag}${sourceTag}`,
        );
        linkCount++;
      }
    }

    const lines = ["## 🔗 行动链接", "", `为你的行程生成了 **${linkCount}** 个实用链接`, ""];

    if (reservationList.length > 0) {
      lines.push("### 📍 景点预约", "", ...reservationList, "");
    }

    if (hotelLinks.length > 0) {
      lines.push("### 🏨 酒店比价", "", ...hotelLinks, "");
    }

    if (flightLinks.length > 0) {
      lines.push("### 🚄 城际交通", "", ...flightLinks, "");
    }

    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
      details: { enrichedTrip: enriched, linkCount },
    };
  },
};
