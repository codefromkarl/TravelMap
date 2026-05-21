/**
 * 优化闭环 — 自动优化直到达到质量要求
 *
 * 功能：
 *   - 根据归因结果自动调整 prompt
 *   - 迭代优化直到满足质量阈值
 *   - 记录优化历史
 *
 * 设计原则：
 *   - 自动化：不需要人工干预
 *   - 可追溯：记录每次优化的原因和效果
 *   - 安全：设置最大迭代次数，避免死循环
 */

import type { AttributionResult, Recommendation } from "./attribution-analyzer.js";
import { AttributionAnalyzer } from "./attribution-analyzer.js";
import { BaselineManager } from "./baseline-manager.js";
import type { EvalReport } from "./dimensions.js";

// ─── 优化配置 ──────────────────────────────────────────────

export interface OptimizationConfig {
  /** 最大迭代次数 */
  maxIterations: number;
  /** 目标通过率 (0-1) */
  targetPassRate: number;
  /** 目标综合得分 (0-1) */
  targetScore: number;
  /** 每次优化的等待时间（毫秒） */
  cooldownMs: number;
  /** 是否启用自动优化 */
  enabled: boolean;
}

const DEFAULT_CONFIG: OptimizationConfig = {
  maxIterations: 5,
  targetPassRate: 1.0,
  targetScore: 0.8,
  cooldownMs: 1000,
  enabled: true,
};

// ─── 优化结果 ──────────────────────────────────────────────

export interface OptimizationResult {
  /** 是否成功达到目标 */
  success: boolean;
  /** 迭代次数 */
  iterations: number;
  /** 初始报告 */
  initialReports: EvalReport[];
  /** 最终报告 */
  finalReports: EvalReport[];
  /** 优化历史 */
  history: OptimizationIteration[];
  /** 失败原因（如果未成功） */
  failureReason?: string;
}

export interface OptimizationIteration {
  /** 迭代编号 */
  iteration: number;
  /** 时间戳 */
  timestamp: string;
  /** 归因结果 */
  attribution: AttributionResult;
  /** 应用的优化 */
  appliedOptimizations: AppliedOptimization[];
  /** 优化后的报告 */
  reportsAfter: EvalReport[];
  /** 改进幅度 */
  improvement: number;
}

export interface AppliedOptimization {
  /** 优化类型 */
  type: "prompt" | "parameter" | "workflow";
  /** 优化描述 */
  description: string;
  /** 具体变更 */
  change: string;
}

// ─── 优化执行器接口 ─────────────────────────────────────────

export interface OptimizationExecutor {
  /**
   * 执行优化
   * @param recommendation 优化建议
   * @param context 上下文（如原始 prompt）
   * @returns 优化后的结果
   */
  execute(
    recommendation: Recommendation,
    context: OptimizationContext,
  ): Promise<OptimizationOutput>;
}

export interface OptimizationContext {
  /** 原始用户输入 */
  originalInput: string;
  /** 原始 prompt */
  originalPrompt?: string;
  /** 场景 ID */
  scenarioId: string;
  /** 历史对话 */
  history?: Array<{ role: string; content: string }>;
}

export interface OptimizationOutput {
  /** 优化后的 prompt */
  optimizedPrompt?: string;
  /** 优化后的参数 */
  optimizedParams?: Record<string, unknown>;
  /** 优化描述 */
  description: string;
}

// ─── 优化闭环 ──────────────────────────────────────────────

export class OptimizationLoop {
  private config: OptimizationConfig;
  private analyzer: AttributionAnalyzer;
  private baselineManager: BaselineManager;
  private executor: OptimizationExecutor;

  constructor(
    executor: OptimizationExecutor,
    config: Partial<OptimizationConfig> = {},
    projectRoot?: string,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.analyzer = new AttributionAnalyzer();
    this.baselineManager = new BaselineManager(projectRoot);
    this.executor = executor;
  }

