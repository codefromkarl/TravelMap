/**
 * AI E2E 条件执行框架
 *
 * 提供：
 *   - describeAiE2e: 条件执行（需要 API Key + AI_E2E=true）
 *   - Token 使用追踪和报告
 *   - Provider 自动发现
 */

import { afterAll, describe } from "vitest";

// ─── Provider 自动发现 ─────────────────────────────────────

export interface DiscoveredProvider {
  provider: string;
  model: string;
  hasKey: boolean;
  /** 本地 Docker 模式（使用 llm-client 直连） */
  localMode: boolean;
}

/**
 * 自动发现可用的 LLM provider
 *
 * 优先级：
 *   1. OPENAI_BASE_URL + OPENAI_API_KEY → 本地 Docker 模式（cliproxyapi/ds2api）
 *   2. DEEPSEEK_API_KEY → DeepSeek 直连
 *   3. OPENAI_API_KEY → OpenAI 直连
 *   4. ANTHROPIC_API_KEY → Anthropic 直连
 */
export function discoverProvider(): DiscoveredProvider {
  const judgeProvider = process.env.JUDGE_MODEL_PROVIDER;
  const judgeModel = process.env.JUDGE_MODEL_ID;

  // 1. 本地 Docker 模式
  const baseUrl = process.env.OPENAI_BASE_URL;
  const apiKey = process.env.OPENAI_API_KEY;
  const localModel = process.env.AI_MODEL;
  if (baseUrl && apiKey) {
    return {
      provider: judgeProvider ?? "openai",
      model: judgeModel ?? localModel ?? "ds",
      hasKey: true,
      localMode: true,
    };
  }

  // 2-4. 云端 Provider
  const cloudProviders: Array<{ envKey: string; provider: string; defaultModel: string }> = [
    { envKey: "DEEPSEEK_API_KEY", provider: "deepseek", defaultModel: "deepseek-chat" },
    { envKey: "OPENAI_API_KEY", provider: "openai", defaultModel: "gpt-4o" },
    {
      envKey: "ANTHROPIC_API_KEY",
      provider: "anthropic",
      defaultModel: "claude-sonnet-4-20250514",
    },
  ];

  for (const p of cloudProviders) {
    if (process.env[p.envKey]) {
      return {
        provider: judgeProvider ?? p.provider,
        model: judgeModel ?? p.defaultModel,
        hasKey: true,
        localMode: false,
      };
    }
  }

  return { provider: "", model: "", hasKey: false, localMode: false };
}

/**
 * 检查 AI E2E 是否可用
 */
export function isAiE2eAvailable(): boolean {
  return process.env.AI_E2E === "true" && discoverProvider().hasKey;
}

// ─── 条件执行 ──────────────────────────────────────────────

/**
 * 条件执行的 describe 块
 * 仅当 AI_E2E=true 且有可用 API Key 时执行
 */
export function describeAiE2e(name: string, fn: () => void): void {
  const available = isAiE2eAvailable();
  if (!available) {
    describe.skip(`[AI E2E] ${name} (skipped: no API key or AI_E2E not set)`, fn);
    return;
  }
  describe(`[AI E2E] ${name}`, fn);
}

// ─── Token 使用追踪 ────────────────────────────────────────

export interface TokenUsage {
  scenario: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
}

const usageLog: TokenUsage[] = [];

/**
 * 记录 token 使用量
 */
export function reportTokenUsage(usage: TokenUsage): void {
  usageLog.push(usage);
}

/**
 * 获取累计 token 使用报告
 */
export function getTokenReport(): TokenUsage[] {
  return [...usageLog];
}

/**
 * 在所有测试结束后输出 token 报告
 * （在 describeAiE2e 的顶层 afterAll 中调用）
 */
export function setupTokenReport(): void {
  afterAll(async () => {
    if (usageLog.length === 0) return;

    const totalTokens = usageLog.reduce((sum, u) => sum + u.totalTokens, 0);
    console.log("\n=== AI E2E Token Usage Report ===");
    for (const u of usageLog) {
      console.log(
        `  ${u.scenario}: ${u.totalTokens} tokens (prompt: ${u.promptTokens}, completion: ${u.completionTokens}, model: ${u.model})`,
      );
    }
    console.log(`  Total: ${totalTokens} tokens across ${usageLog.length} scenarios`);

    // 写入 JSON 文件
    const fs = await import("node:fs");
    const path = await import("node:path");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reportPath = path.resolve(process.cwd(), "eval-results", `run-${timestamp}.json`);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          totalTokens,
          scenarios: usageLog,
        },
        null,
        2,
      ),
    );
    console.log(`  Report saved to: ${reportPath}`);
  });
}

// Deterministic golden assertion helpers shared by offline tests and provider E2E.
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
