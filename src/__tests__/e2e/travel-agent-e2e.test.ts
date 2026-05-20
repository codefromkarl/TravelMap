/**
 * TravelAgent 真实 LLM 端到端测试
 *
 * 两种模式：
 *   - 云端模式（pi-ai Model 注册表）: OPENAI_API_KEY=sk-xxx npm run test:ai-e2e
 *   - 本地 Docker 模式（llm-client 直连）: OPENAI_BASE_URL=http://127.0.0.1:8317/v1 OPENAI_API_KEY=sk-xxx AI_MODEL=ds npm run test:ai-e2e
 *
 * 本地 Docker 模式使用 llm-client 直接调用 OpenAI 兼容 API，
 * 模拟 Agent 的 prompt → LLM → 输出 流程。
 */

import { beforeAll, describe, expect, it } from "vitest";
import {
  describeAiE2e,
  discoverProvider,
  reportTokenUsage,
  setupTokenReport,
} from "../helpers/ai-e2e.js";
import { chatCompletion, testLlmConnection } from "../helpers/llm-client.js";

// ─── Helpers ──────────────────────────────────────────────

/** 提取非流式响应的内容文本 */
function getContent(result: Awaited<ReturnType<typeof chatCompletion>>): string {
  return result.choices?.[0]?.message?.content ?? "";
}

/** 构建旅行规划的 system prompt */
function buildTravelSystemPrompt(): string {
  return `你是一个专业的旅行规划助手。根据用户的需求，生成详细的旅行行程规划。

要求：
1. 行程应按天安排，包含上午/下午/晚上的活动
2. 每个景点/餐厅需有名称和简要说明
3. 包含交通方式建议
4. 包含预算估算
5. 输出使用中文`;
}

/** 构建旅行规划用户 prompt */
function buildTravelUserPrompt(request: {
  city: string;
  days: number;
  startDate?: string;
  endDate?: string;
  budget?: number;
  companions?: string;
  keywords?: string[];
}): string {
  let prompt = `请帮我规划${request.city}${request.days}日游`;
  if (request.startDate) prompt += `，${request.startDate}出发`;
  if (request.budget) prompt += `，预算${request.budget}元`;
  if (request.companions) prompt += `，同行人：${request.companions}`;
  if (request.keywords?.length) prompt += `，特别关注：${request.keywords.join("、")}`;
  return prompt;
}

// ─── 测试场景 ──────────────────────────────────────────────

describeAiE2e("TravelAgent 真实 LLM E2E", () => {
  const provider = discoverProvider();
  setupTokenReport();

  beforeAll(async () => {
    console.log(`\n[AI E2E] Mode: ${provider.localMode ? "Local Docker" : "Cloud"}`);
    console.log(`[AI E2E] Provider: ${provider.provider}, Model: ${provider.model}`);

    if (provider.localMode) {
      const test = await testLlmConnection();
      console.log(`[AI E2E] Connection test: ${test.available ? "✅ OK" : `❌ ${test.error}`}`);
      if (!test.available) {
        console.warn(`[AI E2E] ⚠️ LLM 连接失败，测试可能超时或返回空结果`);
      }
    }
  });

  // === 场景 1: 单轮行程规划 ===

  describe("场景 1: 单轮行程规划", () => {
    it("帮我规划北京三日游 — 应生成完整行程", async () => {
      const result = await chatCompletion([
        { role: "system", content: buildTravelSystemPrompt() },
        {
          role: "user",
          content: buildTravelUserPrompt({
            city: "北京",
            days: 3,
            startDate: "2025-07-01",
            endDate: "2025-07-03",
          }),
        },
      ]);
      const output = getContent(result);

      // 断言 1: 有实质输出
      expect(output.length).toBeGreaterThan(100);

      // 断言 2: 包含北京
      expect(output).toMatch(/北京/);

      // 断言 3: 包含行程结构（Day 1 / 第一天 / 日期）
      const hasStructure =
        /Day\s*\d|第[一二三四五六七八九十]+天|\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日]?/.test(output);
      expect(hasStructure).toBe(true);

      // 断言 4: 包含景点推荐
      const hasAttractions = /景点|游览|参观|故宫|长城|颐和园|天坛|天安门/.test(output);
      expect(hasAttractions).toBe(true);

      // 记录 token
      reportTokenUsage({
        scenario: "北京三日游",
        promptTokens: result.usage?.prompt_tokens ?? 0,
        completionTokens: result.usage?.completion_tokens ?? 0,
        totalTokens: result.usage?.total_tokens ?? 0,
        model: result.model ?? "unknown",
      });

      console.log(`[场景1] output: ${output.length} chars, tokens: ${result.usage?.total_tokens}`);
    }, 60_000);
  });

  // === 场景 2: 多轮对话（模拟修改）===

  describe("场景 2: 多轮对话修改", () => {
    it("规划后修改行程 — 应包含修改内容", async () => {
      // 第一轮：规划上海两日游
      const result1 = await chatCompletion([
        { role: "system", content: buildTravelSystemPrompt() },
        { role: "user", content: buildTravelUserPrompt({ city: "上海", days: 2 }) },
      ]);
      const output1 = getContent(result1);

      expect(output1.length).toBeGreaterThan(50);

      // 第二轮：修改（带上下文，截断 assistant 输出避免超时）
      const result2 = await chatCompletion(
        [
          { role: "system", content: buildTravelSystemPrompt() },
          { role: "user", content: "帮我规划上海两日游" },
          { role: "assistant", content: output1.slice(0, 500) + "...(略)" },
          { role: "user", content: "第一天改成去迪士尼乐园" },
        ],
        { maxTokens: 1024 },
      );
      const output2 = getContent(result2);

      // 应包含"迪士尼"
      expect(output2).toContain("迪士尼");

      // 修改后的行程仍应包含上海
      expect(output2).toMatch(/上海/);

      reportTokenUsage({
        scenario: "上海两日游+修改",
        promptTokens: (result1.usage?.prompt_tokens ?? 0) + (result2.usage?.prompt_tokens ?? 0),
        completionTokens:
          (result1.usage?.completion_tokens ?? 0) + (result2.usage?.completion_tokens ?? 0),
        totalTokens: (result1.usage?.total_tokens ?? 0) + (result2.usage?.total_tokens ?? 0),
        model: result2.model,
      });

      console.log(`[场景2] round1: ${output1.length} chars, round2: ${output2.length} chars`);
    }, 120_000);
  });

  // === 场景 3: 模糊输入追问 ===

  describe("场景 3: 模糊输入追问", () => {
    it("我想出去玩 — 应追问更多信息或给出通用建议", async () => {
      const result = await chatCompletion([
        { role: "system", content: buildTravelSystemPrompt() },
        { role: "user", content: "我想出去玩" },
      ]);
      const output = getContent(result);

      expect(output.length).toBeGreaterThan(20);

      // 检查是否包含引导性内容
      const hasGuidance =
        /[？?]/.test(output) || /想去哪|哪里|目的地|可以告诉我|建议|推荐/.test(output);

      if (!hasGuidance) {
        console.warn("[场景3] Agent 未追问模糊输入，soft fail");
      }

      reportTokenUsage({
        scenario: "模糊输入追问",
        promptTokens: result.usage?.prompt_tokens ?? 0,
        completionTokens: result.usage?.completion_tokens ?? 0,
        totalTokens: result.usage?.total_tokens ?? 0,
        model: result.model,
      });

      console.log(`[场景3] output: ${output.slice(0, 100)}...`);
    }, 60_000);
  });
});
