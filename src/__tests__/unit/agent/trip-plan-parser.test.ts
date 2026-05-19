/**
 * TripPlan 解析器单元测试
 */

import { describe, expect, it } from "vitest";
import {
  extractTextFromMessage,
  findLatestPlanInMessages,
  mergeTripPlanDiff,
  parseTripPlanDiff,
  parseTripPlanFromText,
  type TripPlanDiff,
} from "../../../agent/trip-plan-parser.js";
import type { TripPlan } from "../../../types/trip.js";

// ─── 测试 fixtures ────────────────────────────────────────

const SAMPLE_TRIP_PLAN: TripPlan = {
  city: "杭州",
  cities: ["杭州"],
  startDate: "2025-06-01",
  endDate: "2025-06-03",
  days: [
    {
      date: "2025-06-01",
      dayIndex: 1,
      city: "杭州",
      isTransferDay: false,
      transferInfo: "",
      description: "西湖一日游",
      transportation: "地铁",
      accommodation: "西湖附近酒店",
      attractions: [
        {
          name: "西湖",
          nameZh: "西湖",
          nameEn: "West Lake",
          address: "杭州市西湖区",
          location: { latitude: 30.2421, longitude: 120.1484 },
          visitDuration: 180,
          description: "杭州必游景点",
          category: "自然风光",
          ticketPrice: 0,
          reservationRequired: false,
          reservationTips: "",
        },
      ],
      meals: [
        { type: "breakfast", name: "早餐", description: "酒店早餐", estimatedCost: 30 },
        { type: "lunch", name: "午餐", description: "楼外楼", estimatedCost: 80 },
        { type: "dinner", name: "晚餐", description: "知味观", estimatedCost: 60 },
      ],
    },
    {
      date: "2025-06-02",
      dayIndex: 2,
      city: "杭州",
      isTransferDay: false,
      transferInfo: "",
      description: "灵隐寺+龙井",
      transportation: "公交",
      accommodation: "西湖附近酒店",
      attractions: [],
      meals: [],
    },
  ],
  weatherInfo: [],
  overallSuggestions: "建议穿轻便衣物",
};

// ─── extractTextFromMessage ───────────────────────────────

describe("extractTextFromMessage", () => {
  it("从数组格式消息中提取文本", () => {
    const msg = {
      role: "assistant",
      content: [
        { type: "text", text: "第一段" },
        { type: "text", text: "第二段" },
      ],
    };
    expect(extractTextFromMessage(msg)).toBe("第一段\n第二段");
  });

  it("从字符串消息中提取文本", () => {
    const msg = { role: "user", content: "纯文本" };
    expect(extractTextFromMessage(msg)).toBe("纯文本");
  });

  it("空内容返回 null", () => {
    expect(extractTextFromMessage({ role: "user", content: null })).toBeNull();
    expect(extractTextFromMessage({ role: "user", content: undefined })).toBeNull();
  });

  it("过滤非文本类型", () => {
    const msg = {
      role: "assistant",
      content: [
        { type: "text", text: "文本" },
        { type: "image", url: "http://example.com" },
      ],
    };
    expect(extractTextFromMessage(msg)).toBe("文本");
  });
});

// ─── parseTripPlanFromText ────────────────────────────────

describe("parseTripPlanFromText", () => {
  it("从 ```json 代码块中解析", () => {
    const text = `这是行程：\n\`\`\`json\n${JSON.stringify(SAMPLE_TRIP_PLAN)}\n\`\`\`\n以上是完整行程。`;
    const result = parseTripPlanFromText(text);
    expect(result).not.toBeNull();
    expect(result!.city).toBe("杭州");
    expect(result!.days).toHaveLength(2);
  });

  it("从纯 JSON 文本中解析", () => {
    const text = JSON.stringify(SAMPLE_TRIP_PLAN);
    const result = parseTripPlanFromText(text);
    expect(result).not.toBeNull();
    expect(result!.city).toBe("杭州");
  });

  it("从混合文本中提取嵌入式 JSON", () => {
    const text = `好的，这是您的行程：\n${JSON.stringify(SAMPLE_TRIP_PLAN)}\n希望您喜欢！`;
    const result = parseTripPlanFromText(text);
    expect(result).not.toBeNull();
    expect(result!.city).toBe("杭州");
  });

  it("无有效 JSON 返回 null", () => {
    expect(parseTripPlanFromText("这是一段普通文本")).toBeNull();
    expect(parseTripPlanFromText("")).toBeNull();
  });

  it("JSON 缺少 city 字段返回 null", () => {
    const incomplete = JSON.stringify({ days: [], weatherInfo: [] });
    expect(parseTripPlanFromText(incomplete)).toBeNull();
  });

  it("JSON 缺少 days 数组返回 null", () => {
    const incomplete = JSON.stringify({ city: "杭州" });
    expect(parseTripPlanFromText(incomplete)).toBeNull();
  });
});

// ─── parseTripPlanDiff ────────────────────────────────────

