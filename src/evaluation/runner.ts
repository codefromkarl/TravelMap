/**
 * 评估运行器 — 整合所有评估组件
 *
 * 功能：
 *   - 运行多维度评估
 *   - 检测回归
 *   - 归因分析
 *   - 自动优化（可选）
 *   - 生成报告
 *
 * 使用方式：
 *   const runner = new EvalRunner();
 *   const result = await runner.run(input, output, context);
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { AttributionAnalyzer, type AttributionResult } from "./attribution-analyzer.js";
import { BaselineManager, type Regression } from "./baseline-manager.js";
import type {
  DimensionResult,
  EvalContext,
  EvalDimension,
  EvalReport,
  EvaluationCompleteness,
} from "./dimensions.js";
import { EVAL_DIMENSIONS, hasCompleteEvaluation, hasDimensionEvidence } from "./dimensions.js";

// ─── 运行器配置 ─────────────────────────────────────────────

export interface RunnerConfig {
  /** 项目根目录 */
  projectRoot: string;
  /** 是否启用 LLM 评估 */
  enableLLM: boolean;
  /** 是否检测回归 */
  detectRegression: boolean;
  /** 是否生成归因报告 */
  generateAttribution: boolean;
  /** 输出目录 */
  outputDir: string;
  /** 模型信息 */
  modelInfo?: {
    provider: string;
    model: string;
  };
}

const DEFAULT_CONFIG: RunnerConfig = {
  projectRoot: process.cwd(),
  enableLLM: true,
  detectRegression: true,
  generateAttribution: true,
  outputDir: "eval-results",
};

// ─── 运行结果 ──────────────────────────────────────────────

export interface RunResult {
  /** 评估报告 */
  report: EvalReport;
  /** 回归检测 */
  regressions: Regression[];
  /** 归因分析 */
  attribution?: AttributionResult;
  /** 报告文件路径 */
  reportPath: string;
}

// ─── 批量运行结果 ──────────────────────────────────────────

export interface BatchRunResult {
  /** 运行 ID */
  runId: string;
  /** 时间戳 */
  timestamp: string;
  /** 各场景报告 */
  reports: EvalReport[];
  /** 综合得分 */
  overallScore: number;
  /** 通过率 */
  passRate: number;
  /** All scenarios have complete assessment evidence. */
  complete: boolean;
  /** 是否通过 */
  passed: boolean;
  /** 回归检测 */
  regressions: Regression[];
  /** 归因分析 */
  attributions: AttributionResult[];
  /** 报告目录 */
  reportDir: string;
}

// ─── 评估运行器 ─────────────────────────────────────────────

export class EvalRunner {
  private config: RunnerConfig;
  private baselineManager: BaselineManager;
  private analyzer: AttributionAnalyzer;

  constructor(config: Partial<RunnerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.baselineManager = new BaselineManager(this.config.projectRoot);
    this.analyzer = new AttributionAnalyzer();

    // 确保输出目录存在
    const outputDir = path.resolve(this.config.projectRoot, this.config.outputDir);
    fs.mkdirSync(outputDir, { recursive: true });
  }

