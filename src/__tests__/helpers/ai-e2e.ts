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
