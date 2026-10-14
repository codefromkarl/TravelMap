import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttributionAnalyzer } from "../../../evaluation/attribution-analyzer.js";
import { BaselineManager } from "../../../evaluation/baseline-manager.js";
import {
  EVAL_DIMENSIONS,
  type EvalReport,
  hasCompleteEvaluation,
} from "../../../evaluation/dimensions.js";
import { OptimizationLoop } from "../../../evaluation/optimization-loop.js";
import { EvalRunner } from "../../../evaluation/runner.js";
import { createMockDimensionResult, createMockEvalReport } from "../../mocks/fixtures.js";

let projectRoot: string;
beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), "travelmap-runner-contract-"));
  for (const dimension of EVAL_DIMENSIONS) {
    vi.spyOn(dimension, "evaluator").mockResolvedValue(
      createMockDimensionResult({ dimensionId: dimension.id, status: undefined, score: 0.8 }),
    );
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(projectRoot, { recursive: true, force: true });
});
function runner(options: Partial<ConstructorParameters<typeof EvalRunner>[0]> = {}) {
  return new EvalRunner({
    projectRoot,
    detectRegression: false,
    generateAttribution: false,
    ...options,
  });
}
function evaluator(id: string) {
  return vi.mocked(EVAL_DIMENSIONS.find((dimension) => dimension.id === id)!.evaluator);
}

