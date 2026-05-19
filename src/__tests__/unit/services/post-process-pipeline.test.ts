/**
 * PostProcessPipeline — 单元测试
 */

import { describe, expect, it } from "vitest";
import {
  type PostProcessConfig,
  PostProcessPipeline,
  type PostProcessStep,
} from "../../../services/post-process/pipeline.js";
import type { TripPlan } from "../../../types/trip.js";

function makeTripPlan(overrides?: Partial<TripPlan>): TripPlan {
  return {
    city: "杭州",
    cities: ["杭州"],
    startDate: "2025-06-01",
    endDate: "2025-06-03",
    days: [],
    weatherInfo: [],
    overallSuggestions: "",
    ...overrides,
  };
}

// ─── 测试用 mock steps ──────────────────────────────────

class AddTagStep implements PostProcessStep {
  constructor(
    public name: string,
    private tag: string,
  ) {}
  isEnabled(_config: PostProcessConfig): boolean {
    return true;
  }
  async run(tripPlan: TripPlan, _config: PostProcessConfig): Promise<TripPlan> {
    return { ...tripPlan, overallSuggestions: `${tripPlan.overallSuggestions}${this.tag}` };
  }
}

class FailingStep implements PostProcessStep {
  name = "fail-step";
  isEnabled(_config: PostProcessConfig): boolean {
    return true;
  }
  async run(_tripPlan: TripPlan, _config: PostProcessConfig): Promise<TripPlan> {
    throw new Error("故意失败");
  }
}

class ConditionalStep implements PostProcessStep {
  name = "conditional";
  constructor(private configKey: keyof PostProcessConfig) {}
  isEnabled(config: PostProcessConfig): boolean {
    return config[this.configKey] === true;
  }
  async run(tripPlan: TripPlan, _config: PostProcessConfig): Promise<TripPlan> {
    return { ...tripPlan, overallSuggestions: `${tripPlan.overallSuggestions}conditional` };
  }
}

// ─── 测试 ────────────────────────────────────────────────

describe("PostProcessPipeline", () => {
  it("应按序执行所有启用的步骤", async () => {
    const pipeline = new PostProcessPipeline()
      .add(new AddTagStep("step-a", "A"))
      .add(new AddTagStep("step-b", "B"));

    const result = await pipeline.run(makeTripPlan(), {});

    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(0);
    expect(result.tripPlan.overallSuggestions).toBe("AB");
  });

  it("单个步骤失败不阻塞后续步骤", async () => {
    const pipeline = new PostProcessPipeline()
      .add(new AddTagStep("step-a", "A"))
      .add(new FailingStep())
      .add(new AddTagStep("step-c", "C"));

    const result = await pipeline.run(makeTripPlan(), {});

    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(1);
    expect(result.tripPlan.overallSuggestions).toBe("AC"); // step-b 失败但 step-c 继续执行
  });

  it("跳过 isEnabled=false 的步骤", async () => {
    const pipeline = new PostProcessPipeline()
      .add(new AddTagStep("always", "A"))
      .add(new ConditionalStep("enableRestaurantEnrich"));

    const result = await pipeline.run(makeTripPlan(), { enableRestaurantEnrich: false });

    expect(result.successCount).toBe(1);
    expect(result.tripPlan.overallSuggestions).toBe("A");
  });

  it("执行 isEnabled=true 的条件步骤", async () => {
    const pipeline = new PostProcessPipeline()
      .add(new AddTagStep("always", "A"))
      .add(new ConditionalStep("enableRestaurantEnrich"));

    const result = await pipeline.run(makeTripPlan(), { enableRestaurantEnrich: true });

    expect(result.successCount).toBe(2);
    expect(result.tripPlan.overallSuggestions).toBe("Aconditional");
  });

  it("空 pipeline 直接返回原始行程", async () => {
    const pipeline = new PostProcessPipeline();
    const plan = makeTripPlan();

    const result = await pipeline.run(plan, {});

    expect(result.successCount).toBe(0);
    expect(result.tripPlan).toBe(plan); // 引用相同
  });

  it("getSteps() 返回已注册的步骤", () => {
    const stepA = new AddTagStep("a", "A");
    const stepB = new AddTagStep("b", "B");
    const pipeline = new PostProcessPipeline().add(stepA).add(stepB);

    expect(pipeline.getSteps()).toHaveLength(2);
    expect(pipeline.getSteps()[0]).toBe(stepA);
  });

  it("记录每个步骤的执行结果", async () => {
    const pipeline = new PostProcessPipeline()
      .add(new AddTagStep("step-a", "A"))
      .add(new FailingStep());

    const result = await pipeline.run(makeTripPlan(), {});

    expect(result.stepResults).toHaveLength(2);
    expect(result.stepResults[0]!.success).toBe(true);
    expect(result.stepResults[0]!.stepName).toBe("step-a");
    expect(result.stepResults[1]!.success).toBe(false);
    expect(result.stepResults[1]!.stepName).toBe("fail-step");
    expect(result.stepResults[1]!.error).toBe("故意失败");
  });
});