describe("parseTripPlanDiff", () => {
  it("解析有效的 Diff JSON", () => {
    const diff = { changedDays: [2], days: { "2": { date: "2025-06-02", description: "修改后" } } };
    const text = JSON.stringify(diff);
    const result = parseTripPlanDiff(text);
    expect(result).not.toBeNull();
    expect(result!.changedDays).toEqual([2]);
  });

  it("从代码块中提取 Diff", () => {
    const diff = { changedDays: [1], days: { "1": { description: "新行程" } } };
    const text = `\`\`\`json\n${JSON.stringify(diff)}\n\`\`\``;
    expect(parseTripPlanDiff(text)).not.toBeNull();
  });

  it("有 city 字段的不是 Diff（是完整 plan）", () => {
    const plan = { city: "杭州", changedDays: [1], days: {} };
    expect(parseTripPlanDiff(JSON.stringify(plan))).toBeNull();
  });

  it("无效文本返回 null", () => {
    expect(parseTripPlanDiff("普通文本")).toBeNull();
  });
});

// ─── mergeTripPlanDiff ────────────────────────────────────

describe("mergeTripPlanDiff", () => {
  it("合并 Diff 到正确的天数", () => {
    const diff: TripPlanDiff = {
      changedDays: [2],
      days: {
        "2": {
          date: "2025-06-02",
          dayIndex: 2,
          city: "杭州",
          isTransferDay: false,
          transferInfo: "",
          description: "修改后的第二天",
          transportation: "打车",
          accommodation: "新酒店",
          attractions: [],
          meals: [],
        },
      },
    };

    const result = mergeTripPlanDiff(SAMPLE_TRIP_PLAN, diff);
    expect(result.days[1]!.description).toBe("修改后的第二天");
    // 第一天不变
    expect(result.days[0]!.description).toBe("西湖一日游");
  });

  it("超出范围的天数索引被忽略", () => {
    const diff: TripPlanDiff = {
      changedDays: [99],
      days: { "99": { description: "不存在的天" } },
    };
    const result = mergeTripPlanDiff(SAMPLE_TRIP_PLAN, diff);
    expect(result.days).toHaveLength(2); // 天数不变
  });

  it("保留非修改天数的引用", () => {
    const diff: TripPlanDiff = {
      changedDays: [2],
      days: { "2": { ...SAMPLE_TRIP_PLAN.days[1], description: "已修改" } },
    };
    const result = mergeTripPlanDiff(SAMPLE_TRIP_PLAN, diff);
    expect(result.days[0]).toBe(SAMPLE_TRIP_PLAN.days[0]); // 同一引用
  });
});

// ─── findLatestPlanInMessages ──────────────────────────────

describe("findLatestPlanInMessages", () => {
  it("从消息历史中找到最新 TripPlan", () => {
    const messages = [
      { role: "user", content: "请规划杭州行程" },
      { role: "assistant", content: [{ type: "text", text: JSON.stringify(SAMPLE_TRIP_PLAN) }] },
    ];
    const found = findLatestPlanInMessages(messages);
    expect(found).not.toBeNull();
    if (!found) return;
    expect(found.type).toBe("plan");
    expect((found as { type: "plan"; plan: TripPlan }).plan.city).toBe("杭州");
  });

  it("从消息历史中找到 Diff", () => {
    const diff = { changedDays: [1], days: { "1": { description: "修改" } } };
    const messages = [
      { role: "user", content: "请规划杭州行程" },
      { role: "assistant", content: [{ type: "text", text: JSON.stringify(SAMPLE_TRIP_PLAN) }] },
      { role: "user", content: "修改第一天" },
      { role: "assistant", content: [{ type: "text", text: JSON.stringify(diff) }] },
    ];
    const found = findLatestPlanInMessages(messages);
    expect(found).not.toBeNull();
    expect(found!.type).toBe("diff");
  });

  it("无 assistant 消息返回 null", () => {
    const messages = [{ role: "user", content: "请规划行程" }];
    expect(findLatestPlanInMessages(messages)).toBeNull();
  });

  it("assistant 消息无有效 JSON 返回 null", () => {
    const messages = [
      { role: "user", content: "请规划行程" },
      { role: "assistant", content: [{ type: "text", text: "好的，让我来帮您规划" }] },
    ];
    expect(findLatestPlanInMessages(messages)).toBeNull();
  });

  it("返回最近的 plan（从后往前搜索）", () => {
    const plan1 = { ...SAMPLE_TRIP_PLAN, city: "上海" };
    const plan2 = { ...SAMPLE_TRIP_PLAN, city: "北京" };
    const messages = [
      { role: "assistant", content: [{ type: "text", text: JSON.stringify(plan1) }] },
      { role: "user", content: "换成北京" },
      { role: "assistant", content: [{ type: "text", text: JSON.stringify(plan2) }] },
    ];
    const found = findLatestPlanInMessages(messages);
    expect(found).not.toBeNull();
    if (!found) return;
    expect(found.type).toBe("plan");
    expect((found as { type: "plan"; plan: TripPlan }).plan.city).toBe("北京");
  });
});