describe("report evidence completeness", () => {
  it("emits explicit evaluated statuses while accepting legacy deterministic results", async () => {
    const { report, reportPath } = await runner({
      modelInfo: { provider: "mock", model: "generator-fixture" },
    }).run("input", "output");
    expect(report.passed).toBe(true);
    expect(report.overallScore).toBeCloseTo(0.8);
    expect(report.dimensions.map((result) => result.status)).toEqual(Array(5).fill("evaluated"));
    expect(report.completeness).toMatchObject({
      complete: true,
      evaluated: ["structure", "semantic", "practical", "safety", "experience"],
      skipped: [],
      errors: [],
      evaluatedWeight: 1,
      totalWeight: 1,
    });
    expect(report.metadata).toMatchObject({ provider: "mock", model: "generator-fixture" });
    expect(JSON.parse(readFileSync(reportPath, "utf8"))).toMatchObject({
      passed: true,
      completeness: { complete: true },
    });
  });
  it("legacy explicit disabled semantic evidence cannot become a completed pass", async () => {
    evaluator("semantic").mockResolvedValue(
      createMockDimensionResult({
        dimensionId: "semantic",
        checks: [{ name: "semantic", passed: true, score: 0.5, detail: "LLM 评估已禁用" }],
        score: 0.5,
      }),
    );
    const { report } = await runner().run("input", "output");
    expect(report.passed).toBe(false);
    expect(report.completeness?.skipped).toEqual(["semantic"]);
    expect(report.overallScore).toBeCloseTo(0.8);
  });
  it("disabled Judge is skipped, never passed, and has no invented evidence", async () => {
    const { report } = await runner({ enableLLM: false }).run("input", "output");
    expect(evaluator("semantic")).not.toHaveBeenCalled();
    expect(report.dimensions.find((result) => result.dimensionId === "semantic")).toMatchObject({
      status: "skipped",
      score: 0,
      passed: false,
      checks: [],
      errorCode: "LLM_DISABLED",
    });
    expect(report.passed).toBe(false);
    expect(report.failedRequired).toEqual(["semantic"]);
    expect(report.overallScore).toBeCloseTo(0.8);
    expect(report.completeness).toMatchObject({
      complete: false,
      skipped: ["semantic"],
      evaluatedWeight: 0.75,
    });
  });
  it("does not default-pass evaluator errors or expose raw exception details", async () => {
    evaluator("semantic").mockRejectedValue(new Error("fake-secret provider details"));
    const { report } = await runner().run("input", "output");
    expect(report.passed).toBe(false);
    expect(report.completeness?.errors).toEqual(["semantic"]);
    expect(report.overallScore).toBeCloseTo(0.8);
    expect(JSON.stringify(report)).not.toContain("fake-secret");
    expect(report.dimensions.find((result) => result.dimensionId === "semantic")?.errorCode).toBe(
      "EVALUATOR_ERROR",
    );
  });
  it("a partial semantic score cannot enter the available weighted score", async () => {
    evaluator("semantic").mockResolvedValue(
      createMockDimensionResult({
        dimensionId: "semantic",
        status: "error",
        score: 1,
        passed: true,
        errorCode: "JUDGE_INCOMPLETE_REPLY",
      }),
    );
    const { report } = await runner().run("input", "output");
    expect(report.overallScore).toBeCloseTo(0.8);
    expect(report.passed).toBe(false);
    expect(report.dimensions.find((result) => result.dimensionId === "semantic")?.passed).toBe(
      false,
    );
  });
  it.each([
    { dimensionId: "semantic", score: Number.NaN, passed: true, checks: [] },
    { dimensionId: "semantic", score: 1, passed: true, checks: [] },
    {
      dimensionId: "wrong",
      score: 1,
      passed: true,
      checks: [{ name: "check", score: 1, passed: true, detail: "detail" }],
    },
  ])("rejects malformed evaluator results %#", async (result) => {
    evaluator("semantic").mockResolvedValue(result);
    const { report } = await runner().run("input", "output");
    expect(report.passed).toBe(false);
    expect(report.dimensions.find((value) => value.dimensionId === "semantic")?.errorCode).toBe(
      "INVALID_EVALUATOR_RESULT",
    );
  });
  it("no available evidence has a finite compatibility zero and zero evaluated weight", async () => {
    for (const dimension of EVAL_DIMENSIONS)
      evaluator(dimension.id).mockRejectedValue(new Error("unavailable"));
    const { report } = await runner().run("input", "output");
    expect(report.overallScore).toBe(0);
    expect(report.passed).toBe(false);
    expect(report.completeness?.evaluatedWeight).toBe(0);
    expect(report.completeness?.evaluated).toEqual([]);
    expect(report.completeness?.errors).toHaveLength(5);
  });
  it("missing optional dimension also makes the report incomplete", async () => {
    evaluator("experience").mockRejectedValue(new Error("unavailable"));
    const { report } = await runner().run("input", "output");
    expect(report.failedRequired).toEqual([]);
    expect(report.completeness?.complete).toBe(false);
    expect(report.passed).toBe(false);
  });
  it("distinguishes observed quality failure from unavailable assessment", async () => {
    evaluator("structure").mockResolvedValue(
      createMockDimensionResult({ score: 0.2, passed: false, suggestions: ["Add dates"] }),
    );
    evaluator("practical").mockResolvedValue(
      createMockDimensionResult({
        dimensionId: "practical",
        score: 0.8,
        suggestions: ["Add dates", "Add transport"],
      }),
    );
    const { report } = await runner().run("input", "output", undefined, {
      model: "explicit-model",
      provider: "explicit-provider",
      duration: 123,
    });
    expect(report.completeness?.complete).toBe(true);
    expect(report.passed).toBe(false);
    expect(report.overallScore).toBeCloseTo(0.68);
    expect(report.failedRequired).toEqual(["structure"]);
    expect(report.allSuggestions).toEqual(["Add dates", "Add transport"]);
    expect(report.metadata.model).toBe("explicit-model");
  });
});

