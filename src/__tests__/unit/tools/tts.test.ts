/**
 * TTS 工具单元测试
 */

import { describe, expect, it } from "vitest";
import { generateSpeechText, ttsTool } from "../../../tools/tts.js";

describe("generateSpeechText", () => {
  it("应生成包含城市名和天数的开场白", () => {
    const plan = {
      city: "杭州",
      cities: ["杭州"],
      startDate: "2026-05-20",
      endDate: "2026-05-22",
      totalDays: 3,
      days: [
        { date: "5月20日", city: "杭州", attractions: [], transportation: "步行" },
        { date: "5月21日", city: "杭州", attractions: [], transportation: "步行" },
        { date: "5月22日", city: "杭州", attractions: [], transportation: "步行" },
      ],
    };

    const text = generateSpeechText(plan);
    expect(text).toContain("杭州");
    expect(text).toContain("3天");
  });

  it("应包含景点名称", () => {
    const plan = {
      city: "杭州",
      cities: ["杭州"],
      startDate: "2026-05-20",
      endDate: "2026-05-20",
      totalDays: 1,
      days: [
        {
          date: "5月20日",
          city: "杭州",
          attractions: [
            { nameZh: "西湖", visitDuration: 120, description: "著名景点" },
            { nameZh: "灵隐寺", visitDuration: 90, description: "古寺" },
          ],
          transportation: "步行",
        },
      ],
    };

    const text = generateSpeechText(plan);
    expect(text).toContain("西湖");
    expect(text).toContain("灵隐寺");
  });

  it("应包含餐厅推荐", () => {
    const plan = {
      city: "杭州",
      cities: ["杭州"],
      startDate: "2026-05-20",
      endDate: "2026-05-20",
      totalDays: 1,
      days: [
        {
          date: "5月20日",
          city: "杭州",
          attractions: [{ nameZh: "西湖", visitDuration: 120, description: "" }],
          meals: [
            { type: "lunch", name: "楼外楼" },
            { type: "dinner", name: "外婆家" },
          ],
          transportation: "步行",
        },
      ],
    };

    const text = generateSpeechText(plan);
    expect(text).toContain("楼外楼");
    expect(text).toContain("外婆家");
  });

  it("多城市行程应列出所有城市", () => {
    const plan = {
      city: "杭州",
      cities: ["杭州", "上海"],
      startDate: "2026-05-20",
      endDate: "2026-05-22",
      totalDays: 3,
      days: [
        {
          date: "5月20日",
          city: "杭州",
          attractions: [{ nameZh: "西湖", visitDuration: 120, description: "" }],
          transportation: "步行",
        },
        {
          date: "5月21日",
          city: "上海",
          attractions: [{ nameZh: "外滩", visitDuration: 60, description: "" }],
          transportation: "高铁",
        },
        { date: "5月22日", city: "上海", attractions: [], transportation: "步行" },
      ],
    };

    const text = generateSpeechText(plan);
    expect(text).toContain("杭州");
    expect(text).toContain("上海");
  });

  it("交通转移日应有特殊播报", () => {
    const plan = {
      city: "杭州",
      cities: ["杭州", "上海"],
      startDate: "2026-05-20",
      endDate: "2026-05-21",
      totalDays: 2,
      days: [
        {
          date: "5月20日",
          city: "杭州",
          attractions: [{ nameZh: "西湖", visitDuration: 120, description: "" }],
          transportation: "步行",
        },
        {
          date: "5月21日",
          city: "上海",
          isTransferDay: true,
          attractions: [],
          transportation: "高铁",
        },
      ],
    };

    const text = generateSpeechText(plan);
    expect(text).toContain("交通转移");
  });

  it("应以祝旅途愉快结尾", () => {
    const plan = {
      city: "北京",
      cities: ["北京"],
      startDate: "2026-05-20",
      endDate: "2026-05-20",
      totalDays: 1,
      days: [{ date: "5月20日", city: "北京", attractions: [], transportation: "步行" }],
    };

    const text = generateSpeechText(plan);
    expect(text).toContain("旅途愉快");
  });
});

describe("ttsTool", () => {
  it("应有正确的工具名称", () => {
    expect(ttsTool.name).toBe("generate_trip_speech");
  });

  it("应有 cheap costTier", () => {
    expect(ttsTool.costTier).toBe("cheap");
  });

  it("应返回播报文本", async () => {
    const result = await ttsTool.execute("call-1", {
      tripPlan: {
        city: "杭州",
        cities: ["杭州"],
        startDate: "2026-05-20",
        endDate: "2026-05-20",
        totalDays: 1,
        days: [
          {
            date: "5月20日",
            city: "杭州",
            attractions: [{ nameZh: "西湖", visitDuration: 120, description: "著名景点" }],
            meals: [],
            transportation: "步行",
          },
        ],
      },
    });

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe("text");
    expect(result.details.speechText).toContain("杭州");
    expect(result.details.speechText).toContain("西湖");
    expect(result.details.estimatedSeconds).toBeGreaterThan(0);
  });
});
