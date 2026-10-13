/**
 * AI 自动化评估框架
 *
 * 三层评估体系：
 *   1. 结构化断言 — 确定性代码检查（hard assertion）
 *   2. LLM-as-Judge — 语义质量评估（soft report）
 *   3. AI E2E 集成 — 真实 LLM 调用的端到端评估
 */

// biome-ignore-all lint/suspicious/noExportsInTest: 评估框架需要导出供其他测试文件使用

import { expect, it } from "vitest";
import {
  describeAiE2e,
  discoverProvider,
  type EvaluationResult,
  setupTokenReport,
} from "../helpers/ai-e2e.js";

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
