/**
 * 图片识别景点 Tool — 匹配用户上传照片与行程景点
 *
 * 工作流程：
 * 1. 用户在消息中上传图片（LLM 可直接看到）
 * 2. LLM 分析图片内容，识别可能的景点特征
 * 3. 调用此工具将 LLM 的分析结果与行程中的已知景点匹配
 *
 * 工具职责：匹配逻辑（不需要"看"图片）
 * LLM 职责：视觉分析（直接从用户消息中看到图片）
 */

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

// ─── 景点匹配逻辑 ──────────────────────────────────────

interface AttractionInfo {
  nameZh: string;
  nameEn?: string;
  city: string;
  description?: string;
  category?: string;
}

interface MatchResult {
  matched: boolean;
  attraction?: AttractionInfo;
  confidence: "high" | "medium" | "low";
  reason: string;
}

/**
 * 根据 LLM 描述匹配景点
 */
function matchAttraction(
  description: string,
  landmarks: string[],
  knownAttractions: AttractionInfo[],
): MatchResult {
  const descLower = description.toLowerCase();

  // 1. 精确名称匹配
  for (const attr of knownAttractions) {
    const names = [attr.nameZh, attr.nameEn].filter(
      (n): n is string => typeof n === "string" && n.length > 0,
    );
    for (const name of names) {
      if (descLower.includes(name.toLowerCase())) {
        return {
          matched: true,
          attraction: attr,
          confidence: "high",
          reason: `描述中直接提到了「${name}」`,
        };
      }
    }
  }

  // 2. 地标关键词匹配
  for (const attr of knownAttractions) {
    const attrWords = `${attr.nameZh} ${attr.nameEn || ""}`.toLowerCase().split(/\s+/);
    for (const landmark of landmarks) {
      const landmarkLower = landmark.toLowerCase();
      for (const word of attrWords) {
        if (word.length >= 2 && (landmarkLower.includes(word) || word.includes(landmarkLower))) {
          return {
            matched: true,
            attraction: attr,
            confidence: "medium",
            reason: `地标「${landmark}」与景点「${attr.nameZh}」相关`,
          };
        }
      }
    }
  }

  // 3. 描述语义匹配（简单关键词）
  const descKeywords = [
    "湖",
    "山",
    "寺",
    "庙",
    "塔",
    "桥",
    "园",
    "宫",
    "殿",
    "城",
    "门",
    "广场",
    "博物馆",
  ];
  for (const attr of knownAttractions) {
    const attrDesc = (attr.description || "").toLowerCase();
    for (const keyword of descKeywords) {
      if (descLower.includes(keyword) && attrDesc.includes(keyword)) {
        return {
          matched: true,
          attraction: attr,
          confidence: "low",
          reason: `描述和景点都包含「${keyword}」特征`,
        };
      }
    }
  }

  return {
    matched: false,
    confidence: "low",
    reason: "未在已知景点中找到匹配",
  };
}

// ─── Tool 定义 ──────────────────────────────────────────

export const recognizeImageTool: AgentTool & { costTier: "cheap" } = {
  costTier: "cheap",
  name: "recognize_image",
  label: "图片识别景点",
  description:
    "匹配用户上传的照片与行程中的已知景点。当用户上传图片并询问是哪个景点时使用。需要先由 LLM 分析图片内容（描述和地标），然后调用此工具进行匹配。",
  parameters: Type.Object({
    imageDescription: Type.String({
      description: "LLM 对图片的描述（包含建筑物、风景、文字等特征）",
    }),
    detectedLandmarks: Type.Optional(
      Type.Array(Type.String(), {
        description: "从图片中识别到的地标名称或特征词（如「雷峰塔」「西湖」「断桥」）",
      }),
    ),
    knownAttractions: Type.Array(
      Type.Object({
        nameZh: Type.String({ description: "景点中文名" }),
        nameEn: Type.Optional(Type.String({ description: "景点英文名" })),
        city: Type.String({ description: "所在城市" }),
        description: Type.Optional(Type.String({ description: "景点描述" })),
        category: Type.Optional(Type.String({ description: "景点类别" })),
      }),
      { description: "行程中的已知景点列表" },
    ),
  }),
  execute: async (_toolCallId, params) => {
    const { imageDescription, detectedLandmarks, knownAttractions } = params as {
      imageDescription: string;
      detectedLandmarks?: string[];
      knownAttractions: AttractionInfo[];
    };

    const result = matchAttraction(imageDescription, detectedLandmarks || [], knownAttractions);

    const confidenceEmoji = { high: "🟢", medium: "🟡", low: "🔴" };
    const confidenceLabel = { high: "高", medium: "中", low: "低" };

    let content: string;

    if (result.matched && result.attraction) {
      content =
        `## 📷 图片识别结果\n\n` +
        `${confidenceEmoji[result.confidence]} **置信度**: ${confidenceLabel[result.confidence]}\n` +
        `📍 **匹配景点**: ${result.attraction.nameZh}${result.attraction.nameEn ? ` (${result.attraction.nameEn})` : ""}\n` +
        `🏙️ **所在城市**: ${result.attraction.city}\n` +
        `💬 **匹配原因**: ${result.reason}\n\n` +
        (result.attraction.description
          ? `**景点简介**: ${result.attraction.description}\n\n`
          : "") +
        `建议向用户确认是否为此景点，并提供相关的游览建议。`;
    } else {
      content =
        `## 📷 图片识别结果\n\n` +
        `❌ **未匹配到已知景点**\n\n` +
        `**图片描述**: ${imageDescription}\n` +
        (detectedLandmarks?.length ? `**识别到的地标**: ${detectedLandmarks.join("、")}\n` : "") +
        `\n建议：\n` +
        `1. 请用户提供更多关于照片拍摄地点的信息\n` +
        `2. 如果是新景点，可以建议添加到行程中\n` +
        `3. 描述图片中的风景特征，帮助用户回忆`;
    }

    return {
      content: [{ type: "text" as const, text: content }],
      details: {
        result,
        imageDescription,
        detectedLandmarks,
        knownAttractionsCount: knownAttractions.length,
      },
    };
  },
};
