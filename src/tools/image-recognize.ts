/**
 * 图片识别景点 Tool — 用户上传旅途照片，AI 识别景点
 *
 * 调用多模态 LLM（GPT-4o / Claude Vision / Gemini）识别图片中的景点，
 * 然后匹配行程中的已知景点信息。
 */

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

export const recognizeImageTool: AgentTool = {
  name: "recognize_image",
  label: "图片识别景点",
  description:
    "识别用户上传的旅途照片中的景点。返回景点名称、可能的城市和置信度。当用户上传图片或询问照片中的景点时使用此工具。",
  parameters: Type.Object({
    imageUrl: Type.String({
      description: "用户上传图片的 URL",
    }),
    knownAttractions: Type.Optional(
      Type.Array(
        Type.Object({
          name: Type.String({ description: "景点名" }),
          city: Type.String({ description: "城市" }),
        }),
      ),
    ),
  }),
  execute: async (_toolCallId, params) => {
    const { imageUrl, knownAttractions } = params as {
      imageUrl: string;
      knownAttractions?: Array<{ name: string; city: string }>;
    };

    // 注意：实际的图片识别需要多模态 LLM 调用
    // 这里先返回一个结构化的提示，让 LLM 在编排层处理
    // 当 pi-ai 支持多模态 input 时，这里可以直接调用

    const knownList = knownAttractions
      ? knownAttractions.map((a) => `${a.name}(${a.city})`).join("、")
      : "无";

    const content = `## 📷 图片识别\n\n` +
      `用户上传了一张图片，请分析图片中的景点。\n\n` +
      `**图片 URL**: ${imageUrl}\n\n` +
      `**已知景点列表**: ${knownList}\n\n` +
      `请描述图片中可能的景点名称、所在城市和置信度（高/中/低）。` +
      `如果图片中识别到了已知景点列表中的景点，请明确指出匹配的景点。`;

    return {
      content: [{ type: "text" as const, text: content }],
      details: {
        imageUrl,
        recognized: false,
        note: "图片识别需要多模态 LLM 支持（GPT-4o / Claude Vision / Gemini）。当前为占位实现。",
      },
    };
  },
};
