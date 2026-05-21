/**
 * 归因分析器 — 分析评估失败的根本原因
 *
 * 功能：
 *   - 分析失败的维度和检查项
 *   - 识别退化模式
 *   - 生成可操作的改进建议
 *
 * 设计原则：
 *   - 基于规则和模式匹配，不依赖 LLM（确定性）
 *   - 提供具体的证据和建议
 *   - 支持自动优化的输入
 */

import type { Regression } from "./baseline-manager.js";
import type { CheckResult, DimensionResult, EvalReport } from "./dimensions.js";

// ─── 归因结果类型 ──────────────────────────────────────────

export interface AttributionResult {
  /** 归因 ID */
  id: string;
  /** 时间戳 */
  timestamp: string;
  /** 场景 ID */
  scenarioId: string;
  /** 失败原因分类 */
  failureCategories: FailureCategory[];
  /** 根本原因 */
  rootCauses: RootCause[];
  /** 改进建议 */
  recommendations: Recommendation[];
  /** 优先级排序 */
  priorityActions: PriorityAction[];
}

export interface FailureCategory {
  /** 类别 ID */
  id: string;
  /** 类别名称 */
  name: string;
  /** 影响的维度 */
  affectedDimensions: string[];
  /** 影响的检查项 */
  affectedChecks: string[];
  /** 严重程度 */
  severity: "low" | "medium" | "high" | "critical";
}

export interface RootCause {
  /** 原因 ID */
  id: string;
  /** 原因描述 */
  description: string;
  /** 证据 */
  evidence: string[];
  /** 影响范围 */
  impact: string;
  /** 修复难度 */
  difficulty: "easy" | "medium" | "hard";
}

export interface Recommendation {
  /** 建议 ID */
  id: string;
  /** 建议类型 */
  type: "prompt" | "parameter" | "workflow";
  /** 建议描述 */
  description: string;
  /** 具体操作 */
  action: string;
  /** 预期效果 */
  expectedEffect: string;
  /** 优先级 */
  priority: number;
}

export interface PriorityAction {
  /** 行动 ID */
  id: string;
  /** 行动描述 */
  description: string;
  /** 目标维度 */
  targetDimension: string;
  /** 预期改进 */
  expectedImprovement: number;
  /** 实施步骤 */
  steps: string[];
}

// ─── 归因分析器 ─────────────────────────────────────────────

export class AttributionAnalyzer {
  /**
   * 分析单个报告的失败原因
   */
  analyzeReport(report: EvalReport): AttributionResult {
    const failureCategories = this.categorizeFailures(report);
    const rootCauses = this.identifyRootCauses(report, failureCategories);
    const recommendations = this.generateRecommendations(rootCauses, report);
    const priorityActions = this.prioritizeActions(recommendations, report);

    return {
      id: `attr-${report.id}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      scenarioId: report.id,
      failureCategories,
      rootCauses,
      recommendations,
      priorityActions,
    };
  }

  /**
   * 分析回归原因
   */
  analyzeRegression(report: EvalReport, regressions: Regression[]): AttributionResult {
    const failureCategories = this.categorizeRegressions(regressions);
    const rootCauses = this.identifyRegressionRootCauses(report, regressions);
    const recommendations = this.generateRegressionRecommendations(rootCauses, regressions);
    const priorityActions = this.prioritizeActions(recommendations, report);

    return {
      id: `regression-${report.id}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      scenarioId: report.id,
      failureCategories,
      rootCauses,
      recommendations,
      priorityActions,
    };
  }

  /**
   * 批量分析多个报告，识别共同问题
   */
  analyzeBatch(reports: EvalReport[]): {
    commonIssues: string[];
    recommendations: Recommendation[];
    summary: string;
  } {
    const allFailures: Map<string, number> = new Map();
    const allRecommendations: Recommendation[] = [];

    for (const report of reports) {
      const result = this.analyzeReport(report);

      for (const category of result.failureCategories) {
        const count = allFailures.get(category.name) ?? 0;
        allFailures.set(category.name, count + 1);
      }

      allRecommendations.push(...result.recommendations);
    }

    // 识别共同问题（出现频率 > 50%）
    const threshold = reports.length * 0.5;
    const commonIssues = [...allFailures.entries()]
      .filter(([_, count]) => count >= threshold)
      .map(([name, count]) => `${name} (${count}/${reports.length} 场景)`);

    // 去重和排序建议
    const uniqueRecommendations = this.deduplicateRecommendations(allRecommendations);
    const sortedRecommendations = uniqueRecommendations.sort((a, b) => b.priority - a.priority);

    // 生成摘要
    const passedCount = reports.filter((r) => r.passed).length;
    const summary = `
评估摘要：
- 通过率：${passedCount}/${reports.length} (${Math.round((passedCount / reports.length) * 100)}%)
- 共同问题：${commonIssues.length > 0 ? commonIssues.join("、") : "无"}
- 主要建议：${sortedRecommendations
      .slice(0, 3)
      .map((r) => r.description)
      .join("；")}
    `.trim();

    return {
      commonIssues,
      recommendations: sortedRecommendations.slice(0, 10),
      summary,
    };
  }

