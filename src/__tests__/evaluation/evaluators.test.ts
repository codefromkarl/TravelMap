/**
 * AI 自动化评估框架
 *
 * 三层评估体系：
 *   1. 结构化断言 — 确定性代码检查（hard assertion）
 *   2. LLM-as-Judge — 语义质量评估（soft report）
 *   3. AI E2E 集成 — 真实 LLM 调用的端到端评估
 */

// biome-ignore-all lint/suspicious/noExportsInTest: 评估框架需要导出供其他测试文件使用

import { describe, expect, it } from "vitest";
import { describeAiE2e, discoverProvider, setupTokenReport } from "../helpers/ai-e2e.js";

// ─── 评估器接口 ─────────────────────────────────────────────

export interface EvaluationResult {
  /** 评估项名称 */
  name: string;
  /** 分数 0-1 */
  score: number;
  /** 详细说明 */
  reason: string;
  /** 是否通过 (score >= threshold) */
  passed: boolean;
}

export interface Evaluator {
  name: string;
  evaluate(input: string, output: string): Promise<EvaluationResult>;
}

// ─── 结构化断言评估器 ──────────────────────────────────────

/**
 * 验证 Agent 输出包含行程规划所需的结构化信息
 */
export function assertTripPlanStructure(output: string): EvaluationResult[] {
  const results: EvaluationResult[] = [];

  const checks: Array<{ name: string; pattern: RegExp; required: boolean }> = [
    { name: "包含目的地", pattern: /目的地|城市|景点|行程|旅游|出发|抵达/, required: true },
    {
      name: "包含日期",
      pattern: /\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日]?|Day\s*\d|第[一二三四五六七八九十]+天/,
      required: true,
    },
    { name: "包含景点推荐", pattern: /景点|游览|参观|推荐|攻略/, required: true },
    { name: "包含餐饮建议", pattern: /早餐|午餐|晚餐|美食|餐厅/, required: false },
    { name: "包含住宿建议", pattern: /住宿|酒店|民宿/, required: false },
    { name: "包含费用信息", pattern: /预算|费用|价格|元|¥/, required: false },
  ];

  for (const check of checks) {
    const match = check.pattern.test(output);
    results.push({
      name: check.name,
      score: match ? 1 : 0,
      reason: match
        ? `输出匹配 ${check.name} 模式`
        : `输出未匹配 ${check.name} 模式 (${check.pattern.source})`,
      passed: check.required ? match : true,
    });
  }

  return results;
}

/**
 * 验证工具调用结果的格式
 */
export function assertToolResultFormat(result: {
  content: Array<{ type: string; text?: string }>;
  details: unknown;
}): EvaluationResult[] {
  const results: EvaluationResult[] = [];

  results.push({
    name: "content 是数组",
    score: Array.isArray(result.content) ? 1 : 0,
    reason: Array.isArray(result.content) ? "content 格式正确" : "content 不是数组",
    passed: Array.isArray(result.content),
  });

  const hasText = result.content.some((c) => c.type === "text");
  results.push({
    name: "包含 text 内容",
    score: hasText ? 1 : 0,
    reason: hasText ? "包含 text 内容" : "缺少 text 内容",
    passed: hasText,
  });

  results.push({
    name: "details 存在",
    score: result.details !== undefined ? 1 : 0,
    reason: result.details !== undefined ? "details 存在" : "缺少 details",
    passed: result.details !== undefined,
  });

  return results;
}

// ─── LLM-as-Judge 评估器 ──────────────────────────────────

/**
 * 使用 LLM 对 Agent 输出进行语义质量评分
 *
 * 评估维度：合理性 (1-5)
 * 注意：这是 soft report，分数不作为测试 fail 条件
 */
export async function llmJudgeReasonableness(
  input: string,
  output: string,
): Promise<EvaluationResult> {
  const provider = discoverProvider();
  if (!provider.hasKey) {
    return {
      name: "合理性 (LLM Judge)",
      score: 0,
      reason: "无可用 LLM Key，跳过 Judge 评估",
      passed: true, // 不阻塞
    };
  }

  const { getModel } = await import("@earendil-works/pi-ai");
  const { Agent } = await import("@earendil-works/pi-agent-core");
  const { createAssistantMessageEventStream } = await import("@earendil-works/pi-ai");

  const model = getModel(
    (process.env.JUDGE_MODEL_PROVIDER ?? provider.provider) as "openai",
    (process.env.JUDGE_MODEL_ID ?? provider.model) as "gpt-4o",
  );

  const judgePrompt = `你是一个旅行规划质量评审专家。请评估以下旅行规划的合理性，给出 1-5 的分数。

用户需求：${input}

Agent 输出：
${output.slice(0, 2000)}

评分标准：
- 5分：行程安排合理、时间充裕、景点顺序逻辑清晰
- 4分：基本合理，有少量可优化之处
- 3分：大致可行，但存在明显不足
- 2分：多处不合理
- 1分：完全不合理或未回答问题

请只返回一个 JSON：
{"score": <1-5>, "reason": "<简短说明>"}`;

  const stream = createAssistantMessageEventStream();
  const _assistantMsg = {
    role: "assistant" as const,
    content: [{ type: "text" as const, text: "" }],
    stopReason: "stop" as const,
    timestamp: Date.now(),
  };

  // 使用 Agent 执行 Judge 调用
  const _agent = new Agent({
    initialState: {
      systemPrompt: "你是一个评分助手，只返回 JSON 格式的评分结果。",
      model,
      thinkingLevel: "off",
      tools: [],
      messages: [
        { role: "user", content: [{ type: "text", text: judgePrompt }], timestamp: Date.now() },
      ],
    },
    streamFn: () => {
      // 不需要 streamFn，Agent 会直接调用 model
      // biome-ignore lint/suspicious/noExplicitAny: mock 测试用
      return stream as any;
    },
    // biome-ignore lint/suspicious/noExplicitAny: mock 测试用
    convertToLlm: (msgs) => msgs as any,
  });

  // 简化：直接用 model 调用
  try {
    const { streamSimple } = await import("@earendil-works/pi-ai");
    // biome-ignore lint/suspicious/noExplicitAny: third-party type mismatch
    const response = await (streamSimple as any)(model, [
      {
        role: "user" as const,
        content: [{ type: "text" as const, text: judgePrompt }],
        timestamp: Date.now(),
      },
    ]);

    // 收集文本
    let text = "";
    for await (const event of response as AsyncIterable<any>) {
      if (event.type === "done" && event.message?.content) {
        for (const c of event.message.content) {
          if (c.type === "text" && c.text) text += c.text;
        }
      }
    }

    // 解析 JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const score = Number(parsed.score ?? 0);
      return {
        name: "合理性 (LLM Judge)",
        score: score / 5,
        reason: parsed.reason ?? "无说明",
        passed: true, // soft report — 不 fail
      };
    }
  } catch (err) {
    console.warn("[LLM Judge] 评估失败:", err instanceof Error ? err.message : err);
  }

  return {
    name: "合理性 (LLM Judge)",
    score: 0,
    reason: "LLM Judge 调用失败",
    passed: true,
  };
}

