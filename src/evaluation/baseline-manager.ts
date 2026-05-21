/**
 * 基线管理器 — 管理评估基线和历史记录
 *
 * 功能：
 *   - 保存和加载评估基线
 *   - 记录历史评估结果
 *   - 支持版本管理和回滚
 *
 * 设计原则：
 *   - 基线是"黄金标准"，代表可接受的最低质量
 *   - 历史记录用于趋势分析和回归检测
 *   - 所有数据持久化到文件系统
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { EvalReport } from "./dimensions.js";

// ─── 类型定义 ──────────────────────────────────────────────

export interface Baseline {
  /** 基线 ID */
  id: string;
  /** 创建时间 */
  createdAt: string;
  /** 描述 */
  description: string;
  /** 场景基线 */
  scenarios: Record<string, ScenarioBaseline>;
  /** 综合阈值 */
  overallThreshold: number;
  /** 维度阈值 */
  dimensionThresholds: Record<string, number>;
}

export interface ScenarioBaseline {
  /** 场景 ID */
  scenarioId: string;
  /** 期望得分 (0-1) */
  expectedScore: number;
  /** 最低可接受得分 (0-1) */
  minScore: number;
  /** 各维度期望得分 */
  dimensionScores: Record<string, number>;
  /** 期望通过的检查项 */
  expectedChecks: string[];
}

export interface HistoryEntry {
  /** 运行 ID */
  runId: string;
  /** 时间戳 */
  timestamp: string;
  /** 基线 ID */
  baselineId: string;
  /** 评估报告 */
  reports: EvalReport[];
  /** 综合得分 */
  overallScore: number;
  /** 是否通过 */
  passed: boolean;
  /** 回归检测结果 */
  regressions: Regression[];
}

export interface Regression {
  /** 场景 ID */
  scenarioId: string;
  /** 维度 ID */
  dimensionId?: string;
  /** 基线得分 */
  baselineScore: number;
  /** 当前得分 */
  currentScore: number;
  /** 退化幅度 */
  degradation: number;
  /** 严重程度 */
  severity: "warning" | "error";
}

// ─── 基线管理器 ─────────────────────────────────────────────

export class BaselineManager {
  private evalDir: string;
  private baselinePath: string;
  private historyPath: string;

  constructor(projectRoot: string = process.cwd()) {
    this.evalDir = path.join(projectRoot, "eval-results");
    this.baselinePath = path.join(this.evalDir, "baseline.json");
    this.historyPath = path.join(this.evalDir, "history.json");

    // 确保目录存在
    fs.mkdirSync(this.evalDir, { recursive: true });
  }

  // ─── 基线操作 ──────────────────────────────────────────

  /**
   * 加载当前基线
   */
  loadBaseline(): Baseline | null {
    if (!fs.existsSync(this.baselinePath)) {
      return null;
    }
    try {
      const content = fs.readFileSync(this.baselinePath, "utf-8");
      return JSON.parse(content) as Baseline;
    } catch {
      return null;
    }
  }

  /**
   * 保存基线
   */
  saveBaseline(baseline: Baseline): void {
    fs.writeFileSync(this.baselinePath, JSON.stringify(baseline, null, 2));
  }

  /**
   * 从评估报告创建基线
   */
  createBaseline(
    reports: EvalReport[],
    description: string = `Baseline ${new Date().toISOString()}`,
  ): Baseline {
    const scenarios: Record<string, ScenarioBaseline> = {};

    for (const report of reports) {
      const dimensionScores: Record<string, number> = {};
      for (const dim of report.dimensions) {
        dimensionScores[dim.dimensionId] = dim.score;
      }

      scenarios[report.id] = {
        scenarioId: report.id,
        expectedScore: report.overallScore,
        minScore: Math.max(0.5, report.overallScore - 0.1), // 允许10%退化
        dimensionScores,
        expectedChecks: report.dimensions.flatMap((d) =>
          d.checks.filter((c) => c.passed).map((c) => c.name),
        ),
      };
    }

    const baseline: Baseline = {
      id: `baseline-${Date.now()}`,
      createdAt: new Date().toISOString(),
      description,
      scenarios,
      overallThreshold: 0.7,
      dimensionThresholds: {
        structure: 0.7,
        semantic: 0.6,
        practical: 0.5,
        safety: 0.9,
      },
    };

    this.saveBaseline(baseline);
    return baseline;
  }

  // ─── 历史记录操作 ──────────────────────────────────────