  /**
   * 运行单个场景评估
   */
  async run(
    input: string,
    output: string,
    context?: EvalContext,
    metadata?: EvalReport["metadata"],
  ): Promise<RunResult> {
    const startTime = Date.now();
    const reportId = `eval-${randomUUID().slice(0, 8)}`;

    // 运行各维度评估
    const dimensions: DimensionResult[] = [];
    for (const dim of EVAL_DIMENSIONS) {
      // 如果禁用 LLM，跳过需要 LLM 的维度
      if (!this.config.enableLLM && this.requiresLLM(dim)) {
        dimensions.push({
          dimensionId: dim.id,
          status: "skipped",
          score: 0,
          passed: false,
          checks: [],
          failureReason: "LLM 评估已禁用",
          errorCode: "LLM_DISABLED",
        });
        continue;
      }

      try {
        const result = await dim.evaluator(input, output, context);
        const declaredStatus = result.status ?? "evaluated";
        const status =
          declaredStatus === "evaluated" &&
          Array.isArray(result.checks) &&
          !hasDimensionEvidence(result)
            ? "skipped"
            : declaredStatus;
        const finiteScore = (score: number) => Number.isFinite(score) && score >= 0 && score <= 1;
        if (
          result.dimensionId !== dim.id ||
          !["evaluated", "skipped", "error"].includes(status) ||
          !Array.isArray(result.checks) ||
          !finiteScore(result.score) ||
          typeof result.passed !== "boolean" ||
          (status === "evaluated" &&
            (result.checks.length === 0 ||
              result.checks.some(
                (check) =>
                  !check ||
                  typeof check.name !== "string" ||
                  typeof check.detail !== "string" ||
                  typeof check.passed !== "boolean" ||
                  !finiteScore(check.score),
              )))
        ) {
          dimensions.push({
            dimensionId: dim.id,
            status: "error",
            score: 0,
            passed: false,
            checks: [],
            errorCode: "INVALID_EVALUATOR_RESULT",
            failureReason: "评估结果无效",
          });
        } else {
          dimensions.push({ ...result, status, passed: status === "evaluated" && result.passed });
        }
      } catch {
        // Provider exceptions can contain prompts or credentials; keep only a stable failure code.
        dimensions.push({
          dimensionId: dim.id,
          status: "error",
          score: 0,
          passed: false,
          checks: [],
          errorCode: "EVALUATOR_ERROR",
          failureReason: "评估异常",
        });
      }
    }

    // 计算综合得分
    const overallScore = this.calculateOverallScore(dimensions);
    const completeness = this.completeness(dimensions);
    const passed = completeness.complete && this.checkPassed(dimensions);

    // 构建报告
    const report: EvalReport = {
      id: reportId,
      timestamp: new Date().toISOString(),
      input,
      output,
      overallScore,
      completeness,
      passed,
      dimensions,
      failedRequired: this.getFailedRequired(dimensions),
      allSuggestions: this.collectSuggestions(dimensions),
      metadata: {
        model: metadata?.model ?? this.config.modelInfo?.model ?? "unknown",
        provider: metadata?.provider ?? this.config.modelInfo?.provider ?? "unknown",
        duration: Date.now() - startTime,
        tokenUsage: metadata?.tokenUsage,
      },
    };

    // 回归检测
    let regressions: Regression[] = [];
    if (this.config.detectRegression && completeness.complete) {
      regressions = this.baselineManager.detectRegressions([report]);
    }

    // 归因分析
    let attribution: AttributionResult | undefined;
    if (this.config.generateAttribution && !passed && completeness.complete) {
      attribution = this.analyzer.analyzeReport(report);
    }

    // 保存报告
    const reportPath = this.saveReport(report);

    return {
      report,
      regressions,
      attribution,
      reportPath,
    };
  }

  /**
   * 批量运行评估
   */
  async runBatch(
    scenarios: Array<{
      id: string;
      input: string;
      output: string;
      context?: EvalContext;
    }>,
    metadata?: EvalReport["metadata"],
  ): Promise<BatchRunResult> {
    const runId = `batch-${randomUUID().slice(0, 8)}`;
    const timestamp = new Date().toISOString();
    const reports: EvalReport[] = [];
    const attributions: AttributionResult[] = [];

    // 运行每个场景
    for (const scenario of scenarios) {
      const result = await this.run(scenario.input, scenario.output, scenario.context, metadata);
      reports.push(result.report);

      if (result.attribution) {
        attributions.push(result.attribution);
      }
    }

    // 计算综合指标
    const scoredReports = reports.filter(
      (report) => (report.completeness?.evaluatedWeight ?? 1) > 0,
    );
    const overallScore = scoredReports.length
      ? scoredReports.reduce((sum, r) => sum + r.overallScore, 0) / scoredReports.length
      : 0;
    const passedCount = reports.filter((r) => r.passed).length;
    const passRate = reports.length ? passedCount / reports.length : 0;
    const complete = reports.length > 0 && reports.every((report) => report.completeness?.complete);
    const passed = complete && passRate >= 0.8;

    // 检测回归
    const regressions = this.config.detectRegression
      ? this.baselineManager.detectRegressions(
          reports.filter((report) => report.completeness?.complete),
        )
      : [];

    // 保存批量结果
    const reportDir = path.resolve(
      this.config.projectRoot,
      this.config.outputDir,
      `batch-${runId}`,
    );
    fs.mkdirSync(reportDir, { recursive: true });

    // 保存汇总报告
    const summaryPath = path.join(reportDir, "summary.json");
    fs.writeFileSync(
      summaryPath,
      JSON.stringify(
        {
          runId,
          timestamp,
          overallScore,
          passRate,
          passed,
          complete,
          scenarioCount: scenarios.length,
          passedCount,
          failedCount: scenarios.length - passedCount,
          regressions: regressions.length,
        },
        null,
        2,
      ),
    );

    return {
      runId,
      timestamp,
      reports,
      overallScore,
      passRate,
      passed,
      complete,
      regressions,
      attributions,
      reportDir,
    };
  }