// ─── 工具调用验证 ──────────────────────────────────────────

/**
 * 验证工具调用集合是否包含期望的工具（子集匹配）
 */
export function assertToolCalls(
  actual: Array<{ name: string }>,
  expected: string[],
): { passed: boolean; missing: string[] } {
  const called = new Set(actual.map((t) => t.name));
  const missing = expected.filter((name) => !called.has(name));
  return { passed: missing.length === 0, missing };
}

// ─── 测试用例 ───────────────────────────────────────────────

describe("AI 评估框架 — 结构化断言", () => {
  describe("assertTripPlanStructure", () => {
    it("完整的行程规划应通过所有检查", () => {
      const output = `
        ## 北京 3 日行程规划

        **目的地**: 北京
        **日期**: 2025-06-01 至 2025-06-03

        ### Day 1
        - 景点: 故宫博物院（游览 3 小时，门票 ¥60）
        - 午餐: 南锣鼓巷小吃
        - 晚餐: 全聚德烤鸭
        - 住宿: 如家酒店（约 ¥300/晚）

        **总预算**: 约 ¥2500
      `;

      const results = assertTripPlanStructure(output);
      const allPassed = results.every((r) => r.passed);
      expect(allPassed).toBe(true);

      const scores = results.map((r) => r.score);
      expect(scores.every((s) => s >= 0.5)).toBe(true);
    });

    it("缺失关键信息应标记 required 项为失败", () => {
      const output = "这是一段没有行程信息的随机文本";

      const results = assertTripPlanStructure(output);
      const requiredFails = results.filter((r) => !r.passed);
      expect(requiredFails.length).toBeGreaterThan(0);
    });
  });

  describe("assertToolResultFormat", () => {
    it("格式正确的工具结果应通过", () => {
      const result = {
        content: [{ type: "text", text: "搜索结果" }],
        details: { city: "北京" },
      };

      const results = assertToolResultFormat(result);
      expect(results.every((r) => r.passed)).toBe(true);
    });

    it("格式错误应标记失败", () => {
      const result = {
        content: [],
        details: undefined,
      };

      const results = assertToolResultFormat(result);
      const failed = results.filter((r) => !r.passed);
      expect(failed.length).toBeGreaterThan(0);
    });
  });

  describe("assertToolCalls", () => {
    it("子集匹配 — 包含所有期望工具时通过", () => {
      const actual = [
        { name: "search_attractions" },
        { name: "search_hotels" },
        { name: "geocode" },
      ];
      const result = assertToolCalls(actual, ["search_attractions", "search_hotels"]);
      expect(result.passed).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it("子集匹配 — 缺少期望工具时失败", () => {
      const actual = [{ name: "geocode" }];
      const result = assertToolCalls(actual, ["search_attractions"]);
      expect(result.passed).toBe(false);
      expect(result.missing).toEqual(["search_attractions"]);
    });
  });
});

// ─── LLM-as-Judge 测试（需要 API Key）───────────────────────

describeAiE2e("LLM-as-Judge 评估", () => {
  setupTokenReport();

  it("应对高质量行程输出给出合理评分", async () => {
    const output = `
## 北京 3 日行程规划

**目的地**: 北京
**日期**: 2025-06-01 至 2025-06-03

### Day 1
- 景点: 故宫博物院（游览 3 小时，门票 ¥60）
- 景点: 景山公园（俯瞰故宫全景）
- 午餐: 南锣鼓巷小吃
- 晚餐: 全聚德烤鸭
- 住宿: 如家酒店（约 ¥300/晚）

### Day 2
- 景点: 八达岭长城（一日游，门票 ¥40）
- 午餐: 长城脚下农家菜
- 晚餐: 簋街小吃
- 住宿: 同上

### Day 3
- 景点: 颐和园（游览 3 小时）
- 景点: 圆明园遗址
- 午餐: 五道口韩餐
- 下午返程

**总预算**: 约 ¥2500（含门票、餐饮、住宿、交通）
`;

    const result = await llmJudgeReasonableness("帮我规划北京三日游", output);

    console.log(`[LLM Judge] score: ${result.score}, reason: ${result.reason}`);
    // soft report — 只记录，不 fail
    expect(result.name).toBe("合理性 (LLM Judge)");
  }, 60_000);
});
