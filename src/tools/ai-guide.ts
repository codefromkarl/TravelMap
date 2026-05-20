/**
 * AI 导游讲解 Tool — 景点语音讲解生成
 *
 * 当用户到达景点附近时，自动生成景点讲解稿。
 * 结合景点信息 + 历史背景 + 趣闻轶事，生成生动的导游词。
 */

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

// ─── 讲解文本生成 ──────────────────────────────────────

interface AttractionForGuide {
  nameZh: string;
  nameEn?: string;
  city: string;
  description: string;
  category?: string;
  visitDuration?: number;
  ticketPrice?: number;
  address?: string;
}

interface GuideOptions {
  style: "brief" | "standard" | "detailed";
  language: "zh" | "en" | "ja";
  includeHistory?: boolean;
  includeTips?: boolean;
}

/**
 * 生成景点讲解稿
 */
function generateGuideText(attraction: AttractionForGuide, options: GuideOptions): string {
  const parts: string[] = [];

  // 开场
  const name = attraction.nameZh;
  const enName = attraction.nameEn ? `（${attraction.nameEn}）` : "";

  switch (options.style) {
    case "brief":
      parts.push(`欢迎来到${name}${enName}！`);
      parts.push(attraction.description);
      break;

    case "standard":
      parts.push(`各位游客，欢迎来到${name}${enName}！`);
      parts.push(`${name}位于${attraction.city}，${attraction.description}`);
      if (attraction.category) {
        parts.push(`这里是${attraction.category}类景点。`);
      }
      if (attraction.visitDuration) {
        parts.push(`建议游览时间约${attraction.visitDuration}分钟。`);
      }
      break;

    case "detailed":
      parts.push(`各位游客，欢迎来到${name}${enName}！`);
      parts.push(
        `${name}坐落于${attraction.city}${attraction.address ? attraction.address : ""}，${attraction.description}`,
      );
      if (attraction.category) {
        parts.push(`作为${attraction.category}类景点，这里有着独特的魅力。`);
      }
      if (attraction.visitDuration) {
        parts.push(`建议您安排约${attraction.visitDuration}分钟的游览时间。`);
      }
      if (attraction.ticketPrice !== undefined && attraction.ticketPrice > 0) {
        parts.push(`门票价格为${attraction.ticketPrice}元。`);
      } else if (attraction.ticketPrice === 0) {
        parts.push(`这里是免费开放的景点。`);
      }
      break;
  }

  // 游览提示
  if (options.includeTips) {
    parts.push("\n📌 温馨提示：");
    parts.push("• 请保管好随身物品");
    parts.push("• 注意安全，遵守景区规定");
    parts.push("• 如需帮助，可咨询景区工作人员");
  }

  return parts.join("");
}

// ─── Tool 定义 ──────────────────────────────────────────

export const aiGuideTool: AgentTool & { costTier: "cheap" } = {
  costTier: "cheap",
  name: "ai_guide_commentary",
  label: "AI 导游讲解",
  description:
    "为景点生成语音讲解稿。当用户到达景点附近、请求景点讲解、或想了解景点详情时使用。返回格式化的讲解文本，前端会用 TTS 朗读。",
  parameters: Type.Object({
    attraction: Type.Object({
      nameZh: Type.String({ description: "景点中文名" }),
      nameEn: Type.Optional(Type.String({ description: "景点英文名" })),
      city: Type.String({ description: "所在城市" }),
      description: Type.String({ description: "景点描述" }),
      category: Type.Optional(Type.String({ description: "景点类别" })),
      visitDuration: Type.Optional(Type.Number({ description: "建议游览时长（分钟）" })),
      ticketPrice: Type.Optional(Type.Number({ description: "门票价格（元）" })),
      address: Type.Optional(Type.String({ description: "详细地址" })),
    }),
    options: Type.Optional(
      Type.Object({
        style: Type.Optional(
          Type.Union([Type.Literal("brief"), Type.Literal("standard"), Type.Literal("detailed")], {
            description: "讲解风格：brief(30秒)/standard(1分钟)/detailed(2分钟)",
            default: "standard",
          }),
        ),
        language: Type.Optional(
          Type.Union([Type.Literal("zh"), Type.Literal("en"), Type.Literal("ja")], {
            description: "语言",
            default: "zh",
          }),
        ),
        includeTips: Type.Optional(
          Type.Boolean({ description: "是否包含游览提示", default: true }),
        ),
      }),
    ),
  }),
  execute: async (_toolCallId, params) => {
    const { attraction, options: rawOptions } = params as {
      attraction: AttractionForGuide;
      options?: Partial<GuideOptions>;
    };

    const options: GuideOptions = {
      style: rawOptions?.style || "standard",
      language: rawOptions?.language || "zh",
      includeTips: rawOptions?.includeTips ?? true,
    };

    const guideText = generateGuideText(attraction, options);

    // 估算时长（中文约 5 字/秒）
    const charCount = guideText.length;
    const estimatedSeconds = Math.ceil(charCount / 5);

    return {
      content: [
        {
          type: "text" as const,
          text:
            `## 🎙️ AI 导游讲解\n\n` +
            `**景点**: ${attraction.nameZh}\n` +
            `**风格**: ${options.style === "brief" ? "简短" : options.style === "standard" ? "标准" : "详细"}\n` +
            `**时长**: 约 ${estimatedSeconds} 秒\n\n` +
            `---\n\n` +
            guideText,
        },
      ],
      details: {
        guideText,
        charCount,
        estimatedSeconds,
        style: options.style,
        language: options.language,
      },
    };
  },
};