  // ─── 内部方法 ──────────────────────────────────────────

  private categorizeFailures(report: EvalReport): FailureCategory[] {
    const categories: FailureCategory[] = [];

    // 按维度分组失败
    const failedByDimension: Map<string, string[]> = new Map();
    for (const dim of report.dimensions) {
      if (!dim.passed) {
        const failedChecks = dim.checks.filter((c) => !c.passed).map((c) => c.name);
        failedByDimension.set(dim.dimensionId, failedChecks);
      }
    }

    // 创建类别
    for (const [dimensionId, checks] of failedByDimension) {
      const severity = this.calculateSeverity(dimensionId, checks.length);
      categories.push({
        id: `cat-${dimensionId}`,
        name: `${this.getDimensionName(dimensionId)}失败`,
        affectedDimensions: [dimensionId],
        affectedChecks: checks,
        severity,
      });
    }

    return categories;
  }

  private categorizeRegressions(regressions: Regression[]): FailureCategory[] {
    const categories: FailureCategory[] = [];
    const byDimension: Map<string, Regression[]> = new Map();

    for (const reg of regressions) {
      const dim = reg.dimensionId ?? "overall";
      if (!byDimension.has(dim)) {
        byDimension.set(dim, []);
      }
      byDimension.get(dim)!.push(reg);
    }

    for (const [dim, regs] of byDimension) {
      const maxDegradation = Math.max(...regs.map((r) => r.degradation));
      categories.push({
        id: `regression-${dim}`,
        name: `${this.getDimensionName(dim)}退化`,
        affectedDimensions: [dim],
        affectedChecks: regs.map((r) => r.scenarioId),
        severity: maxDegradation > 0.25 ? "critical" : maxDegradation > 0.15 ? "high" : "medium",
      });
    }

    return categories;
  }

  private identifyRootCauses(report: EvalReport, categories: FailureCategory[]): RootCause[] {
    const causes: RootCause[] = [];

    for (const category of categories) {
      for (const dimId of category.affectedDimensions) {
        const dim = report.dimensions.find((d) => d.dimensionId === dimId);
        if (!dim) continue;

        // 分析每个失败的检查项
        for (const check of dim.checks) {
          if (check.passed) continue;

          const cause = this.inferRootCause(dimId, check);
          if (cause) {
            causes.push(cause);
          }
        }
      }
    }

    return causes;
  }

  private identifyRegressionRootCauses(report: EvalReport, regressions: Regression[]): RootCause[] {
    const causes: RootCause[] = [];

    for (const reg of regressions) {
      causes.push({
        id: `cause-regression-${reg.scenarioId}-${reg.dimensionId ?? "overall"}`,
        description: `${reg.dimensionId ? this.getDimensionName(reg.dimensionId) : "总体"}得分从 ${reg.baselineScore.toFixed(2)} 退化到 ${reg.currentScore.toFixed(2)}`,
        evidence: [`退化幅度: ${(reg.degradation * 100).toFixed(1)}%`],
        impact: reg.severity === "error" ? "严重退化，需要立即修复" : "轻微退化，建议关注",
        difficulty: reg.degradation > 0.25 ? "hard" : "medium",
      });
    }

    return causes;
  }

  private inferRootCause(dimensionId: string, check: CheckResult): RootCause | null {
    // 基于检查名称推断根本原因
    const causeMap: Record<string, RootCause> = {
      "必填字段: 目的地": {
        id: "cause-missing-destination",
        description: "输出缺少目的地信息",
        evidence: [check.detail],
        impact: "用户无法知道行程覆盖哪个城市",
        difficulty: "easy",
      },
      "必填字段: 日期/天数": {
        id: "cause-missing-date",
        description: "输出缺少日期或天数信息",
        evidence: [check.detail],
        impact: "用户无法知道行程时间安排",
        difficulty: "easy",
      },
      "必填字段: 景点": {
        id: "cause-missing-attractions",
        description: "输出缺少景点推荐",
        evidence: [check.detail],
        impact: "行程缺少核心内容",
        difficulty: "easy",
      },
      天数连续性: {
        id: "cause-day-discontinuity",
        description: "天数编号不连续",
        evidence: [check.detail],
        impact: "用户可能误解行程天数",
        difficulty: "easy",
      },
      预算匹配: {
        id: "cause-budget-mismatch",
        description: "预算超出用户要求",
        evidence: [check.evidence ?? check.detail],
        impact: "行程不符合用户预算约束",
        difficulty: "medium",
      },
      老人适配: {
        id: "cause-elderly-unsuitable",
        description: "行程不适合老人",
        evidence: [check.detail],
        impact: "老人可能无法完成行程",
        difficulty: "medium",
      },
      儿童适配: {
        id: "cause-child-unsuitable",
        description: "行程不适合儿童",
        evidence: [check.detail],
        impact: "儿童可能感到无聊或不安全",
        difficulty: "medium",
      },
      违法内容: {
        id: "cause-illegal-content",
        description: "输出包含违法内容建议",
        evidence: [check.evidence ?? check.detail],
        impact: "严重安全问题",
        difficulty: "easy",
      },
    };

    // 精确匹配
    if (causeMap[check.name]) {
      return causeMap[check.name]!;
    }

    // 模糊匹配
    for (const [pattern, cause] of Object.entries(causeMap)) {
      if (check.name.includes(pattern)) {
        return cause;
      }
    }

    // 默认原因
    return {
      id: `cause-${dimensionId}-${check.name.replace(/\s+/g, "-")}`,
      description: `${check.name} 未通过`,
      evidence: [check.detail],
      impact: "影响整体评分",
      difficulty: "medium",
    };
  }