  /**
   * 运行优化闭环
   *
   * @param evaluateFn 评估函数
   * @param generateFn 生成函数（接受优化后的 prompt）
   * @param context 优化上下文
   * @returns 优化结果
   */
  async run(
    evaluateFn: (prompt: string) => Promise<EvalReport[]>,
    generateFn: (context: OptimizationContext) => Promise<string>,
    context: OptimizationContext,
  ): Promise<OptimizationResult> {
    if (!this.config.enabled) {
      return {
        success: false,
        iterations: 0,
        initialReports: [],
        finalReports: [],
        history: [],
        failureReason: "优化闭环已禁用",
      };
    }

    const history: OptimizationIteration[] = [];
    let currentReports: EvalReport[] = [];
    let currentPrompt = context.originalPrompt ?? "";

    // 初始评估
    const initialPrompt = await generateFn(context);
    currentReports = await evaluateFn(initialPrompt);
    const initialReports = [...currentReports];

    console.log(
      `[OptimizationLoop] 开始优化，初始通过率: ${this.calculatePassRate(currentReports)}`,
    );

    // 迭代优化
    for (let i = 0; i < this.config.maxIterations; i++) {
      const passRate = this.calculatePassRate(currentReports);
      const avgScore = this.calculateAverageScore(currentReports);

      // 检查是否达到目标
      if (passRate >= this.config.targetPassRate && avgScore >= this.config.targetScore) {
        console.log(`[OptimizationLoop] 达到目标，迭代 ${i} 次`);
        return {
          success: true,
          iterations: i,
          initialReports,
          finalReports: currentReports,
          history,
        };
      }

      console.log(
        `[OptimizationLoop] 迭代 ${i + 1}: 通过率=${passRate.toFixed(2)}, 得分=${avgScore.toFixed(2)}`,
      );

      // 归因分析
      const batchResult = this.analyzer.analyzeBatch(currentReports);
      const topRecommendation = batchResult.recommendations[0];

      if (!topRecommendation) {
        return {
          success: false,
          iterations: i,
          initialReports,
          finalReports: currentReports,
          history,
          failureReason: "无法生成优化建议",
        };
      }

      // 执行优化
      const optimization = await this.executor.execute(topRecommendation, context);
      const appliedOptimization: AppliedOptimization = {
        type: topRecommendation.type,
        description: topRecommendation.description,
        change: optimization.description,
      };

      // 应用优化并重新评估
      if (optimization.optimizedPrompt) {
        currentPrompt = optimization.optimizedPrompt;
      }

      // 冷却
      await this.sleep(this.config.cooldownMs);

      // 重新评估
      const newReports = await evaluateFn(currentPrompt);
      const improvement =
        this.calculateAverageScore(newReports) - this.calculateAverageScore(currentReports);

      history.push({
        iteration: i + 1,
        timestamp: new Date().toISOString(),
        attribution: this.analyzer.analyzeBatch(currentReports) as unknown as AttributionResult,
        appliedOptimizations: [appliedOptimization],
        reportsAfter: newReports,
        improvement,
      });

      currentReports = newReports;
    }

    // 达到最大迭代次数
    return {
      success: false,
      iterations: this.config.maxIterations,
      initialReports,
      finalReports: currentReports,
      history,
      failureReason: `达到最大迭代次数 (${this.config.maxIterations})`,
    };
  }

  // ─── 辅助方法 ──────────────────────────────────────────

  private calculatePassRate(reports: EvalReport[]): number {
    if (reports.length === 0) return 0;
    const passed = reports.filter((r) => r.passed).length;
    return passed / reports.length;
  }

  private calculateAverageScore(reports: EvalReport[]): number {
    if (reports.length === 0) return 0;
    const total = reports.reduce((sum, r) => sum + r.overallScore, 0);
    return total / reports.length;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ─── 默认优化执行器 ─────────────────────────────────────────

export class DefaultOptimizationExecutor implements OptimizationExecutor {
  async execute(
    recommendation: Recommendation,
    context: OptimizationContext,
  ): Promise<OptimizationOutput> {
    // 根据建议类型生成优化
    switch (recommendation.type) {
      case "prompt":
        return this.optimizePrompt(recommendation, context);
      case "parameter":
        return this.optimizeParameter(recommendation, context);
      default:
        return {
          description: recommendation.description,
        };
    }
  }

  private optimizePrompt(
    recommendation: Recommendation,
    context: OptimizationContext,
  ): OptimizationOutput {
    const originalPrompt = context.originalPrompt ?? "";
    let optimizedPrompt = originalPrompt;

    // 根据建议添加 prompt 指令
    if (recommendation.description.includes("目的地")) {
      optimizedPrompt += "\n请在输出开头明确标注目的地城市。";
    }
    if (recommendation.description.includes("日期")) {
      optimizedPrompt += "\n请使用 'Day 1', 'Day 2' 格式标注每天的行程。";
    }
    if (recommendation.description.includes("预算")) {
      optimizedPrompt += "\n请确保总费用不超过用户指定的预算。";
    }
    if (recommendation.description.includes("老人")) {
      optimizedPrompt += "\n请考虑同行老人的身体状况，避免高强度活动，安排充足的休息时间。";
    }
    if (recommendation.description.includes("儿童")) {
      optimizedPrompt += "\n请增加适合儿童的活动，如游乐场、动物园等，避免过于枯燥的文化景点。";
    }

    return {
      optimizedPrompt,
      description: `优化 prompt: ${recommendation.description}`,
    };
  }

  private optimizeParameter(
    recommendation: Recommendation,
    _context: OptimizationContext,
  ): OptimizationOutput {
    return {
      optimizedParams: {},
      description: `优化参数: ${recommendation.description}`,
    };
  }
}
