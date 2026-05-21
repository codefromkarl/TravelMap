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
import type { DimensionResult, EvalContext, EvalDimension, EvalReport } from "./dimensions.js";
import { EVAL_DIMENSIONS, getTotalWeight } from "./dimensions.js";

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
          score: 0.5,
          passed: true,
          checks: [
            {
              name: dim.name,
              passed: true,
              score: 0.5,
              detail: "LLM 评估已禁用",
            },
          ],
        });
        continue;
      }

      try {
        const result = await dim.evaluator(input, output, context);
        dimensions.push(result);
      } catch (err) {
        console.warn(`[EvalRunner] 维度 ${dim.id} 评估失败:`, err);
        dimensions.push({
          dimensionId: dim.id,
          score: 0,
          passed: false,
          checks: [
            {
              name: dim.name,
              passed: false,
              score: 0,
              detail: `评估失败: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          failureReason: "评估异常",
        });
      }
    }

    // 计算综合得分
    const overallScore = this.calculateOverallScore(dimensions);
    const passed = this.checkPassed(dimensions);

    // 构建报告
    const report: EvalReport = {
      id: reportId,
      timestamp: new Date().toISOString(),
      input,
      output,
      overallScore,
      passed,
      dimensions,
      failedRequired: this.getFailedRequired(dimensions),
      allSuggestions: this.collectSuggestions(dimensions),
      metadata: {
        model: metadata?.model ?? "unknown",
        provider: metadata?.provider ?? "unknown",
        duration: Date.now() - startTime,
        tokenUsage: metadata?.tokenUsage,
      },
    };

    // 回归检测
    let regressions: Regression[] = [];
    if (this.config.detectRegression) {
      regressions = this.baselineManager.detectRegressions([report]);
    }

    // 归因分析
    let attribution: AttributionResult | undefined;
    if (this.config.generateAttribution && !passed) {
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
    const overallScore = reports.reduce((sum, r) => sum + r.overallScore, 0) / reports.length;
    const passedCount = reports.filter((r) => r.passed).length;
    const passRate = passedCount / reports.length;

    // 检测回归
    const regressions = this.baselineManager.detectRegressions(reports);

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
          passed: passRate >= 0.8,
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
      passed: passRate >= 0.8,
      regressions,
      attributions,
      reportDir,
    };
  }

  /**
   * 更新基线
   */
  updateBaseline(reports: EvalReport[], description?: string): void {
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

  private calculateOverallScore(dimensions: DimensionResult[]): number {
    const totalWeight = getTotalWeight();
    let weightedSum = 0;

    for (const dim of dimensions) {
      const dimensionDef = EVAL_DIMENSIONS.find((d) => d.id === dim.dimensionId);
      if (dimensionDef) {
        weightedSum += dim.score * dimensionDef.weight;
      }
    }

    return weightedSum / totalWeight;
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
