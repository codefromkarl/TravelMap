/**
 * 费用追踪服务 — 记录每次 LLM 调用的 token 消耗和费用
 *
 * 模型定价（美元，per 1M tokens）:
 *   gpt-4o-mini:     input $0.15  output $0.60
 *   gpt-4o:          input $2.50  output $10.00
 *   claude-sonnet-4:  input $3.00  output $15.00
 *   claude-haiku:     input $0.80  output $4.00
 *   deepseek-v3:      input $0.27  output $1.10
 */

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: string;
  phase: "tool_call" | "planning" | "general";
  timestamp: number;
}

export interface CostSummary {
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  breakdownByModel: Record<
    string,
    { cost: number; calls: number; inputTokens: number; outputTokens: number }
  >;
  breakdownByPhase: Record<string, { cost: number; calls: number }>;
  calls: number;
}

// ─── 模型定价表 ──────────────────────────────────────────────

const MODEL_PRICING: Record<string, ModelPricing> = {
  "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10.0 },
  "gpt-4.1-mini": { inputPerMillion: 0.4, outputPerMillion: 1.6 },
  "gpt-4.1": { inputPerMillion: 2.0, outputPerMillion: 8.0 },
  "claude-sonnet-4": { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  "claude-haiku": { inputPerMillion: 0.8, outputPerMillion: 4.0 },
  "deepseek-chat": { inputPerMillion: 0.27, outputPerMillion: 1.1 },
  "gemini-2.0-flash": { inputPerMillion: 0.1, outputPerMillion: 0.4 },
};

/** 获取模型定价，未知模型使用 gpt-4o-mini 作为默认 */
function getPricing(model: string): ModelPricing {
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (model.includes(key) || key.includes(model)) return pricing;
  }
  return MODEL_PRICING["gpt-4o-mini"];
}

/** 计算单次调用费用（美元） */
function calcCost(usage: TokenUsage): number {
  const pricing = getPricing(usage.model);
  const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputPerMillion;
  return inputCost + outputCost;
}

// ─── CostTracker ─────────────────────────────────────────────

export class CostTracker {
  private usages: TokenUsage[] = [];

  /** 记录一次 LLM 调用 */
  record(usage: Omit<TokenUsage, "timestamp">): void {
    this.usages.push({ ...usage, timestamp: Date.now() });
  }

  /** 获取费用汇总 */
  getSummary(): CostSummary {
    let totalCost = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const breakdownByModel: CostSummary["breakdownByModel"] = {};
    const breakdownByPhase: CostSummary["breakdownByPhase"] = {};

    for (const usage of this.usages) {
      const cost = calcCost(usage);
      totalCost += cost;
      totalInputTokens += usage.inputTokens;
      totalOutputTokens += usage.outputTokens;

      // 按模型统计
      const modelKey = usage.model;
      if (!breakdownByModel[modelKey]) {
        breakdownByModel[modelKey] = { cost: 0, calls: 0, inputTokens: 0, outputTokens: 0 };
      }
      breakdownByModel[modelKey].cost += cost;
      breakdownByModel[modelKey].calls += 1;
      breakdownByModel[modelKey].inputTokens += usage.inputTokens;
      breakdownByModel[modelKey].outputTokens += usage.outputTokens;

      // 按阶段统计
      const phaseKey = usage.phase;
      if (!breakdownByPhase[phaseKey]) {
        breakdownByPhase[phaseKey] = { cost: 0, calls: 0 };
      }
      breakdownByPhase[phaseKey].cost += cost;
      breakdownByPhase[phaseKey].calls += 1;
    }

    return {
      totalCost,
      totalInputTokens,
      totalOutputTokens,
      breakdownByModel,
      breakdownByPhase,
      calls: this.usages.length,
    };
  }

  /** 格式化为可读文本 */
  getFormattedSummary(): string {
    const summary = this.getSummary();
    const lines = [
      "## 💲 本次规划费用统计",
      "",
      `总计: $${summary.totalCost.toFixed(4)} (${summary.calls} 次调用)`,
      `Tokens: 输入 ${summary.totalInputTokens.toLocaleString()} / 输出 ${summary.totalOutputTokens.toLocaleString()}`,
      "",
    ];

    if (Object.keys(summary.breakdownByModel).length > 0) {
      lines.push("### 按模型");
      for (const [model, data] of Object.entries(summary.breakdownByModel)) {
        lines.push(
          `- **${model}**: $${data.cost.toFixed(4)} (${data.calls}次, ${data.inputTokens.toLocaleString()}in/${data.outputTokens.toLocaleString()}out)`,
        );
      }
      lines.push("");
    }

    if (Object.keys(summary.breakdownByPhase).length > 0) {
      lines.push("### 按阶段");
      for (const [phase, data] of Object.entries(summary.breakdownByPhase)) {
        lines.push(`- **${phase}**: $${data.cost.toFixed(4)} (${data.calls}次)`);
      }
    }

    return lines.join("\n");
  }

  /** 清除记录 */
  reset(): void {
    this.usages = [];
  }
}

// ─── 模型 Handoff 配置 ────────────────────────────────────────

export interface HandoffConfig {
  /** 工具调用阶段使用的便宜模型 */
  cheapModel: { provider: string; model: string };
  /** 规划/编排阶段使用的强模型 */
  strongModel: { provider: string; model: string };
}

/** 默认配置 */
export const DEFAULT_HANDOFF_CONFIG: HandoffConfig = {
  cheapModel: { provider: "openai", model: "gpt-4o-mini" },
  strongModel: { provider: "anthropic", model: "claude-sonnet-4" },
};

/** Tool 成本层级元数据 — 定义在 Tool 侧，而非硬编码列表 */
export type CostTier = "cheap" | "strong";

/** 全局 Tool 元数据注册表 */
const toolMetadata = new Map<string, { costTier: CostTier }>();

/** 注册 Tool 元数据（由 createTools 调用） */
export function registerToolMetadata(name: string, tier: CostTier): void {
  toolMetadata.set(name, { costTier: tier });
}

/** 判断工具名是否属于 "便宜" 层级（应使用便宜模型） */
export function isToolCallTool(toolName: string): boolean {
  return toolMetadata.get(toolName)?.costTier === "cheap";
}

/** 全局费用追踪器实例 */
let globalTracker: CostTracker | null = null;

/** 获取全局费用追踪器 */
export function getCostTracker(): CostTracker {
  if (!globalTracker) {
    globalTracker = new CostTracker();
  }
  return globalTracker;
}
