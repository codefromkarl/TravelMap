import { describe, expect, it } from "vitest";
import { AttributionAnalyzer } from "../../../evaluation/attribution-analyzer.js";
import type { Regression } from "../../../evaluation/baseline-manager.js";
import { createMockDimensionResult, createMockEvalReport } from "../../mocks/fixtures.js";

const analyzer = new AttributionAnalyzer();
function reportWithFailures(dimensionId: string, names: string[]) {
  return createMockEvalReport({
    passed: false,
    dimensions: [
      createMockDimensionResult({
        dimensionId,
        passed: false,
        score: 0.2,
        checks: names.map((name) => ({
          name,
          passed: false,
          score: 0,
          detail: `detail:${name}`,
          evidence: `evidence:${name}`,
        })),
      }),
    ],
  });
}

describe("evidence-driven failure attribution", () => {
  it.each([
    ["structure", ["必填字段: 目的地"], "low"],
    ["practical", ["预算匹配", "时间安排"], "medium"],
    ["experience", ["操作指引", "文化适配", "个性化匹配"], "high"],
    ["safety", ["违法内容"], "critical"],
  ])(
    "classifies %s failures without losing the original failing checks",
    (dimension, names, severity) => {
      const result = analyzer.analyzeReport(
        reportWithFailures(dimension as string, names as string[]),
      );
      expect(result.failureCategories[0]).toMatchObject({
        affectedDimensions: [dimension],
        affectedChecks: names,
        severity,
      });
      expect(result.rootCauses.map((c) => c.evidence[0])).toEqual(
        (names as string[]).map((name) =>
          ["预算匹配", "违法内容", "个性化匹配"].includes(name)
            ? `evidence:${name}`
            : `detail:${name}`,
        ),
      );
      expect(result.priorityActions[0]?.steps[0]).toBe(result.recommendations[0]?.action);
    },
  );

  it.each([
    ["必填字段: 目的地", "cause-missing-destination", "rec-add-destination"],
    ["必填字段: 日期/天数", "cause-missing-date", "rec-add-date"],
    ["必填字段: 景点", "cause-missing-attractions", "rec-cause-missing-attractions"],
    ["天数连续性", "cause-day-discontinuity", "rec-cause-day-discontinuity"],
    ["预算匹配", "cause-budget-mismatch", "rec-fix-budget"],
    ["老人适配", "cause-elderly-unsuitable", "rec-elderly-friendly"],
    ["儿童适配", "cause-child-unsuitable", "rec-cause-child-unsuitable"],
    ["违法内容", "cause-illegal-content", "rec-remove-illegal"],
    ["操作指引", "cause-missing-action-guidance", "rec-add-action-guidance"],
    ["文化适配", "cause-missing-culture-adaptation", "rec-add-culture-adaptation"],
    ["个性化匹配", "cause-missing-personalization", "rec-add-personalization"],
  ])("produces an actionable explanation for %s", (name, causeId, recommendationId) => {
    const result = analyzer.analyzeReport(reportWithFailures("experience", [name]));
    expect(result.rootCauses[0]?.id).toBe(causeId);
    expect(result.recommendations[0]).toMatchObject({
      id: recommendationId,
      type: "prompt",
      priority: 100,
    });
    expect(result.recommendations[0]?.action.length).toBeGreaterThan(5);
    expect(result.rootCauses[0]?.evidence[0]).toContain(name);
  });

  it("handles richer check labels and unknown dimensions using original evidence", () => {
    const fuzzy = analyzer.analyzeReport(
      reportWithFailures("structure", ["必填字段: 目的地（最终输出）"]),
    );
    expect(fuzzy.rootCauses[0]?.id).toBe("cause-missing-destination");
    const unknown = analyzer.analyzeReport(
      reportWithFailures("new-dimension", ["provider data consistency"]),
    );
    expect(unknown.failureCategories[0]?.name).toBe("new-dimension失败");
    expect(unknown.rootCauses[0]).toMatchObject({
      description: "provider data consistency 未通过",
      evidence: ["detail:provider data consistency"],
      difficulty: "medium",
    });
  });

  it("does not attribute successful checks and bounds priority actions to five", () => {
    const success = analyzer.analyzeReport(createMockEvalReport());
    expect(success).toMatchObject({
      failureCategories: [],
      rootCauses: [],
      recommendations: [],
      priorityActions: [],
    });
    const failed = analyzer.analyzeReport(
      reportWithFailures(
        "structure",
        Array.from({ length: 7 }, (_, index) => `custom check ${index}`),
      ),
    );
    expect(failed.priorityActions.map((action) => action.description)).toEqual(
      Array.from({ length: 5 }, (_, index) => `custom check ${index} 未通过`),
    );
  });

  it("deduplicates shared recommendations, reports consensus and preserves safety actions", () => {
    const budget = reportWithFailures("practical", ["预算匹配"]);
    const safety = reportWithFailures("safety", ["老人适配"]);
    const result = analyzer.analyzeBatch([
      budget,
      { ...budget, id: "second" },
      safety,
      createMockEvalReport(),
    ]);
    expect(result.commonIssues).toEqual(["实用性失败 (2/4 场景)"]);
    expect(result.recommendations.map((rec) => rec.id)).toEqual([
      "rec-fix-budget",
      "rec-elderly-friendly",
    ]);
    expect(result.summary).toContain("通过率：1/4 (25%)");
    expect(analyzer.analyzeBatch([createMockEvalReport()]).summary).toContain("共同问题：无");
  });

  it("does not misclassify skipped Judge evidence as a quality failure or optimization advice", () => {
    const incomplete = createMockEvalReport({
      passed: false,
      dimensions: [
        createMockDimensionResult({
          dimensionId: "semantic",
          status: "error",
          passed: false,
          score: 0,
          checks: [
            { name: "Judge unavailable", passed: false, score: 0, detail: "credentials missing" },
          ],
        }),
      ],
    });
    expect(analyzer.analyzeReport(incomplete)).toMatchObject({
      failureCategories: [],
      rootCauses: [],
      recommendations: [],
      priorityActions: [],
    });
    const batch = analyzer.analyzeBatch([
      incomplete,
      reportWithFailures("practical", ["预算匹配"]),
    ]);
    expect(batch.recommendations.map((item) => item.id)).toEqual(["rec-fix-budget"]);
    expect(batch.commonIssues.join(" ")).not.toContain("语义");
    expect(batch.summary).toMatch(/未完成.*1|1.*未完成/);
  });

  it("distinguishes severe and advisory regression evidence and recommends only severe rollback", () => {
    const regressions: Regression[] = [
      {
        scenarioId: "a",
        baselineScore: 0.9,
        currentScore: 0.5,
        degradation: 0.4,
        severity: "error",
      },
      {
        scenarioId: "a",
        dimensionId: "safety",
        baselineScore: 1,
        currentScore: 0.8,
        degradation: 0.2,
        severity: "warning",
      },
      {
        scenarioId: "b",
        dimensionId: "safety",
        baselineScore: 1,
        currentScore: 0.9,
        degradation: 0.1,
        severity: "warning",
      },
      {
        scenarioId: "a",
        dimensionId: "structure",
        baselineScore: 0.9,
        currentScore: 0.8,
        degradation: 0.1,
        severity: "warning",
      },
    ];
    const result = analyzer.analyzeRegression(createMockEvalReport(), regressions);
    expect(result.failureCategories.map((cat) => [cat.id, cat.severity])).toEqual([
      ["regression-overall", "critical"],
      ["regression-safety", "high"],
      ["regression-structure", "medium"],
    ]);
    expect(result.rootCauses[0]).toMatchObject({
      description: "总体得分从 0.90 退化到 0.50",
      evidence: ["退化幅度: 40.0%"],
      difficulty: "hard",
    });
    expect(result.rootCauses[1]?.difficulty).toBe("medium");
    expect(result.recommendations.map((rec) => rec.id)).toEqual(["rec-regression-a"]);
    expect(result.recommendations[0]?.expectedEffect).toContain("0.90");
  });
});
