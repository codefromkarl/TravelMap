/**
 * 多维度评估体系 — 独立、无偏见、全面覆盖
 *
 * 评估维度设计原则：
 *   1. 独立性 — 每个维度独立评估，不相互影响
 *   2. 无偏见 — 基于客观标准，不依赖主观判断
 *   3. 全面覆盖 — 从结构、语义、实用性、安全性多角度评估
 */

// ─── 评估维度定义 ──────────────────────────────────────────

export type DimensionCategory = "structure" | "semantic" | "practical" | "safety" | "experience";

export interface EvalDimension {
  /** 维度唯一 ID */
  id: string;
  /** 维度名称 */
  name: string;
  /** 维度类别 */
  category: DimensionCategory;
  /** 权重 (0-1)，所有维度权重之和为 1 */
  weight: number;
  /** 评估函数 */
  evaluator: (input: string, output: string, context?: EvalContext) => Promise<DimensionResult>;
  /** 是否为必须通过的维度（硬约束） */
  required: boolean;
  /** 通过阈值 (0-1) */
  threshold: number;
}

export interface EvalContext {
  /** 用户请求的结构化数据 */
  request?: {
    city: string;
    days: number;
    budget?: number;
    companions?: string;
    keywords?: string[];
  };
  /** 工具调用记录 */
  toolCalls?: Array<{ name: string; args: unknown; result: unknown }>;
  /** 历史对话 */
  history?: Array<{ role: string; content: string }>;
}

export interface DimensionResult {
  /** 维度 ID */
  dimensionId: string;
  /** 得分 (0-1) */
  score: number;
  /** 是否通过 */
  passed: boolean;
  /** 详细评估项 */
  checks: CheckResult[];
  /** 失败原因（如有） */
  failureReason?: string;
  /** 改进建议 */
  suggestions?: string[];
}

export interface CheckResult {
  /** 检查项名称 */
  name: string;
  /** 是否通过 */
  passed: boolean;
  /** 得分 (0-1) */
  score: number;
  /** 详情 */
  detail: string;
  /** 证据（用于归因） */
  evidence?: string;
}

// ─── 评估报告 ──────────────────────────────────────────────

export interface EvalReport {
  /** 报告 ID */
  id: string;
  /** 时间戳 */
  timestamp: string;
  /** 用户输入 */
  input: string;
  /** Agent 输出 */
  output: string;
  /** 综合得分 (0-1) */
  overallScore: number;
  /** 是否通过所有必须维度 */
  passed: boolean;
  /** 各维度结果 */
  dimensions: DimensionResult[];
  /** 失败的必须维度 */
  failedRequired: string[];
  /** 改进建议汇总 */
  allSuggestions: string[];
  /** 元数据 */
  metadata: {
    model: string;
    provider: string;
    duration: number;
    tokenUsage?: { prompt: number; completion: number; total: number };
  };
}

// ─── 维度注册表 ─────────────────────────────────────────────

import { evaluateExperience } from "./dimensions/experience.js";
import { evaluatePractical } from "./dimensions/practical.js";
import { evaluateSafety } from "./dimensions/safety.js";
import { evaluateSemantic } from "./dimensions/semantic.js";
import { evaluateStructure } from "./dimensions/structure.js";

/**
 * 所有评估维度
 *
 * 权重分配：
 *   - 结构完整性 20% — 格式、必填字段、日期连续性
 *   - 语义质量 25% — 合理性、逻辑性、一致性
 *   - 实用性 25% — 可执行性、预算合理性、时间安排
 *   - 安全性 15% — 无危险建议、人群适配、地理安全
 *   - 体验质量 15% — 操作指引、文化适配、个性化匹配
 */
export const EVAL_DIMENSIONS: EvalDimension[] = [
  {
    id: "structure",
    name: "结构完整性",
    category: "structure",
    weight: 0.2,
    evaluator: evaluateStructure,
    required: true,
    threshold: 0.7,
  },
  {
    id: "semantic",
    name: "语义质量",
    category: "semantic",
    weight: 0.25,
    evaluator: evaluateSemantic,
    required: true,
    threshold: 0.6,
  },
  {
    id: "practical",
    name: "实用性",
    category: "practical",
    weight: 0.25,
    evaluator: evaluatePractical,
    required: true,
    threshold: 0.5,
  },
  {
    id: "safety",
    name: "安全性",
    category: "safety",
    weight: 0.15,
    evaluator: evaluateSafety,
    required: true,
    threshold: 0.9,
  },
  {
    id: "experience",
    name: "体验质量",
    category: "experience",
    weight: 0.15,
    evaluator: evaluateExperience,
    required: false,
    threshold: 0.6,
  },
];

/**
 * 获取维度权重总和（用于归一化）
 */
export function getTotalWeight(): number {
  return EVAL_DIMENSIONS.reduce((sum, d) => sum + d.weight, 0);
}

/**
 * 按类别获取维度
 */
export function getDimensionsByCategory(category: DimensionCategory): EvalDimension[] {
  return EVAL_DIMENSIONS.filter((d) => d.category === category);
}

/**
 * 获取必须通过的维度
 */
export function getRequiredDimensions(): EvalDimension[] {
  return EVAL_DIMENSIONS.filter((d) => d.required);
}
