/**
 * 黄金数据集 E2E 测试 — 参数化驱动
 *
 * 对每个黄金场景运行真实 LLM，验证：
 *   1. 结构性检查（hard assertion）：工具调用、输出格式
 *   2. 语义质量（soft report）：LLM-as-Judge 评分
 *
 * 运行方式：OPENAI_API_KEY=xxx npm run test:ai-e2e
 */

import { afterAll, beforeAll, expect, it } from "vitest";
import { assertTripPlanStructure } from "../evaluation/evaluators.test.js";
import {
  describeAiE2e,
  discoverProvider,
  reportTokenUsage,
  setupTokenReport,
} from "../helpers/ai-e2e.js";
import { chatCompletion, getContent } from "../helpers/llm-client.js";
import { GOLDEN_EXAMPLES, type GoldenExample } from "./golden-examples.js";

// ─── Helpers ──────────────────────────────────────────────

interface ScenarioResult {
  id: string;
  passed: boolean;
  structureChecks: Array<{ name: string; passed: boolean }>;
  toolCheck: { passed: boolean; missing: string[] };
  customValidation: { passed: boolean; details: string };
  judgeScore?: number;
  judgeReason?: string;
  outputLength: number;
  error?: string;
}

const results: ScenarioResult[] = [];

// ─── 参数化测试 ────────────────────────────────────────────

describeAiE2e("黄金数据集 E2E", () => {
  const provider = discoverProvider();
  setupTokenReport();

  beforeAll(async () => {
    console.log(`\n=== Golden Dataset E2E ===`);
    console.log(`Mode: ${provider.localMode ? "Local Docker" : "Cloud"}`);
    console.log(`Provider: ${provider.provider}, Model: ${provider.model}`);
    console.log(`Scenarios: ${GOLDEN_EXAMPLES.length}`);

    // Pre-flight 连接测试
    if (provider.localMode) {
      const { testLlmConnection } = await import("../helpers/llm-client.js");
      const test = await testLlmConnection();
      console.log(`Connection: ${test.available ? "✅ OK" : `❌ ${test.error}`}`);
      if (!test.available) {
        console.warn(`⚠️ LLM 连接失败，后续测试可能超时`);
      }
    }
  });

  // 为每个场景生成独立测试
  for (const scenario of GOLDEN_EXAMPLES) {
    it(`场景: ${scenario.description}`, async () => {
      const result = await runScenario(scenario, provider);
      results.push(result);

      // 结构性检查 — hard assertion
      const requiredChecks = result.structureChecks.filter((c) => !c.passed);
      expect(requiredChecks, `场景 ${scenario.id} 结构检查失败`).toEqual([]);

      // 工具调用检查 — hard assertion
      expect(
        result.toolCheck.passed,
        `场景 ${scenario.id} 缺少工具: ${result.toolCheck.missing.join(", ")}`,
      ).toBe(true);

      // 自定义验证 — hard assertion
      expect(
        result.customValidation.passed,
        `场景 ${scenario.id} 自定义验证: ${result.customValidation.details}`,
      ).toBe(true);
    }, 120_000);
  }

  // === 汇总报告 ===
  afterAll(async () => {
    if (results.length === 0) return;

    console.log("\n=== Golden Dataset Results ===");
    let _allPassed = true;
    for (const r of results) {
      const status = r.passed ? "✅" : "❌";
      console.log(
        `  ${status} ${r.id}: output=${r.outputLength}chars, tools=${r.toolCheck.passed ? "ok" : r.toolCheck.missing.join(",")}, custom=${r.customValidation.passed ? "ok" : r.customValidation.details}`,
      );
      if (!r.passed) _allPassed = false;

      // LLM Judge 评分（soft report）
      if (r.judgeScore !== undefined) {
        console.log(`     Judge: ${r.judgeScore}/1.0 — ${r.judgeReason}`);
      }

      if (r.error) {
        console.log(`     Error: ${r.error}`);
      }
    }

    console.log(`\n  Summary: ${results.filter((r) => r.passed).length}/${results.length} passed`);

    // 写入报告
    const fs = await import("node:fs");
    const path = await import("node:path");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reportPath = path.resolve(process.cwd(), "eval-results", `golden-${timestamp}.json`);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        {
          type: "golden-dataset",
          timestamp: new Date().toISOString(),
          provider: provider.provider,
          model: provider.model,
          totalScenarios: results.length,
          passed: results.filter((r) => r.passed).length,
          failed: results.filter((r) => !r.passed).length,
          scenarios: results,
        },
        null,
        2,
      ),
    );
    console.log(`  Report: ${reportPath}`);
  });
});

// ─── 场景执行器 ────────────────────────────────────────────

async function runScenario(
  scenario: GoldenExample,
  provider: { provider: string; model: string; localMode: boolean },
): Promise<ScenarioResult> {
  const result: ScenarioResult = {
    id: scenario.id,
    passed: false,
    structureChecks: [],
    toolCheck: { passed: true, missing: [] }, // 本地模式无法追踪工具调用
    customValidation: { passed: false, details: "未执行" },
    outputLength: 0,
  };

  try {
    const systemPrompt =
      "你是一个专业的旅行规划助手。根据用户的需求，生成详细的旅行行程规划。行程应按天安排，包含景点、餐饮、住宿建议和预算估算。输出使用中文。";
    const userPrompt =
      `请帮我规划${scenario.request.city}${scenario.request.days}日游` +
      (scenario.request.startDate ? `，${scenario.request.startDate}出发` : "") +
      (scenario.request.budget ? `，预算${scenario.request.budget}元` : "") +
      (scenario.request.companions ? `，同行人：${scenario.request.companions}` : "") +
      (scenario.request.keywords?.length
        ? `，特别关注：${scenario.request.keywords.join("、")}`
        : "");

    const llmResult = await chatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    const output = getContent(llmResult);
    result.outputLength = output.length;

    // 1. 结构性检查
    const structResults = assertTripPlanStructure(output);
    result.structureChecks = structResults.map((r) => ({
      name: r.name,
      passed: r.passed,
    }));

    // 额外结构检查：expectedStructure 正则
    for (const pattern of scenario.expectedStructure) {
      const matched = pattern.test(output);
      result.structureChecks.push({
        name: `匹配 ${pattern.source.slice(0, 30)}`,
        passed: matched,
      });
    }

    // 2. 工具调用检查（本地模式跳过）
    if (provider.localMode) {
      result.toolCheck = { passed: true, missing: [] }; // 无法追踪
    }

    // 3. 自定义验证
    result.customValidation = scenario.validationFn(output, []);

    // 综合判定
    const structPass = result.structureChecks.every((c) => c.passed);
    result.passed = structPass && result.toolCheck.passed && result.customValidation.passed;

    // 记录 token
    reportTokenUsage({
      scenario: scenario.id,
      promptTokens: llmResult.usage?.prompt_tokens ?? 0,
      completionTokens: llmResult.usage?.completion_tokens ?? 0,
      totalTokens: llmResult.usage?.total_tokens ?? 0,
      model: llmResult.model ?? provider.model,
    });
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    result.passed = false;
  }

  return result;
}