  private generateRecommendations(rootCauses: RootCause[], report: EvalReport): Recommendation[] {
    const recommendations: Recommendation[] = [];
    let priority = 100;

    for (const cause of rootCauses) {
      const rec = this.causeToRecommendation(cause, priority--);
      if (rec) {
        recommendations.push(rec);
      }
    }

    return recommendations;
  }

  private generateRegressionRecommendations(
    rootCauses: RootCause[],
    regressions: Regression[],
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];
    let priority = 100;

    for (const reg of regressions) {
      if (reg.severity === "error") {
        recommendations.push({
          id: `rec-regression-${reg.scenarioId}`,
          type: "prompt",
          description: `修复 ${reg.dimensionId ? this.getDimensionName(reg.dimensionId) : "总体"} 退化`,
          action: `检查最近的 prompt 或参数变更，回滚或调整`,
          expectedEffect: `恢复到基线水平 (${reg.baselineScore.toFixed(2)})`,
          priority: priority--,
        });
      }
    }

    return recommendations;
  }

  private causeToRecommendation(cause: RootCause, priority: number): Recommendation | null {
    const recommendationMap: Record<string, Recommendation> = {
      "cause-missing-destination": {
        id: "rec-add-destination",
        type: "prompt",
        description: "在输出中添加目的地信息",
        action: "在 prompt 中明确要求输出目的地城市",
        expectedEffect: "结构完整性提升",
        priority,
      },
      "cause-missing-date": {
        id: "rec-add-date",
        type: "prompt",
        description: "在输出中添加日期信息",
        action: "在 prompt 中明确要求输出日期或天数",
        expectedEffect: "结构完整性提升",
        priority,
      },
      "cause-budget-mismatch": {
        id: "rec-fix-budget",
        type: "prompt",
        description: "调整行程以符合预算",
        action: "在 prompt 中强调预算约束，或调整推荐的住宿/餐饮档次",
        expectedEffect: "预算合理性提升",
        priority,
      },
      "cause-elderly-unsuitable": {
        id: "rec-elderly-friendly",
        type: "prompt",
        description: "为老人优化行程",
        action: "在 prompt 中添加人群适配指令，避免高强度活动",
        expectedEffect: "人群适配性提升",
        priority,
      },
      "cause-illegal-content": {
        id: "rec-remove-illegal",
        type: "prompt",
        description: "移除违法内容",
        action: "在 prompt 中明确禁止推荐违法活动",
        expectedEffect: "安全性提升",
        priority,
      },
    };

    return (
      recommendationMap[cause.id] ?? {
        id: `rec-${cause.id}`,
        type: "prompt",
        description: cause.description,
        action: `修复: ${cause.description}`,
        expectedEffect: "改善评估结果",
        priority,
      }
    );
  }

  private prioritizeActions(
    recommendations: Recommendation[],
    report: EvalReport,
  ): PriorityAction[] {
    const actions: PriorityAction[] = [];

    // 按优先级排序
    const sorted = [...recommendations].sort((a, b) => b.priority - a.priority);

    for (const rec of sorted.slice(0, 5)) {
      actions.push({
        id: `action-${rec.id}`,
        description: rec.description,
        targetDimension: this.inferDimensionFromRecommendation(rec),
        expectedImprovement: 0.1, // 估计改进幅度
        steps: [rec.action],
      });
    }

    return actions;
  }

  // ─── 辅助方法 ──────────────────────────────────────────

  private calculateSeverity(dimensionId: string, failedCount: number): FailureCategory["severity"] {
    // 安全维度失败是严重问题
    if (dimensionId === "safety") return "critical";
    // 多项检查失败
    if (failedCount >= 3) return "high";
    if (failedCount >= 2) return "medium";
    return "low";
  }

  private getDimensionName(dimensionId: string): string {
    const nameMap: Record<string, string> = {
      structure: "结构",
      semantic: "语义",
      practical: "实用性",
      safety: "安全性",
      overall: "总体",
    };
    return nameMap[dimensionId] ?? dimensionId;
  }

  private inferDimensionFromRecommendation(rec: Recommendation): string {
    if (rec.description.includes("结构")) return "structure";
    if (rec.description.includes("预算")) return "practical";
    if (rec.description.includes("老人") || rec.description.includes("儿童")) return "safety";
    return "overall";
  }

  private deduplicateRecommendations(recs: Recommendation[]): Recommendation[] {
    const seen = new Set<string>();
    return recs.filter((rec) => {
      if (seen.has(rec.id)) return false;
      seen.add(rec.id);
      return true;
    });
  }
}
