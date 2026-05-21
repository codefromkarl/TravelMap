/**
 * Agent E2E 测试 — 真实 TravelAgent 执行追踪
 *
 * 与 golden-e2e.test.ts 的区别：
 *   - 使用真实的 TravelAgent（而非直接调用 chatCompletion）
 *   - 追踪工具调用序列（名称、参数、结果、耗时）
 *   - 追踪 token 消耗（通过 costTracker）
 *   - 追踪审查结果（ReviewAgent）
 *   - 验证 expectedTools（当前是死代码）
 *
 * 运行方式：OPENAI_API_KEY=xxx npm run test:ai-e2e
 */

import { afterAll, beforeAll, expect, it } from "vitest";
import { TravelAgent } from "../../agent/travel-agent.js";
import { getCostTracker } from "../../services/cost-tracker.js";
import type { TripRequest } from "../../types/trip.js";
import { assertTripPlanStructure } from "../evaluation/evaluators.test.js";
import {
  describeAiE2e,
  discoverProvider,
  reportTokenUsage,
  setupTokenReport,
} from "../helpers/ai-e2e.js";
import { GOLDEN_EXAMPLES, type GoldenExample } from "./golden-examples.js";

// ─── 类型定义 ──────────────────────────────────────────────

interface ToolCallRecord {
  name: string;
  params: unknown;
  result: unknown;
  durationMs: number;
  timestamp: number;
}

interface AgentScenarioResult {
  id: string;
  passed: boolean;
  structureChecks: Array<{ name: string; passed: boolean }>;
  toolCheck: { passed: boolean; missing: string[]; called: string[] };
  customValidation: { passed: boolean; details: string };
  toolCalls: ToolCallRecord[];
  tokenUsage: { input: number; output: number; total: number };
  reviewScore?: number;
  reviewIssues?: string[];
  outputLength: number;
  durationMs: number;
  error?: string;
}

const results: AgentScenarioResult[] = [];

// ─── 工具调用追踪器 ────────────────────────────────────────

class ToolCallTracker {
  private calls: ToolCallRecord[] = [];
  private pendingCalls: Map<string, { start: number; params: unknown }> = new Map();

  onToolStart(name: string, params: unknown): void {
    this.pendingCalls.set(name, {
      start: Date.now(),
      params,
    });
  }

  onToolEnd(name: string, result: unknown): void {
    const pending = this.pendingCalls.get(name);
    if (pending) {
      this.calls.push({
        name,
        params: pending.params,
        result,
        durationMs: Date.now() - pending.start,
        timestamp: pending.start,
      });
      this.pendingCalls.delete(name);
    }
  }

  getCalls(): ToolCallRecord[] {
    return [...this.calls];
  }

  getCalledToolNames(): string[] {
    return [...new Set(this.calls.map((c) => c.name))];
  }

  reset(): void {
    this.calls = [];
    this.pendingCalls.clear();
  }
}

// ─── 事件类型（基于 pi-agent-core） ────────────────────────

interface AgentToolExecutionEvent {
  type: "tool_execution_start" | "tool_execution_end";
  toolName: string;
  toolCall: { name: string; arguments: unknown };
  result?: unknown;
}

type AgentEventWithType =
  | { type: "agent_start" | "agent_end" }
  | AgentToolExecutionEvent
  | { type: string; [key: string]: unknown };

// ─── 场景转换 ──────────────────────────────────────────────

function goldenToTripRequest(scenario: GoldenExample): TripRequest {
  const { request } = scenario;
  const startDate = request.startDate ?? "2025-07-01";
  const endDate =
    request.endDate ??
    (() => {
      const d = new Date(startDate);
      d.setDate(d.getDate() + request.days - 1);
      return d.toISOString().split("T")[0];
    })();

  return {
    city: request.city,
    cities: [{ city: request.city, days: request.days }],
    startDate,
    endDate,
    travelDays: request.days,
    transportation: "公共交通",
    accommodation: "酒店",
    preferences: request.keywords ?? [],
    freeTextInput: scenario.input,
    language: "zh-CN",
  };
}

// ─── 参数化测试 ────────────────────────────────────────────