  /**
   * 更新基线
   */
  updateBaseline(reports: EvalReport[], description?: string): void {
    if (reports.length === 0 || reports.some((report) => !hasCompleteEvaluation(report))) {
      throw new Error("Incomplete assessments cannot become evaluation baselines");
    }
    this.baselineManager.createBaseline(reports, description);
  }

  /**
   * 获取趋势数据
   */
  getTrends(scenarioId?: string) {
    return this.baselineManager.getTrends(scenarioId);
  }

  /**
   * 获取分数统计
   */
  getScoreStats(scenarioId?: string) {
    return this.baselineManager.getScoreStats(scenarioId);
  }

  // ─── 内部方法 ──────────────────────────────────────────

  private completeness(dimensions: DimensionResult[]): EvaluationCompleteness {
    const evaluated = dimensions
      .filter((result) => result.status === "evaluated")
      .map((result) => result.dimensionId);
    const skipped = dimensions
      .filter((result) => result.status === "skipped")
      .map((result) => result.dimensionId);
    const errors = dimensions
      .filter((result) => result.status === "error")
      .map((result) => result.dimensionId);
    return {
      complete: evaluated.length === EVAL_DIMENSIONS.length,
      evaluated,
      skipped,
      errors,
      evaluatedWeight: EVAL_DIMENSIONS.filter((dim) => evaluated.includes(dim.id)).reduce(
        (sum, dim) => sum + dim.weight,
        0,
      ),
      totalWeight: EVAL_DIMENSIONS.reduce((sum, dim) => sum + dim.weight, 0),
    };
  }

  /** Available evidence only; a zero with evaluatedWeight=0 means no score is available. */
  private calculateOverallScore(dimensions: DimensionResult[]): number {
    let totalWeight = 0;
    let weightedSum = 0;
    for (const dim of dimensions) {
      if (dim.status !== "evaluated") continue;
      const dimensionDef = EVAL_DIMENSIONS.find((d) => d.id === dim.dimensionId);
      if (dimensionDef) {
        totalWeight += dimensionDef.weight;
        weightedSum += dim.score * dimensionDef.weight;
      }
    }
    return totalWeight ? weightedSum / totalWeight : 0;
  }

  private checkPassed(dimensions: DimensionResult[]): boolean {
    const requiredDims = EVAL_DIMENSIONS.filter((d) => d.required);

    for (const reqDim of requiredDims) {
      const result = dimensions.find((d) => d.dimensionId === reqDim.id);
      if (!result || !result.passed) {
        return false;
      }
    }

    return true;
  }

  private getFailedRequired(dimensions: DimensionResult[]): string[] {
    const requiredDims = EVAL_DIMENSIONS.filter((d) => d.required);
    const failed: string[] = [];

    for (const reqDim of requiredDims) {
      const result = dimensions.find((d) => d.dimensionId === reqDim.id);
      if (!result || !result.passed) {
        failed.push(reqDim.id);
      }
    }

    return failed;
  }

  private collectSuggestions(dimensions: DimensionResult[]): string[] {
    const suggestions: string[] = [];

    for (const dim of dimensions) {
      if (dim.suggestions) {
        suggestions.push(...dim.suggestions);
      }
    }

    return [...new Set(suggestions)];
  }

  private requiresLLM(dim: EvalDimension): boolean {
    return dim.category === "semantic";
  }

  private saveReport(report: EvalReport): string {
    const reportDir = path.resolve(this.config.projectRoot, this.config.outputDir);
    const reportPath = path.join(reportDir, `eval-${report.id}.json`);

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    return reportPath;
  }
}
