/**
 * 语音播报 Agent Tool — 生成行程语音播报文本
 *
 * 将行程数据转换为自然语言摘要，供前端 TTS（Web Speech API）朗读。
 * 不调用外部 API，纯文本生成。
 */

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

// ─── 播报文本生成 ─────────────────────────────────────────

interface TripDayForTTS {
  date: string;
  city: string;
  isTransferDay?: boolean;
  attractions: Array<{
    nameZh: string;
    visitDuration: number;
    description: string;
  }>;
  meals?: Array<{
    type: string;
    name: string;
  }>;
  transportation: string;
}

interface TripPlanForTTS {
  city: string;
  cities: string[];
  startDate: string;
  endDate: string;
  days: TripDayForTTS[];
  totalDays: number;
}

/** 从行程数据生成语音播报文本 */
export function generateSpeechText(tripPlan: TripPlanForTTS): string {
  const parts: string[] = [];

  // 开场白
  const cityNames = tripPlan.cities.length > 1 ? tripPlan.cities.join("、") : tripPlan.city;
  parts.push(`为您播报${cityNames}${tripPlan.totalDays}天行程概览。`);

  // 每日行程
  for (const day of tripPlan.days) {
    const dayIndex = day.date ? ` ${day.date}` : "";
    const cityLabel = tripPlan.cities.length > 1 ? `，${day.city}` : "";

    if (day.isTransferDay) {
      parts.push(`第${dayIndex}天${cityLabel}是交通转移日。`);
      continue;
    }

    const attrCount = day.attractions.length;
    if (attrCount === 0) {
      parts.push(`第${dayIndex}天${cityLabel}行程自由安排。`);
      continue;
    }

    const attrNames = day.attractions.map((a) => a.nameZh).join("、");
    parts.push(`第${dayIndex}天${cityLabel}，计划游览${attrCount}个景点：${attrNames}。`);

    // 推荐餐厅
    if (day.meals && day.meals.length > 0) {
      const mealDesc = day.meals
        .map((m) => `${m.type === "lunch" ? "午餐" : "晚餐"}推荐${m.name}`)
        .join("，");
      parts.push(`${mealDesc}。`);
    }
  }

  // 结尾
  parts.push("祝您旅途愉快！");

  return parts.join("");
}

// ─── Tool 定义 ──────────────────────────────────────────

export const ttsTool: AgentTool & { costTier: "cheap" } = {
  costTier: "cheap",
  name: "generate_trip_speech",
  label: "语音播报",
  description:
    "将行程转换为语音播报文本。当用户请求语音播报、朗读行程、听行程摘要时使用。返回格式化的播报文本，前端会用 TTS 朗读。",
  parameters: Type.Object({
    tripPlan: Type.Object({
      city: Type.String({ description: "主城市" }),
      cities: Type.Array(Type.String(), { description: "所有城市列表" }),
      startDate: Type.String({ description: "开始日期" }),
      endDate: Type.String({ description: "结束日期" }),
      totalDays: Type.Number({ description: "总天数" }),
      days: Type.Array(
        Type.Object({
          date: Type.String(),
          city: Type.String(),
          isTransferDay: Type.Optional(Type.Boolean()),
          attractions: Type.Array(
            Type.Object({
              nameZh: Type.String({ description: "景点中文名" }),
              visitDuration: Type.Number({ description: "游览时长（分钟）" }),
              description: Type.String(),
            }),
          ),
          meals: Type.Optional(
            Type.Array(
              Type.Object({
                type: Type.String(),
                name: Type.String(),
              }),
            ),
          ),
          transportation: Type.String(),
        }),
      ),
    }),
  }),
  execute: async (_toolCallId, params) => {
    const { tripPlan } = params as { tripPlan: TripPlanForTTS };

    const speechText = generateSpeechText(tripPlan);

    return {
      content: [
        {
          type: "text" as const,
          text:
            `## 🔊 语音播报\n\n` +
            `播报文本已生成，请点击播放按钮收听行程摘要。\n\n` +
            `**播报内容**：\n${speechText}`,
        },
      ],
      details: {
        speechText,
        charCount: speechText.length,
        estimatedSeconds: Math.ceil(speechText.length / 5), // 中文约 5 字/秒
      },
    };
  },
};