  /**
   * 加载历史记录
   */
  loadHistory(): HistoryEntry[] {
    if (!fs.existsSync(this.historyPath)) {
      return [];
    }
    try {
      const content = fs.readFileSync(this.historyPath, "utf-8");
      return JSON.parse(content) as HistoryEntry[];
    } catch {
      return [];
    }
  }

  /**
   * 保存历史记录
   */
  saveHistory(history: HistoryEntry[]): void {
    fs.writeFileSync(this.historyPath, JSON.stringify(history, null, 2));
  }

  /**
   * 添加历史记录
   */
  addHistoryEntry(entry: HistoryEntry): void {
    const history = this.loadHistory();
    history.push(entry);

    // 保留最近100条记录
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }

    this.saveHistory(history);
  }

  /**
   * 获取最近 N 条历史记录
   */
  getRecentHistory(n: number = 10): HistoryEntry[] {
    const history = this.loadHistory();
    return history.slice(-n);
  }

  // ─── 回归检测 ──────────────────────────────────────────

  /**
   * 检测回归
   */
  detectRegressions(reports: EvalReport[]): Regression[] {
    const baseline = this.loadBaseline();
    if (!baseline) {
      return [];
    }

    const regressions: Regression[] = [];

    for (const report of reports) {
      const scenarioBaseline = baseline.scenarios[report.id];
      if (!scenarioBaseline) continue;

      // 检查总体得分
      if (report.overallScore < scenarioBaseline.minScore) {
        regressions.push({
          scenarioId: report.id,
          baselineScore: scenarioBaseline.expectedScore,
          currentScore: report.overallScore,
          degradation: scenarioBaseline.expectedScore - report.overallScore,
          severity: report.overallScore < scenarioBaseline.minScore - 0.1 ? "error" : "warning",
        });
      }

      // 检查各维度得分
      for (const dim of report.dimensions) {
        const expectedDimScore = scenarioBaseline.dimensionScores[dim.dimensionId];
        if (expectedDimScore !== undefined && dim.score < expectedDimScore - 0.15) {
          regressions.push({
            scenarioId: report.id,
            dimensionId: dim.dimensionId,
            baselineScore: expectedDimScore,
            currentScore: dim.score,
            degradation: expectedDimScore - dim.score,
            severity: dim.score < expectedDimScore - 0.25 ? "error" : "warning",
          });
        }
      }
    }

    return regressions;
  }

  // ─── 趋势分析 ──────────────────────────────────────────

  /**
   * 获取趋势数据
   */
  getTrends(scenarioId?: string): TrendData[] {
    const history = this.loadHistory();
    const trends: TrendData[] = [];

    for (const entry of history) {
      const relevantReports = scenarioId
        ? entry.reports.filter((r) => r.id === scenarioId)
        : entry.reports;

      if (relevantReports.length === 0) continue;

      const avgScore =
        relevantReports.reduce((sum, r) => sum + r.overallScore, 0) / relevantReports.length;

      trends.push({
        runId: entry.runId,
        timestamp: entry.timestamp,
        overallScore: avgScore,
        passed: entry.passed,
        regressionCount: entry.regressions.length,
      });
    }

    return trends;
  }

  /**
   * 获取分数统计
   */
  getScoreStats(scenarioId?: string): ScoreStats {
    const trends = this.getTrends(scenarioId);

    if (trends.length === 0) {
      return { min: 0, max: 0, avg: 0, trend: "stable" };
    }

    const scores = trends.map((t) => t.overallScore);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;

    // 计算趋势（最近5次 vs 之前5次）
    let trend: "improving" | "degrading" | "stable" = "stable";
    if (trends.length >= 10) {
      const recent5 = trends.slice(-5).reduce((sum, t) => sum + t.overallScore, 0) / 5;
      const prev5 = trends.slice(-10, -5).reduce((sum, t) => sum + t.overallScore, 0) / 5;
      if (recent5 > prev5 + 0.05) trend = "improving";
      else if (recent5 < prev5 - 0.05) trend = "degrading";
    }

    return { min, max, avg, trend };
  }
}

// ─── 类型定义 ──────────────────────────────────────────────

export interface TrendData {
  runId: string;
  timestamp: string;
  overallScore: number;
  passed: boolean;
  regressionCount: number;
}

export interface ScoreStats {
  min: number;
  max: number;
  avg: number;
  trend: "improving" | "degrading" | "stable";
}
