/**
 * AI 导游工具单元测试
 */

import { describe, expect, it } from "vitest";
import { aiGuideTool } from "../../../tools/ai-guide.js";

describe("aiGuideTool", () => {
  const sampleAttraction = {
    nameZh: "西湖",
    nameEn: "West Lake",
    city: "杭州",
    description: "著名的世界文化遗产，以秀丽的湖光山色和众多的名胜古迹闻名中外。",
    category: "自然风光",
    visitDuration: 120,
    ticketPrice: 0,
    address: "杭州市西湖区",
  };

  it("应有正确的工具名称", () => {
    expect(aiGuideTool.name).toBe("ai_guide_commentary");
  });

  it("应有 cheap costTier", () => {
    expect(aiGuideTool.costTier).toBe("cheap");
  });

  it("标准风格应包含景点名称和描述", async () => {
    const result = await aiGuideTool.execute("call-1", {
      attraction: sampleAttraction,
      options: { style: "standard" },
    });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("西湖");
    expect(text).toContain("杭州");
    expect(text).toContain("欢迎");
    expect(result.details.style).toBe("standard");
  });

  it("简短风格应简洁明了", async () => {
    const result = await aiGuideTool.execute("call-2", {
      attraction: sampleAttraction,
      options: { style: "brief" },
    });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("西湖");
    expect(result.details.style).toBe("brief");
    expect(result.details.charCount).toBeLessThan(200);
  });

  it("详细风格应包含更多信息", async () => {
    const result = await aiGuideTool.execute("call-3", {
      attraction: sampleAttraction,
      options: { style: "detailed", includeTips: true },
    });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("西湖");
    expect(text).toContain("免费");
    expect(text).toContain("温馨提示");
    expect(result.details.style).toBe("detailed");
  });

  it("应返回时长估算", async () => {
    const result = await aiGuideTool.execute("call-4", {
      attraction: sampleAttraction,
    });

    expect(result.details.estimatedSeconds).toBeGreaterThan(0);
    expect(result.details.charCount).toBeGreaterThan(0);
  });

  it("应支持英文名景点", async () => {
    const result = await aiGuideTool.execute("call-5", {
      attraction: sampleAttraction,
    });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("West Lake");
  });

  it("免费景点应标注免费开放", async () => {
    const result = await aiGuideTool.execute("call-6", {
      attraction: sampleAttraction,
      options: { style: "detailed" },
    });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("免费");
  });

  it("收费景点应显示价格", async () => {
    const paidAttraction = { ...sampleAttraction, ticketPrice: 80 };
    const result = await aiGuideTool.execute("call-7", {
      attraction: paidAttraction,
      options: { style: "detailed" },
    });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("80");
  });
});
