/**
 * CostTracker 单元测试
 */

import { describe, expect, it } from "vitest";
import { CostTracker, isToolCallTool } from "../../../services/cost-tracker.js";

describe("CostTracker", () => {
  it("记录单次调用并计算费用", () => {
    const tracker = new CostTracker();
    tracker.record({
      model: "gpt-4o-mini",
      provider: "openai",
      inputTokens: 1000,
      outputTokens: 500,
      phase: "tool_call",
    });

    const summary = tracker.getSummary();
    expect(summary.calls).toBe(1);
    expect(summary.totalInputTokens).toBe(1000);
    expect(summary.totalOutputTokens).toBe(500);
    expect(summary.totalCost).toBeGreaterThan(0);
  });

  it("按模型分组统计", () => {
    const tracker = new CostTracker();
    tracker.record({
      model: "gpt-4o-mini",
      provider: "openai",
      inputTokens: 1000,
      outputTokens: 500,
      phase: "tool_call",
    });
    tracker.record({
      model: "gpt-4o-mini",
      provider: "openai",
      inputTokens: 500,
      outputTokens: 200,
      phase: "tool_call",
    });
    tracker.record({
      model: "claude-sonnet-4",
      provider: "anthropic",
      inputTokens: 2000,
      outputTokens: 1000,
      phase: "planning",
    });

    const summary = tracker.getSummary();
    expect(summary.calls).toBe(3);
    expect(summary.breakdownByModel["gpt-4o-mini"].calls).toBe(2);
    expect(summary.breakdownByModel["claude-sonnet-4"].calls).toBe(1);
  });

  it("按阶段分组统计", () => {
    const tracker = new CostTracker();
    tracker.record({
      model: "gpt-4o-mini",
      provider: "openai",
      inputTokens: 1000,
      outputTokens: 500,
      phase: "tool_call",
    });
    tracker.record({
      model: "claude-sonnet-4",
      provider: "anthropic",
      inputTokens: 2000,
      outputTokens: 1000,
      phase: "planning",
    });

    const summary = tracker.getSummary();
    expect(summary.breakdownByPhase.tool_call.calls).toBe(1);
    expect(summary.breakdownByPhase.planning.calls).toBe(1);
  });

  it("claude-sonnet-4 比 gpt-4o-mini 贵", () => {
    const tracker = new CostTracker();
    tracker.record({
      model: "gpt-4o-mini",
      provider: "openai",
      inputTokens: 1000,
      outputTokens: 1000,
      phase: "tool_call",
    });
    const cheapCost = tracker.getSummary().totalCost;

    tracker.reset();
    tracker.record({
      model: "claude-sonnet-4",
      provider: "anthropic",
      inputTokens: 1000,
      outputTokens: 1000,
      phase: "planning",
    });
    const expensiveCost = tracker.getSummary().totalCost;

    expect(expensiveCost).toBeGreaterThan(cheapCost);
  });

  it("reset 清空记录", () => {
    const tracker = new CostTracker();
    tracker.record({
      model: "gpt-4o-mini",
      provider: "openai",
      inputTokens: 1000,
      outputTokens: 500,
      phase: "tool_call",
    });
    tracker.reset();
    expect(tracker.getSummary().calls).toBe(0);
  });

  it("格式化摘要包含关键信息", () => {
    const tracker = new CostTracker();
    tracker.record({
      model: "gpt-4o-mini",
      provider: "openai",
      inputTokens: 1000,
      outputTokens: 500,
      phase: "tool_call",
    });

    const text = tracker.getFormattedSummary();
    expect(text).toContain("费用统计");
    expect(text).toContain("$");
    expect(text).toContain("gpt-4o-mini");
  });
});

describe("isToolCallTool", () => {
  it("搜索类工具属于便宜模型", () => {
    expect(isToolCallTool("search_attractions")).toBe(true);
    expect(isToolCallTool("search_weather")).toBe(true);
    expect(isToolCallTool("search_hotels")).toBe(true);
    expect(isToolCallTool("geocode")).toBe(true);
    expect(isToolCallTool("query_trip_data")).toBe(true);
  });

  it("编排类工具属于强模型", () => {
    expect(isToolCallTool("calculate_budget")).toBe(false);
    expect(isToolCallTool("generate_action_links")).toBe(false);
    expect(isToolCallTool("unknown_tool")).toBe(false);
  });
});
