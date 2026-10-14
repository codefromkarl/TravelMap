import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DefaultOptimizationExecutor,
  OptimizationLoop,
} from "../../../evaluation/optimization-loop.js";
import {
  createMockDimensionResult,
  createMockEvalReport,
  createMockRecommendation,
} from "../../mocks/fixtures.js";

let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "travel-optimization-"));
});
afterEach(() => {
  vi.useRealTimers();
  rmSync(directory, { recursive: true, force: true });
});
const context = {
  originalInput: "北京两日游",
  originalPrompt: "规划两日游",
  scenarioId: "beijing-family",
};
function failedReport(score = 0.2) {
  return createMockEvalReport({
    passed: false,
    overallScore: score,
    dimensions: [
      createMockDimensionResult({
        passed: false,
        score,
        checks: [{ name: "必填字段: 目的地", passed: false, score: 0, detail: "未标目的地" }],
      }),
    ],
  });
}

describe("bounded offline optimization", () => {
  it("disabled optimization generates no plan and invokes neither evaluation nor executor", async () => {
    const executor = { execute: vi.fn() };
    const evaluate = vi.fn();
    const generate = vi.fn();
    const result = await new OptimizationLoop(executor, { enabled: false }, directory).run(
      evaluate,
      generate,
      context,
    );
    expect(result).toMatchObject({
      success: false,
      iterations: 0,
      failureReason: "优化闭环已禁用",
    });
    expect(executor.execute).not.toHaveBeenCalled();
    expect(evaluate).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("an already passing baseline reaches both targets without optimization", async () => {
    const executor = { execute: vi.fn() };
    const reports = [createMockEvalReport()];
    const result = await new OptimizationLoop(executor, {}, directory).run(
      async () => reports,
      async () => "initial output",
      context,
    );
    expect(result).toMatchObject({
      success: true,
      iterations: 0,
      initialReports: reports,
      finalReports: reports,
      history: [],
    });
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it("uses real attribution and prompt repair, retaining before/after evidence", async () => {
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce([failedReport()])
      .mockResolvedValueOnce([createMockEvalReport()]);
    const executor = new DefaultOptimizationExecutor();
    const execute = vi.spyOn(executor, "execute");
    const result = await new OptimizationLoop(
      executor,
      { cooldownMs: 0, maxIterations: 2 },
      directory,
    ).run(evaluate, async () => "initial output", context);
    expect(result.success).toBe(true);
    expect(result.iterations).toBe(1);
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ id: "rec-add-destination" }),
      context,
    );
    expect(evaluate.mock.calls[1]?.[0]).toContain("明确标注目的地城市");
    expect(result.history[0]?.improvement).toBeCloseTo(0.7);
    expect(result.initialReports[0]?.overallScore).toBe(0.2);
    expect(result.finalReports[0]?.overallScore).toBe(0.9);
  });

  it("caps failed repairs at the configured number and records negative improvement", async () => {
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce([failedReport(0.3)])
      .mockResolvedValue([failedReport(0.2)]);
    const execute = vi.fn(async () => ({ description: "prompt adjustment without replacement" }));
    const result = await new OptimizationLoop(
      { execute },
      { cooldownMs: 0, maxIterations: 2 },
      directory,
    ).run(evaluate, async () => "initial output", context);
    expect(result).toMatchObject({
      success: false,
      iterations: 2,
      failureReason: "达到最大迭代次数 (2)",
    });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(evaluate).toHaveBeenCalledTimes(3);
    expect(evaluate.mock.calls[1]?.[0]).toBe(context.originalPrompt);
    expect(result.history.map((item) => item.improvement)).toEqual([expect.closeTo(-0.1), 0]);
  });

  it("does not claim missing evaluation evidence reached the target", async () => {
    const execute = vi.fn();
    const result = await new OptimizationLoop({ execute }, {}, directory).run(
      async () => [],
      async () => "missing reports",
      context,
    );
    expect(result).toMatchObject({
      success: false,
      iterations: 0,
      failureReason: "评估未完成，停止优化",
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not invent a repair when complete score evidence contains no failed checks", async () => {
    const execute = vi.fn();
    const report = createMockEvalReport({
      passed: false,
      overallScore: 0.5,
      dimensions: [createMockDimensionResult({ score: 0.5 })],
    });
    const result = await new OptimizationLoop({ execute }, {}, directory).run(
      async () => [report],
      async () => "initial",
      context,
    );
    expect(result).toMatchObject({
      success: false,
      iterations: 0,
      failureReason: "无法生成优化建议",
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("recognizes success reached on the final permitted repair", async () => {
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce([failedReport()])
      .mockResolvedValueOnce([createMockEvalReport()]);
    const result = await new OptimizationLoop(
      new DefaultOptimizationExecutor(),
      { maxIterations: 1, cooldownMs: 0 },
      directory,
    ).run(evaluate, async () => "initial", context);
    expect(result).toMatchObject({ success: true, iterations: 1 });
    expect(result.history[0]?.improvement).toBeCloseTo(0.7);
    expect(result.finalReports[0]?.passed).toBe(true);
  });

  it("halts initial incomplete evidence even if its score and passed flag claim success", async () => {
    const incomplete = createMockEvalReport({
      dimensions: [createMockDimensionResult({ status: "skipped" })],
    });
    const execute = vi.fn();
    const result = await new OptimizationLoop({ execute }, {}, directory).run(
      async () => [incomplete],
      async () => "initial",
      context,
    );
    expect(result).toMatchObject({
      success: false,
      iterations: 0,
      failureReason: "评估未完成，停止优化",
      history: [],
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("stops subsequent incomplete evaluation without accepting it as a score improvement", async () => {
    const incomplete = createMockEvalReport({
      dimensions: [createMockDimensionResult({ status: "error" })],
    });
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce([failedReport()])
      .mockResolvedValueOnce([incomplete]);
    const execute = vi.fn(async () => ({ optimizedPrompt: "new prompt", description: "repair" }));
    const result = await new OptimizationLoop(
      { execute },
      { cooldownMs: 0, maxIterations: 3 },
      directory,
    ).run(evaluate, async () => "initial", context);
    expect(result).toMatchObject({
      success: false,
      iterations: 1,
      failureReason: "评估未完成，停止优化",
    });
    expect(
      result.history.every((item) =>
        item.reportsAfter.every((report) => report.completeness?.complete !== false),
      ),
    ).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(evaluate).toHaveBeenCalledTimes(2);
  });

  it("waits for cooldown before reevaluation and respects a zero iteration budget", async () => {
    vi.useFakeTimers();
    const evaluate = vi.fn().mockResolvedValue([failedReport()]);
    const execute = vi.fn(async () => ({ optimizedPrompt: "patched", description: "repair" }));
    const running = new OptimizationLoop(
      { execute },
      { cooldownMs: 50, maxIterations: 1 },
      directory,
    ).run(evaluate, async () => "initial", context);
    await vi.advanceTimersByTimeAsync(49);
    expect(evaluate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await running).iterations).toBe(1);
    expect(evaluate).toHaveBeenCalledTimes(2);
    const noIterations = await new OptimizationLoop(
      { execute },
      { maxIterations: 0 },
      directory,
    ).run(
      async () => [failedReport()],
      async () => "initial",
      { ...context, originalPrompt: undefined },
    );
    expect(noIterations).toMatchObject({
      success: false,
      iterations: 0,
      failureReason: "达到最大迭代次数 (0)",
    });
  });

  it("propagates executor failure without retries or a fabricated successful report", async () => {
    const execute = vi.fn().mockRejectedValue(new Error("repair unavailable"));
    const evaluate = vi.fn().mockResolvedValue([failedReport()]);
    await expect(
      new OptimizationLoop({ execute }, {}, directory).run(
        evaluate,
        async () => "initial",
        context,
      ),
    ).rejects.toThrow("repair unavailable");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });
});

describe("default repair executor", () => {
  it("adds destination/date/budget/crowd instructions while preserving existing prompt", async () => {
    const recommendation = createMockRecommendation({ description: "目的地 日期 预算 老人 儿童" });
    const result = await new DefaultOptimizationExecutor().execute(recommendation, context);
    expect(result.optimizedPrompt?.startsWith(context.originalPrompt)).toBe(true);
    for (const instruction of ["目的地城市", "Day 1", "总费用", "高强度", "适合儿童"])
      expect(result.optimizedPrompt).toContain(instruction);
  });
  it("keeps workflow and parameter recommendations explicit without pretending they change a prompt", async () => {
    const executor = new DefaultOptimizationExecutor();
    const parameter = await executor.execute(
      createMockRecommendation({ type: "parameter", description: "调整参数" }),
      { ...context, originalPrompt: undefined },
    );
    expect(parameter).toEqual({ optimizedParams: {}, description: "优化参数: 调整参数" });
    const workflow = await executor.execute(
      createMockRecommendation({ type: "workflow", description: "人工核实" }),
      context,
    );
    expect(workflow).toEqual({ description: "人工核实" });
  });
});