describeAiE2e("Agent E2E 执行追踪", () => {
  const provider = discoverProvider();
  const tracker = new ToolCallTracker();
  setupTokenReport();

  beforeAll(async () => {
    console.log(`\n=== Agent E2E 执行追踪 ===`);
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
      tracker.reset();
      const result = await runAgentScenario(scenario, provider, tracker);
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
    }, 180_000); // Agent 执行可能需要更长时间
  }

  // === 汇总报告 ===
  afterAll(async () => {
    if (results.length === 0) return;

    console.log("\n=== Agent E2E 执行追踪结果 ===");
    let _allPassed = true;
    for (const r of results) {
      const status = r.passed ? "✅" : "❌";
      console.log(
        `  ${status} ${r.id}: tools=${r.toolCheck.called.join(",") || "none"}, tokens=${r.tokenUsage.total}, duration=${r.durationMs}ms`,
      );
      if (!r.passed) _allPassed = false;

      // 工具调用详情
      if (r.toolCalls.length > 0) {
        console.log(`     Tool calls: ${r.toolCalls.length}`);
        for (const call of r.toolCalls) {
          console.log(`       - ${call.name}: ${call.durationMs}ms`);
        }
      }

      // 审查结果
      if (r.reviewScore !== undefined) {
        console.log(`     Review: ${r.reviewScore}/10, issues: ${r.reviewIssues?.length ?? 0}`);
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
    const reportPath = path.resolve(process.cwd(), "eval-results", `agent-${timestamp}.json`);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        {
          type: "agent-e2e",
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

// ─── Agent 场景执行器 ──────────────────────────────────────

async function runAgentScenario(
  scenario: GoldenExample,
  provider: { provider: string; model: string; localMode: boolean },
  tracker: ToolCallTracker,
): Promise<AgentScenarioResult> {
  const startTime = Date.now();
  const result: AgentScenarioResult = {
    id: scenario.id,
    passed: false,
    structureChecks: [],
    toolCheck: { passed: true, missing: [], called: [] },
    customValidation: { passed: false, details: "未执行" },
    toolCalls: [],
    tokenUsage: { input: 0, output: 0, total: 0 },
    outputLength: 0,
    durationMs: 0,
  };

  try {
    // 创建 TravelAgent 实例
    const agent = new TravelAgent({
      provider: provider.provider as "openai" | "deepseek",
      model: provider.model,
      preSearch: true, // 启用预搜索
      reviewEnabled: true, // 启用审查
      postProcess: { enableActionLinks: true }, // 启用后处理
    });

    // 订阅事件，追踪工具调用
    agent.onEvent((event: AgentEventWithType) => {
      if (event.type === "tool_execution_start") {
        const toolEvent = event as AgentToolExecutionEvent;
        tracker.onToolStart(toolEvent.toolCall.name, toolEvent.toolCall.arguments);
      } else if (event.type === "tool_execution_end") {
        const toolEvent = event as AgentToolExecutionEvent;
        tracker.onToolEnd(toolEvent.toolCall.name, toolEvent.result);
      }
    });

    // 转换请求格式
    const request = goldenToTripRequest(scenario);

    // 执行 Agent
    await agent.planTrip(request);

    // 获取结果
    const toolCalls = tracker.getCalls();
    result.toolCalls = toolCalls;
    result.toolCheck.called = tracker.getCalledToolNames();

    // 获取最终输出（从 agent 的消息历史中提取）
    const messages = agent.getMessages();
    const lastAssistantMessage = messages.filter((m) => m.role === "assistant").pop();
    const output =
      typeof lastAssistantMessage?.content === "string"
        ? lastAssistantMessage.content
        : Array.isArray(lastAssistantMessage?.content)
          ? lastAssistantMessage.content
              .filter((c: any) => c.type === "text")
              .map((c: any) => c.text)
              .join("")
          : "";
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

    // 2. 工具调用检查
    if (scenario.expectedTools.length > 0) {
      const calledSet = new Set(result.toolCheck.called);
      const missingTools = scenario.expectedTools.filter((t) => !calledSet.has(t));
      result.toolCheck = {
        passed: missingTools.length === 0,
        missing: missingTools,
        called: result.toolCheck.called,
      };
    }

    // 3. 自定义验证
    result.customValidation = scenario.validationFn(
      output,
      toolCalls.map((c) => ({ name: c.name })),
    );

    // 4. Token 消耗
    const costTracker = getCostTracker();
    const summary = costTracker.getSummary();
    result.tokenUsage = {
      input: summary.totalInputTokens,
      output: summary.totalOutputTokens,
      total: summary.totalInputTokens + summary.totalOutputTokens,
    };

    // 5. 审查结果
    const lastReview = agent.getLastReview();
    if (lastReview) {
      result.reviewScore = lastReview.score;
      result.reviewIssues = lastReview.issues.map((i) => i.description);
    }

    // 综合判定
    const structPass = result.structureChecks.every((c) => c.passed);
    result.passed = structPass && result.toolCheck.passed && result.customValidation.passed;
    result.durationMs = Date.now() - startTime;

    // 记录 token
    reportTokenUsage({
      scenario: scenario.id,
      promptTokens: result.tokenUsage.input,
      completionTokens: result.tokenUsage.output,
      totalTokens: result.tokenUsage.total,
      model: provider.model,
    });
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    result.passed = false;
    result.durationMs = Date.now() - startTime;
  }

  return result;
}