describe("downstream evidence boundaries", () => {
  it("incomplete assessment cannot manufacture quality regressions or prompt defects", async () => {
    const regressionSpy = vi.spyOn(BaselineManager.prototype, "detectRegressions");
    const attributionSpy = vi.spyOn(AttributionAnalyzer.prototype, "analyzeReport");
    const instance = runner({
      enableLLM: false,
      detectRegression: true,
      generateAttribution: true,
    });
    const result = await instance.run("input", "output");
    expect(result.regressions).toEqual([]);
    expect(result.attribution).toBeUndefined();
    expect(regressionSpy).not.toHaveBeenCalled();
    expect(attributionSpy).not.toHaveBeenCalled();
    expect(() => instance.updateBaseline([result.report])).toThrow("Incomplete assessments");
  });
  it("complete quality failures still run regression and attribution", async () => {
    evaluator("structure").mockResolvedValue(
      createMockDimensionResult({ score: 0.2, passed: false }),
    );
    const regressionSpy = vi.spyOn(BaselineManager.prototype, "detectRegressions");
    const attributionSpy = vi.spyOn(AttributionAnalyzer.prototype, "analyzeReport");
    const result = await runner({ detectRegression: true, generateAttribution: true }).run(
      "input",
      "output",
    );
    expect(result.report.completeness?.complete).toBe(true);
    expect(regressionSpy).toHaveBeenCalledWith([result.report]);
    expect(attributionSpy).toHaveBeenCalledWith(result.report);
    expect(result.attribution?.scenarioId).toBe(result.report.id);
  });
  it("complete reports can become a baseline", async () => {
    const baselineSpy = vi.spyOn(BaselineManager.prototype, "createBaseline");
    const instance = runner();
    const result = await instance.run("input", "output");
    instance.updateBaseline([result.report], "complete offline assessment");
    expect(baselineSpy).toHaveBeenCalledWith([result.report], "complete offline assessment");
  });
  it("an 80 percent pass rate cannot hide one incomplete batch scenario", async () => {
    evaluator("semantic").mockResolvedValueOnce(
      createMockDimensionResult({ dimensionId: "semantic", score: 0.8 }),
    );
    evaluator("semantic").mockResolvedValueOnce(
      createMockDimensionResult({ dimensionId: "semantic", score: 0.8 }),
    );
    evaluator("semantic").mockResolvedValueOnce(
      createMockDimensionResult({ dimensionId: "semantic", score: 0.8 }),
    );
    evaluator("semantic").mockResolvedValueOnce(
      createMockDimensionResult({ dimensionId: "semantic", score: 0.8 }),
    );
    evaluator("semantic").mockRejectedValueOnce(new Error("Judge unavailable"));
    const batch = await runner().runBatch(
      Array.from({ length: 5 }, (_, index) => ({
        id: String(index),
        input: "input",
        output: "output",
      })),
    );
    expect(batch.passRate).toBe(0.8);
    expect(batch.complete).toBe(false);
    expect(batch.passed).toBe(false);
    expect(JSON.parse(readFileSync(join(batch.reportDir, "summary.json"), "utf8"))).toMatchObject({
      passRate: 0.8,
      complete: false,
      passed: false,
    });
  });
  it("empty batches cannot produce NaN scores or claim pass", async () => {
    const batch = await runner().runBatch([]);
    expect(batch.overallScore).toBe(0);
    expect(batch.passRate).toBe(0);
    expect(batch.complete).toBe(false);
    expect(batch.passed).toBe(false);
  });
});

describe("persisted report evidence shape", () => {
  it.each([
    [],
    null,
    undefined,
    {},
    [null],
    [{}],
    ["fake"],
    [createMockDimensionResult({ checks: [] })],
    [createMockDimensionResult({ score: Number.NaN })],
    [
      createMockDimensionResult({
        checks: [null as unknown as EvalReport["dimensions"][number]["checks"][number]],
      }),
    ],
  ])("rejects empty or malformed dimensions %# before quality decisions", (dimensions) => {
    const report = {
      ...createMockEvalReport(),
      dimensions: dimensions as EvalReport["dimensions"],
      completeness: undefined,
    };
    expect(hasCompleteEvaluation(report)).toBe(false);
    const manager = new BaselineManager(projectRoot);
    expect(() => manager.createBaseline([report])).toThrow("Incomplete assessments");
    expect(new AttributionAnalyzer().analyzeReport(report)).toMatchObject({
      assessmentComplete: false,
      recommendations: [],
    });
  });
  it("empty persisted evidence cannot become optimizer success or trigger repairs", async () => {
    const execute = vi.fn(async () => ({ description: "unused repair" }));
    const report = {
      ...createMockEvalReport({ overallScore: 1, passed: true }),
      dimensions: [],
      completeness: undefined,
    };
    const loop = new OptimizationLoop(
      { execute },
      { enabled: true, maxIterations: 1, cooldownMs: 0 },
      projectRoot,
    );
    const result = await loop.run(
      async () => [report],
      async () => "offline prompt",
      { scenarioId: "fixture", originalInput: "request" },
    );
    expect(result.success).toBe(false);
    expect(result.failureReason).toBe("评估未完成，停止优化");
    expect(result.history).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });
  it("preserves generic legacy reports with one genuine observed dimension", () => {
    const report = createMockEvalReport({
      completeness: undefined,
      dimensions: [createMockDimensionResult({ status: undefined })],
    });
    expect(hasCompleteEvaluation(report)).toBe(true);
    expect(
      new BaselineManager(projectRoot).createBaseline([report]).scenarios[report.id].expectedScore,
    ).toBe(report.overallScore);
  });
});
