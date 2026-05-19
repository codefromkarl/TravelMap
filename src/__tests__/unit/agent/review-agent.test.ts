/**
 * ReviewAgent 单元测试
 *
 * 测试策略：
 *   - 确定性检查：纯代码逻辑，不 mock LLM
 *   - 语义检查：mock LLM streamFn，验证审查流程
 *   - 集成到 TravelAgent：验证 finalize() 中自动审查触发
 */

import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import { quickReview, ReviewAgent } from "../../../agent/review-agent.js";
import type { TripPlan } from "../../../types/trip.js";
import {
  createMockAttraction,
  createMockDayPlan,
  createMockMeal,
  createMockTravelerProfile,
  createMockTripPlan,
} from "../../mocks/fixtures.js";

// Mock getModel 避免依赖真实模型注册表
vi.mock("@earendil-works/pi-ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@earendil-works/pi-ai")>();
  return {
    ...actual,
    getModel: vi.fn(() => ({
      id: "gpt-4o-mini",
      name: "gpt-4o-mini",
      api: "chat",
      provider: "openai",
      baseUrl: "",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 4096,
    })),
  };
});

// Mock logger
vi.mock("../../../services/logger.js", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function createReviewStreamFn(
  passed: boolean,
  score: number,
  issues: Array<Record<string, unknown>> = [],
) {
  return (..._args: unknown[]) => {
    const stream = createAssistantMessageEventStream();
    const reviewJson = JSON.stringify({ passed, score, issues });
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const msg: any = {
      role: "assistant" as const,
      content: [{ type: "text" as const, text: `\`\`\`json\n${reviewJson}\n\`\`\`` }],
      stopReason: "stop" as const,
      timestamp: Date.now(),
    };
    setImmediate(() => {
      stream.push({ type: "start", partial: msg });
      stream.push({ type: "done", reason: "stop", message: msg });
    });
    return stream;
  };
}

/** 创建一个有 n 天的标准行程 */
function createMultiDayPlan(days: number, overrides?: Partial<TripPlan>): TripPlan {
  const dayPlans = Array.from({ length: days }, (_, i) =>
    createMockDayPlan({
      dayIndex: i + 1,
      date: `2025-06-${String(i + 1).padStart(2, "0")}`,
      city: "北京",
      attractions: [createMockAttraction({ visitDuration: 120 })],
      meals: [
        createMockMeal({ type: "breakfast" }),
        createMockMeal({ type: "lunch" }),
        createMockMeal({ type: "dinner" }),
      ],
    }),
  );
  return createMockTripPlan({
    days: dayPlans,
    startDate: "2025-06-01",
    endDate: `2025-06-${String(days).padStart(2, "0")}`,
    ...overrides,
  });
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("ReviewAgent", () => {
  describe("确定性检查（deterministic）", () => {
    it("正常行程应通过确定性检查", async () => {
      const reviewer = new ReviewAgent();
      const plan = createMultiDayPlan(3);

      const result = await reviewer.review(plan);

      expect(result.consistency.valid).toBe(true);
      expect(result.issues.filter((i) => i.severity === "error")).toHaveLength(0);
    });

    it("空天数应报 error", async () => {
      const reviewer = new ReviewAgent();
      const plan = createMockTripPlan({ days: [] });

      const result = await reviewer.review(plan);

      expect(result.passed).toBe(false);
      expect(
        result.issues.some(
          (i) => i.type === "consistency" && i.description.includes("没有任何天数"),
        ),
      ).toBe(true);
    });

    it("缺少餐饮应报 warning", async () => {
      const reviewer = new ReviewAgent();
      const plan = createMockTripPlan({
        days: [
          createMockDayPlan({
            dayIndex: 1,
            meals: [createMockMeal({ type: "breakfast" })], // 只有早餐
          }),
        ],
      });

      const result = await reviewer.review(plan);

      const mealIssues = result.issues.filter((i) => i.type === "meal");
      expect(mealIssues.length).toBeGreaterThan(0);
      expect(mealIssues.some((i) => i.description.includes("午餐"))).toBe(true);
      expect(mealIssues.some((i) => i.description.includes("晚餐"))).toBe(true);
    });

    it("每天游览超 12 小时应报 error", async () => {
      const reviewer = new ReviewAgent();
      const plan = createMockTripPlan({
        days: [
          createMockDayPlan({
            dayIndex: 1,
            attractions: [
              createMockAttraction({ visitDuration: 300 }),
              createMockAttraction({ visitDuration: 300 }),
              createMockAttraction({ visitDuration: 200 }),
            ],
          }),
        ],
      });

      const result = await reviewer.review(plan);

      const timeIssues = result.issues.filter((i) => i.type === "time" && i.severity === "error");
      expect(timeIssues.length).toBeGreaterThan(0);
      expect(timeIssues[0]!.description).toContain("超过12小时");
    });

    it("多城市无移动日应报 warning", async () => {
      const reviewer = new ReviewAgent();
      const plan = createMockTripPlan({
        cities: ["北京", "上海"],
        days: [
          createMockDayPlan({ dayIndex: 1, city: "北京", isTransferDay: false }),
          createMockDayPlan({ dayIndex: 2, city: "上海", isTransferDay: false }),
        ],
      });

      const result = await reviewer.review(plan);

      expect(result.consistency.warnings.some((w) => w.includes("城际移动日"))).toBe(true);
    });

    it("高海拔路线 + 老人应报 error", async () => {
      const reviewer = new ReviewAgent();
      const plan = createMockTripPlan({
        days: [
          createMockDayPlan({
            dayIndex: 1,
            attractions: [
              createMockAttraction({
                nameZh: "玉龙雪山",
                routes: [
                  {
                    id: "summit",
                    name: "登顶路线",
                    description: "登顶路线",
                    duration: 360,
                    waypoints: [],
                    tags: ["高海拔"],
                    source: "llm_knowledge" as const,
                    difficulty: 3 as const,
                    riskAssessment: {
                      riskLevel: 3 as const,
                      totalElevationGain: 1580,
                      totalElevationLoss: 1580,
                      maxElevation: 4680,
                      minElevation: 3100,
                      estimatedCalories: 2000,
                      estimatedSteps: 25000,
                      riskFactors: [],
                      suitability: {
                        seniors: "not_recommended" as const,
                        children: "not_recommended" as const,
                        pregnant: "not_recommended" as const,
                        mobilityImpaired: "not_recommended" as const,
                      },
                    },
                    supplyStrategy: {
                      waterStations: 0,
                      restAreas: 0,
                      recommendedBreaks: [],
                      warnings: ["高海拔缺氧"],
                    },
                  },
                ],
              }),
            ],
          }),
        ],
      });

      const travelers = createMockTravelerProfile({ adults: 1, seniors: 1 });
      const result = await reviewer.review(plan, travelers);

      const crowdIssues = result.issues.filter((i) => i.type === "crowd" && i.severity === "error");
      expect(crowdIssues.length).toBeGreaterThan(0);
      expect(crowdIssues[0]!.description).toContain("海拔");
    });

    it("无特殊人群时高海拔不报 crowd 问题", async () => {
      const reviewer = new ReviewAgent();
      const plan = createMockTripPlan({
        days: [
          createMockDayPlan({
            dayIndex: 1,
            attractions: [
              createMockAttraction({
                routes: [
                  {
                    id: "r1",
                    name: "高海拔路线",
                    description: "高海拔路线",
                    duration: 240,
                    waypoints: [],
                    tags: [],
                    source: "llm_knowledge" as const,
                    difficulty: 2 as const,
                    riskAssessment: {
                      riskLevel: 2 as const,
                      totalElevationGain: 1500,
                      totalElevationLoss: 1500,
                      maxElevation: 3000,
                      minElevation: 1500,
                      estimatedCalories: 1500,
                      estimatedSteps: 18000,
                      riskFactors: [],
                      suitability: {
                        seniors: "suitable" as const,
                        children: "suitable" as const,
                        pregnant: "suitable" as const,
                        mobilityImpaired: "suitable" as const,
                      },
                    },
                  },
                ],
              }),
            ],
          }),
        ],
      });

      const result = await reviewer.review(plan); // 无 travelers
      expect(result.issues.filter((i) => i.type === "crowd")).toHaveLength(0);
    });
  });

  describe("语义检查（LLM）", () => {
    it("LLM 返回 passed=true 时应合并结果", async () => {
      const reviewer = new ReviewAgent();
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      (reviewer as any).agent.streamFn = createReviewStreamFn(true, 9);

      const plan = createMultiDayPlan(3);
      const result = await reviewer.review(plan);

      expect(result.passed).toBe(true);
      expect(result.score).toBe(9);
    });

    it("LLM 发现地理折返问题应报告", async () => {
      const reviewer = new ReviewAgent();
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      (reviewer as any).agent.streamFn = createReviewStreamFn(false, 5, [
        {
          day: 1,
          type: "geography",
          description: "第1天景点从城东跳到城西再回城东",
          fix: "调整为天坛→前门→故宫",
          severity: "warning",
        },
      ]);

      const plan = createMultiDayPlan(3);
      const result = await reviewer.review(plan);

      expect(result.issues.some((i) => i.type === "geography")).toBe(true);
      expect(result.issues.some((i) => i.description.includes("城东"))).toBe(true);
    });

    it("确定性检查 error 应跳过 LLM 调用", async () => {
      const reviewer = new ReviewAgent();
      const streamFn = vi.fn(createReviewStreamFn(true, 10));
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      (reviewer as any).agent.streamFn = streamFn;

      // 空行程 → 确定性检查失败
      const plan = createMockTripPlan({ days: [] });
      const result = await reviewer.review(plan);

      expect(result.passed).toBe(false);
      // LLM 不应被调用
      expect(streamFn).not.toHaveBeenCalled();
    });

    it("LLM 解析失败应降级到确定性检查结果", async () => {
      const reviewer = new ReviewAgent();
      // 返回无法解析的内容
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      (reviewer as any).agent.streamFn = (..._args: unknown[]) => {
        const stream = createAssistantMessageEventStream();
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        const msg: any = {
          role: "assistant" as const,
          content: [{ type: "text" as const, text: "这不是 JSON 格式的回复" }],
          stopReason: "stop" as const,
          timestamp: Date.now(),
        };
        setImmediate(() => {
          stream.push({ type: "start", partial: msg });
          stream.push({ type: "done", reason: "stop", message: msg });
        });
        return stream;
      };

      const plan = createMultiDayPlan(3);
      const result = await reviewer.review(plan);

      // 降级到确定性结果，应该通过（正常行程无确定性错误）
      expect(result.passed).toBe(true);
    });
  });

  describe("generateFixMessage()", () => {
    it("应将 error 问题翻译成修复指令", () => {
      const reviewer = new ReviewAgent();
      const issues = [
        {
          day: 1,
          type: "meal" as const,
          description: "缺少晚餐",
          fix: "补充晚餐",
          severity: "error" as const,
        },
        {
          day: 2,
          type: "time" as const,
          description: "游览超12h",
          fix: "减少景点",
          severity: "error" as const,
        },
      ];

      const msg = reviewer.generateFixMessage(issues);
      expect(msg).toContain("第1天");
      expect(msg).toContain("补充晚餐");
      expect(msg).toContain("第2天");
      expect(msg).toContain("减少景点");
    });

    it("只有 warning 时应返回空字符串", () => {
      const reviewer = new ReviewAgent();
      const issues = [
        {
          day: 1,
          type: "geography" as const,
          description: "路线略绕",
          fix: "",
          severity: "warning" as const,
        },
      ];

      const msg = reviewer.generateFixMessage(issues);
      expect(msg).toBe("");
    });
  });

  describe("enabled=false 时", () => {
    it("应跳过所有检查，直接返回通过", async () => {
      const reviewer = new ReviewAgent({ enabled: false });
      const plan = createMockTripPlan({ days: [] }); // 即使是空行程

      const result = await reviewer.review(plan);

      expect(result.passed).toBe(true);
      expect(result.score).toBe(10);
      expect(result.issues).toHaveLength(0);
    });
  });

  describe("reset()", () => {
    it("应清除审查 agent 状态", async () => {
      const reviewer = new ReviewAgent();
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      (reviewer as any).agent.streamFn = createReviewStreamFn(true, 9);

      const plan = createMultiDayPlan(3);
      await reviewer.review(plan);

      reviewer.reset();

      // agent 消息应被清除
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      expect((reviewer as any).agent.state.messages).toEqual([]);
    });
  });
});

describe("quickReview()", () => {
  it("应只做确定性检查，不调用 LLM", () => {
    const plan = createMultiDayPlan(3);
    const result = quickReview(plan);

    expect(result.passed).toBe(true);
    expect(result.score).toBe(10);
    expect(result.issues).toHaveLength(0);
  });

  it("应检测到空行程", () => {
    const plan = createMockTripPlan({ days: [] });
    const result = quickReview(plan);

    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.type === "consistency")).toBe(true);
  });
});
