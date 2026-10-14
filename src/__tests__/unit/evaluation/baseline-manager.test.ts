import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BaselineManager, type HistoryEntry } from "../../../evaluation/baseline-manager.js";
import { createMockDimensionResult, createMockEvalReport } from "../../mocks/fixtures.js";

let directory: string;
let manager: BaselineManager;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "travel-baseline-"));
  manager = new BaselineManager(directory);
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

function entry(index: number, score: number): HistoryEntry {
  return {
    runId: `run-${index}`,
    timestamp: `2026-10-13T00:00:${String(index % 60).padStart(2, "0")}Z`,
    baselineId: "golden",
    reports: [createMockEvalReport({ overallScore: score })],
    overallScore: score,
    passed: score >= 0.7,
    regressions: [],
  };
}

describe("persisted baseline evidence", () => {
  it("snapshots scores and successful checks with a minimum-score floor across processes", () => {
    const strong = createMockEvalReport();
    const weak = createMockEvalReport({
      id: "weak",
      overallScore: 0.3,
      dimensions: [
        createMockDimensionResult({
          checks: [
            { name: "已满足", passed: true, score: 1, detail: "evidence" },
            { name: "未满足", passed: false, score: 0, detail: "missing" },
          ],
        }),
      ],
    });
    const baseline = manager.createBaseline([strong, weak], "reviewed reference");
    const reopened = new BaselineManager(directory).loadBaseline();
    expect(reopened).toEqual(baseline);
    expect(reopened?.description).toBe("reviewed reference");
    expect(reopened?.scenarios[strong.id]?.minScore).toBeCloseTo(0.8);
    expect(reopened?.scenarios.weak?.minScore).toBe(0.5);
    expect(reopened?.scenarios.weak?.expectedChecks).toEqual(["已满足"]);
    expect(JSON.parse(readFileSync(join(directory, "eval-results/baseline.json"), "utf8"))).toEqual(
      baseline,
    );
  });

  it("distinguishes overall and dimension regressions, ignores unknown scenarios and unchanged scores", () => {
    manager.createBaseline([createMockEvalReport()]);
    const regressions = manager.detectRegressions([
      createMockEvalReport({
        overallScore: 0.75,
        dimensions: [createMockDimensionResult({ score: 0.7 })],
      }),
      createMockEvalReport({ id: "new-scenario", overallScore: 0.1 }),
    ]);
    expect(
      regressions.map((r) => ({
        id: r.scenarioId,
        dimension: r.dimensionId,
        severity: r.severity,
      })),
    ).toEqual([
      { id: "beijing-family", dimension: undefined, severity: "warning" },
      { id: "beijing-family", dimension: "structure", severity: "warning" },
    ]);
    expect(regressions[0]?.degradation).toBeCloseTo(0.15);
    expect(manager.detectRegressions([createMockEvalReport()])).toEqual([]);
    const errors = manager.detectRegressions([
      createMockEvalReport({
        overallScore: 0.5,
        dimensions: [createMockDimensionResult({ score: 0.5 })],
      }),
    ]);
    expect(errors.map((r) => r.severity)).toEqual(["error", "error"]);
  });

  it("has no comparison evidence on missing/corrupt files and preserves valid history independently", () => {
    expect(manager.loadBaseline()).toBeNull();
    expect(manager.loadHistory()).toEqual([]);
    expect(manager.detectRegressions([createMockEvalReport({ overallScore: 0.1 })])).toEqual([]);
    manager.addHistoryEntry(entry(1, 0.8));
    writeFileSync(join(directory, "eval-results/baseline.json"), "{corrupt");
    expect(manager.loadBaseline()).toBeNull();
    expect(manager.loadHistory()[0]?.overallScore).toBe(0.8);
    writeFileSync(join(directory, "eval-results/history.json"), "{corrupt");
    expect(manager.loadHistory()).toEqual([]);
    expect(manager.getScoreStats()).toEqual({ min: 0, max: 0, avg: 0, trend: "stable" });
  });

  it("rejects explicitly incomplete evidence without replacing the reviewed baseline", () => {
    const golden = manager.createBaseline([createMockEvalReport()], "golden");
    const incomplete = createMockEvalReport({
      dimensions: [
        createMockDimensionResult({
          dimensionId: "semantic",
          status: "skipped",
          score: 0,
          passed: false,
        }),
      ],
    });
    expect(() => manager.createBaseline([incomplete], "invalid replacement")).toThrow(
      "Incomplete assessments cannot become evaluation baselines",
    );
    expect(manager.loadBaseline()).toEqual(golden);
    expect(manager.detectRegressions([incomplete])).toEqual([]);
    const legacy = createMockEvalReport();
    delete legacy.completeness;
    delete legacy.dimensions[0]?.status;
    expect(manager.createBaseline([legacy], "legacy compatibility").description).toBe(
      "legacy compatibility",
    );
  });

  it("retains the newest 100 runs and returns chronological recent history", () => {
    manager.saveHistory(Array.from({ length: 100 }, (_, index) => entry(index, 0.8)));
    manager.addHistoryEntry(entry(100, 0.9));
    expect(manager.loadHistory().map((item) => item.runId)).toEqual(
      Array.from({ length: 100 }, (_, index) => `run-${index + 1}`),
    );
    expect(manager.getRecentHistory(2).map((item) => item.runId)).toEqual(["run-99", "run-100"]);
  });

  it("separates scenario trends from aggregate run scores and retains regression evidence", () => {
    const first = entry(1, 0.8);
    first.reports.push(createMockEvalReport({ id: "other", overallScore: 0.2 }));
    first.regressions = [
      {
        scenarioId: "other",
        baselineScore: 0.9,
        currentScore: 0.2,
        degradation: 0.7,
        severity: "error",
      },
    ];
    manager.saveHistory([
      first,
      { ...entry(2, 0.7), reports: [createMockEvalReport({ id: "other", overallScore: 0.7 })] },
    ]);
    expect(manager.getTrends().map((item) => item.overallScore)).toEqual([0.5, 0.7]);
    expect(manager.getTrends("beijing-family")).toEqual([
      {
        runId: "run-1",
        timestamp: first.timestamp,
        overallScore: 0.8,
        passed: true,
        regressionCount: 1,
      },
    ]);
    expect(manager.getScoreStats("missing")).toEqual({ min: 0, max: 0, avg: 0, trend: "stable" });
  });

  it.each([
    [0.6, 0.9, "improving"],
    [0.9, 0.6, "degrading"],
    [0.8, 0.8, "stable"],
  ] as const)("compares two five-run windows: %s -> %s", (before, after, trend) => {
    manager.saveHistory(
      Array.from({ length: 10 }, (_, index) => entry(index, index < 5 ? before : after)),
    );
    const stats = manager.getScoreStats();
    expect(stats.trend).toBe(trend);
    expect(stats.min).toBe(Math.min(before, after));
    expect(stats.max).toBe(Math.max(before, after));
    expect(stats.avg).toBeCloseTo((before + after) / 2);
  });
});
