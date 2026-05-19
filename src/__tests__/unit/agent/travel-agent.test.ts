/**
 * TravelAgent 类 — 单元测试
 *
 * 测试策略：
 *   - 不调用真实 LLM（mock streamFn）
 *   - 验证 prompt 构建、事件流、工具绑定、多轮对话
 *   - 验证行程后处理和状态管理
 */

import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import { TravelAgent } from "../../../agent/travel-agent.js";
import {
  createMockAttraction,
  createMockDayPlan,
  createMockMeal,
  createMockTravelerProfile,
  createMockTripPlan,
  createMockTripRequest,
} from "../../mocks/fixtures.js";

// Mock getModel 避免依赖真实模型注册表
vi.mock("@earendil-works/pi-ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@earendil-works/pi-ai")>();
  return {
    ...actual,
    getModel: vi.fn((provider: string, modelId: string) => ({
      id: modelId,
      name: modelId,
      api: "chat",
      provider,
      baseUrl: "",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 4096,
    })),
  };
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function createTextStreamFn(responses: string[]) {
  let index = 0;
  return (..._args: unknown[]) => {
    const stream = createAssistantMessageEventStream();
    const text = responses[Math.min(index++, responses.length - 1)] ?? "默认回复";
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const msg: any = {
      role: "assistant" as const,
      content: [{ type: "text" as const, text }],
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

/** 注入一个包含 TripPlan JSON 的 assistant message */
function injectTripPlanMessage(
  agent: TravelAgent,
  plan: ReturnType<typeof createMockTripPlan>,
): void {
  const messages = agent.getMessages();
  messages.push({
    role: "assistant",
    content: [{ type: "text", text: `\`\`\`json\n${JSON.stringify(plan)}\n\`\`\`` }],
    timestamp: Date.now(),
    // biome-ignore lint/suspicious/noExplicitAny: test mock
  } as any);
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("TravelAgent", () => {
  describe("构造函数与配置", () => {
    it("应使用默认 provider (openai) 和 model (gpt-4o)", () => {
      const agent = new TravelAgent();
      expect(agent).toBeDefined();
      expect(agent.getMessages()).toEqual([]);
    });

    it("应接受自定义 provider 和 model", () => {
      const agent = new TravelAgent({
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
      });
      expect(agent).toBeDefined();
    });
  });

  describe("planTrip() 主流程", () => {
    it("应发送包含城市名、日期和天数的 prompt", async () => {
      const agent = new TravelAgent({ preSearch: false });
      // biome-ignore lint/suspicious/noExplicitAny: access private field for test
      (agent as any).agent.streamFn = createTextStreamFn(["好的，我来为您规划行程"]);

      const request = createMockTripRequest({
        city: "上海",
        cities: [{ city: "上海", days: 3 }],
        startDate: "2025-07-01",
        endDate: "2025-07-03",
        travelDays: 3,
      });

      await agent.planTrip(request);
      await agent.waitForIdle();

      const messages = agent.getMessages();
      expect(messages.length).toBeGreaterThanOrEqual(2);

      const userMsg = messages.find((m) => m.role === "user");
      expect(userMsg).toBeDefined();
      const text = extractText(userMsg!);
      expect(text).toContain("上海");
      expect(text).toContain("2025-07-01");
      expect(text).toContain("3天");
    });

    it("多城市请求应包含所有城市", async () => {
      const agent = new TravelAgent({ preSearch: false });
      // biome-ignore lint/suspicious/noExplicitAny: access private field for test
      (agent as any).agent.streamFn = createTextStreamFn(["多城市行程规划中"]);

      const request: import("../../../types/trip.js").TripRequest = {
        city: "北京",
        cities: [
          { city: "北京", days: 2 },
          { city: "上海", days: 3 },
        ],
        startDate: "2025-06-01",
        endDate: "2025-06-05",
        travelDays: 5,
        transportation: "公共交通",
        accommodation: "经济型酒店",
        preferences: ["历史文化"],
        freeTextInput: "",
      };

      await agent.planTrip(request);
      await agent.waitForIdle();

      const userMsg = agent.getMessages().find((m) => m.role === "user");
      const text = extractText(userMsg!);
      expect(text).toContain("北京(2天)");
      expect(text).toContain("上海(3天)");
    });

    it("prompt 应包含人群画像（成人/老人/儿童/婴幼儿）", async () => {
      const agent = new TravelAgent({ preSearch: false });
      // biome-ignore lint/suspicious/noExplicitAny: access private field for test
      (agent as any).agent.streamFn = createTextStreamFn(["收到，开始规划"]);

      const request = createMockTripRequest({
        travelers: createMockTravelerProfile({ adults: 2, seniors: 1, children: 1, infants: 1 }),
      });

      await agent.planTrip(request);
      await agent.waitForIdle();

      const userMsg = agent.getMessages().find((m) => m.role === "user");
      const text = extractText(userMsg!);
      expect(text).toContain("2成人");
      expect(text).toContain("1老人");
      expect(text).toContain("1儿童");
      expect(text).toContain("1婴幼儿");
    });

    it("prompt 应包含孕妇和行动不便者标记", async () => {
      const agent = new TravelAgent({ preSearch: false });
      // biome-ignore lint/suspicious/noExplicitAny: access private field for test
      (agent as any).agent.streamFn = createTextStreamFn(["收到"]);

      const request = createMockTripRequest({
        travelers: createMockTravelerProfile({ adults: 1, pregnant: true, mobilityImpaired: true }),
      });

      await agent.planTrip(request);
      await agent.waitForIdle();

      const userMsg = agent.getMessages().find((m) => m.role === "user");
      const text = extractText(userMsg!);
      expect(text).toContain("有孕妇");
      expect(text).toContain("有行动不便者");
    });

    it("prompt 应触发偏好挖掘当信息不足时", async () => {
      const agent = new TravelAgent({ preSearch: false });
      // biome-ignore lint/suspicious/noExplicitAny: access private field for test
      (agent as any).agent.streamFn = createTextStreamFn(["请告诉我您的偏好"]);

      const request = createMockTripRequest({
        preferences: [],
        freeTextInput: "",
      });
      // 删除 travelers 以模拟完全无信息
      const requestWithoutTravelers = { ...request, travelers: undefined };

      await agent.planTrip(requestWithoutTravelers);
      await agent.waitForIdle();

      const userMsg = agent.getMessages().find((m) => m.role === "user");
      const text = extractText(userMsg!);
      expect(text).toContain("请先通过追问了解");
    });

    it("非中文语言应在 prompt 中包含语言指令", async () => {
      const agent = new TravelAgent({ preSearch: false });
      // biome-ignore lint/suspicious/noExplicitAny: access private field for test
      (agent as any).agent.streamFn = createTextStreamFn(["OK"]);

      const request = createMockTripRequest({ language: "en" });
      await agent.planTrip(request);
      await agent.waitForIdle();

      const userMsg = agent.getMessages().find((m) => m.role === "user");
      const text = extractText(userMsg!);
      expect(text).toContain("Please output all travel plan content in English");
    });

    it("L1 请求应使用轻量模型，L2 请求应使用强模型", async () => {
      const agent = new TravelAgent({ preSearch: false });
      // biome-ignore lint/suspicious/noExplicitAny: access private field for test
      (agent as any).agent.streamFn = createTextStreamFn(["OK"]);

      // L1: 单城市 ≤3天
      await agent.planTrip(createMockTripRequest({ city: "杭州", travelDays: 2 }));
      await agent.waitForIdle();
      // biome-ignore lint/suspicious/noExplicitAny: access private field for test
      const l1Model = (agent as any).agent.state.model;
      expect(l1Model).toBeDefined();

      agent.reset();
      // biome-ignore lint/suspicious/noExplicitAny: access private field for test
      (agent as any).agent.streamFn = createTextStreamFn(["OK"]);

      // L2: 多城市
      const l2Request: import("../../../types/trip.js").TripRequest = {
        city: "北京",
        cities: [
          { city: "北京", days: 2 },
          { city: "上海", days: 3 },
        ],
        startDate: "2025-06-01",
        endDate: "2025-06-05",
        travelDays: 5,
        transportation: "公共交通",
        accommodation: "经济型酒店",
        preferences: ["历史文化"],
        freeTextInput: "",
      };
      await agent.planTrip(l2Request);
      await agent.waitForIdle();
      // biome-ignore lint/suspicious/noExplicitAny: access private field for test
      const l2Model = (agent as any).agent.state.model;
      expect(l2Model).toBeDefined();

      // L2 应该使用与 L1 不同的模型（strongModel vs cheapModel）
      expect(l2Model.id).not.toBe(l1Model.id);
    });
  });

  describe("多轮对话编排", () => {
    it("respondToPreferenceDig 应追加用户回答并继续对话", async () => {
      const agent = new TravelAgent({ preSearch: false });
      // biome-ignore lint/suspicious/noExplicitAny: access private field for test
      (agent as any).agent.streamFn = createTextStreamFn(["请问您的预算范围？", "开始规划"]);

      const request = createMockTripRequest({ preferences: [] });
      await agent.planTrip(request);
      await agent.waitForIdle();

      agent.respondToPreferenceDig("预算5000元左右，喜欢历史文化");
      // followUp 入队后需要 continue() 触发处理
      // biome-ignore lint/suspicious/noExplicitAny: access private field for test
      await (agent as any).agent.continue();
      await agent.waitForIdle();

      const messages = agent.getMessages();
      const userTexts = messages
        .filter((m) => m.role === "user")
        .map((m) => extractText(m))
        .filter(Boolean);

      expect(userTexts.length).toBe(2);
      expect(userTexts[1]).toContain("预算5000元左右");
    });

    it("steer() 应切换 steering prompt 并注入修改意见", async () => {
      const agent = new TravelAgent({ preSearch: false });
      // biome-ignore lint/suspicious/noExplicitAny: access private field for test
      (agent as any).agent.streamFn = createTextStreamFn(["行程已生成", "行程已修改"]);

      const request = createMockTripRequest();
      await agent.planTrip(request);
      await agent.waitForIdle();

      agent.steer("把第二天的故宫换成颐和园");
      // steer 入队后需要 continue() 触发处理
      // biome-ignore lint/suspicious/noExplicitAny: access private field for test
      await (agent as any).agent.continue();
      await agent.waitForIdle();

      const messages = agent.getMessages();
      const steerMsg = messages
        .slice()
        .reverse()
        .find((m: { role: string }) => m.role === "user");
      expect(steerMsg).toBeDefined();
      expect(extractText(steerMsg!)).toContain("颐和园");
    });

    it("steerDiff() 应切换 diff 模式 prompt", async () => {
      const agent = new TravelAgent({ preSearch: false });
      // biome-ignore lint/suspicious/noExplicitAny: access private field for test
      (agent as any).agent.streamFn = createTextStreamFn([
        "行程已生成",
        `\`\`\`json\n{"changedDays":[2],"days":{"2":{"city":"北京"}}}\n\`\`\``,
      ]);

      const request = createMockTripRequest();
      await agent.planTrip(request);
      await agent.waitForIdle();

      // 先设置一个已处理的 plan，让 finalize 有基础
      const basePlan = createMockTripPlan();
      injectTripPlanMessage(agent, basePlan);

      agent.steerDiff("第二天改为颐和园");
      // steer 入队后需要 continue() 触发处理
      // biome-ignore lint/suspicious/noExplicitAny: access private field for test
      await (agent as any).agent.continue();
      await agent.waitForIdle();

      const messages = agent.getMessages();
      const diffMsg = messages
        .slice()
        .reverse()
        .find((m: { role: string }) => m.role === "user");
      expect(diffMsg).toBeDefined();
      expect(extractText(diffMsg!)).toContain("颐和园");
    });

    it("followUp() 应在生成完毕后追加消息", async () => {
      const agent = new TravelAgent({ preSearch: false });
      // biome-ignore lint/suspicious/noExplicitAny: access private field for test
      (agent as any).agent.streamFn = createTextStreamFn(["行程已生成", "知识图谱已生成"]);

      const request = createMockTripRequest();
      await agent.planTrip(request);
      await agent.waitForIdle();

      agent.followUp("请生成知识图谱数据");
      // followUp 入队后需要 continue() 触发处理
      // biome-ignore lint/suspicious/noExplicitAny: access private field for test
      await (agent as any).agent.continue();
      await agent.waitForIdle();

      const messages = agent.getMessages();
      const followUpMsg = messages
        .slice()
        .reverse()
        .find((m: { role: string }) => m.role === "user");
      expect(extractText(followUpMsg!)).toContain("知识图谱");
    });
  });

  describe("finalize() 后处理", () => {
    it("应从消息历史中解析 TripPlan 并计算预算", async () => {
      const agent = new TravelAgent({ preSearch: false });
      const plan = createMockTripPlan({
        days: [createMockDayPlan({ attractions: [createMockAttraction({ ticketPrice: 100 })] })],
      });
      injectTripPlanMessage(agent, plan);

      const result = await agent.finalize();

      expect(result).not.toBeNull();
      if (!result?.budget) throw new Error("result/budget should not be null");
      expect(result.budget.total).toBeGreaterThan(0);
    });

    it("应使用 travelers 人群画像计算预算", async () => {
      const agent = new TravelAgent({ preSearch: false });
      // 先设置 travelers
      const request = createMockTripRequest({
        travelers: createMockTravelerProfile({ adults: 2, seniors: 1, children: 1, infants: 0 }),
      });
      // biome-ignore lint/suspicious/noExplicitAny: access private field for test
      (agent as any).agent.streamFn = createTextStreamFn(["OK"]);
      await agent.planTrip(request);
      await agent.waitForIdle();

      const plan = createMockTripPlan({
        days: [
          createMockDayPlan({
            attractions: [createMockAttraction({ ticketPrice: 100 })],
            meals: [createMockMeal({ estimatedCost: 50 })],
            hotel: { name: "H", address: "", priceRange: "", rating: 0, estimatedCost: 300 },
          }),
        ],
      });
      injectTripPlanMessage(agent, plan);

      const result = await agent.finalize();
      expect(result).not.toBeNull();
      if (!result?.budget) throw new Error("result/budget should not be null");
      // 2成人全价 + 1老人半价 + 1儿童半价 = 2 + 0.5 + 0.5 = 3倍门票
      expect(result.budget.totalAttractions).toBe(Math.round(100 * 3));
      // 2成人+1老人全价 + 1儿童半价 = 2 + 1 + 0.5 = 3.5倍餐饮
      expect(result.budget.totalMeals).toBe(Math.round(50 * 3.5));
      // 4人 = 2间房
      expect(result.budget.totalHotels).toBe(300 * 2);
    });

    it("diff 模式应合并到上次处理的 plan", async () => {
      const agent = new TravelAgent({ preSearch: false });
      const basePlan = createMockTripPlan({
        city: "北京",
        days: [
          createMockDayPlan({ dayIndex: 1, city: "北京" }),
          createMockDayPlan({ dayIndex: 2, city: "北京" }),
        ],
      });

      // 第一次 finalize 设置 lastProcessedPlan
      injectTripPlanMessage(agent, basePlan);
      const first = await agent.finalize();
      expect(first).not.toBeNull();
      expect(agent.getLastProcessedPlan()).not.toBeNull();

      // 注入 diff 消息（提供完整的天结构）
      const diffDay = createMockDayPlan({ dayIndex: 2, city: "上海" });
      const diffText = JSON.stringify({ changedDays: [2], days: { "2": diffDay } });
      const messages = agent.getMessages();
      messages.push({
        role: "assistant",
        content: [{ type: "text", text: `\`\`\`json\n${diffText}\n\`\`\`` }],
        timestamp: Date.now(),
        // biome-ignore lint/suspicious/noExplicitAny: test mock
      } as any);

      const second = await agent.finalize();
      expect(second).not.toBeNull();
      if (!second) throw new Error("second should not be null");
      expect(second.days[1].city).toBe("上海");
    });

    it("无行程消息时应返回 null", async () => {
      const agent = new TravelAgent({ preSearch: false });
      const result = await agent.finalize();
      expect(result).toBeNull();
    });
  });

  describe("事件订阅", () => {
    it("onEvent 应正确订阅和取消订阅", async () => {
      const agent = new TravelAgent({ preSearch: false });
      // biome-ignore lint/suspicious/noExplicitAny: access private field for test
      (agent as any).agent.streamFn = createTextStreamFn(["你好"]);

      const events: Array<{ type: string }> = [];
      const listener = (event: { type: string }) => events.push(event);
      const unsubscribe = agent.onEvent(listener);

      const request = createMockTripRequest();
      await agent.planTrip(request);
      await agent.waitForIdle();

      expect(events.some((e) => e.type === "agent_start")).toBe(true);
      expect(events.some((e) => e.type === "agent_end")).toBe(true);

      unsubscribe();
      events.length = 0;

      agent.reset();
      // biome-ignore lint/suspicious/noExplicitAny: access private field for test
      (agent as any).agent.streamFn = createTextStreamFn(["再次你好"]);
      await agent.planTrip(request);
      await agent.waitForIdle();

      expect(events).toHaveLength(0);
    });
  });

  describe("工具管理", () => {
    it("setToolsByPhase 应按阶段设置不同工具", () => {
      const agent = new TravelAgent();

      agent.setToolsByPhase("search");
      // biome-ignore lint/suspicious/noExplicitAny: access private field for test
      const searchTools = (agent as any).agent.state.tools;
      expect(searchTools.length).toBeGreaterThan(0);
      expect(searchTools.map((t: { name: string }) => t.name)).toContain("search_attractions");

      agent.setToolsByPhase("planning");
      // biome-ignore lint/suspicious/noExplicitAny: access private field for test
      const planningTools = (agent as any).agent.state.tools;
      expect(planningTools.length).toBeGreaterThan(0);
      expect(planningTools.map((t: { name: string }) => t.name)).toContain("calculate_budget");

      agent.setToolsByPhase("all");
      // biome-ignore lint/suspicious/noExplicitAny: access private field for test
      const allTools = (agent as any).agent.state.tools;
      expect(allTools.length).toBeGreaterThanOrEqual(searchTools.length + planningTools.length);
    });
  });

  describe("状态管理", () => {
    it("reset 应清除消息、行程和 system prompt", async () => {
      const agent = new TravelAgent({ preSearch: false });
      // biome-ignore lint/suspicious/noExplicitAny: access private field for test
      (agent as any).agent.streamFn = createTextStreamFn(["行程已生成"]);

      const request = createMockTripRequest();
      await agent.planTrip(request);
      await agent.waitForIdle();

      expect(agent.getMessages().length).toBeGreaterThan(0);

      agent.reset();

      expect(agent.getMessages()).toEqual([]);
      expect(agent.getLastProcessedPlan()).toBeNull();
    });

    it("abort 应中断当前运行", async () => {
      const agent = new TravelAgent({ preSearch: false });
      // 使用一个延迟的 stream 让 abort 有机会执行
      // biome-ignore lint/suspicious/noExplicitAny: access private field for test
      (agent as any).agent.streamFn = (..._args: unknown[]) => {
        const stream = createAssistantMessageEventStream();
        // 延迟推送事件，让 abort 有机会触发
        const timeout = setTimeout(() => {
          const msg = {
            role: "assistant" as const,
            content: [{ type: "text" as const, text: "开始规划…" }],
            stopReason: "stop" as const,
            timestamp: Date.now(),
            // biome-ignore lint/suspicious/noExplicitAny: test mock
          } as any;
          stream.push({ type: "start", partial: msg });
          stream.push({ type: "done", reason: "stop", message: msg });
        }, 100);
        // 如果 stream 被提前结束，清理 timeout
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        (stream as any)._timeout = timeout;
        return stream;
      };

      const request = createMockTripRequest();
      const _planPromise = agent.planTrip(request);
      // 立即 abort
      agent.abort();

      // abort 后 waitForIdle 应 resolve，planTrip 可能 resolve 或 reject 取决于时机
      await expect(agent.waitForIdle()).resolves.toBeUndefined();
    });
  });

  describe("费用统计", () => {
    it("getCostSummary 应返回费用统计字符串", () => {
      const agent = new TravelAgent();
      const summary = agent.getCostSummary();
      expect(typeof summary).toBe("string");
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Utils                                                              */
/* ------------------------------------------------------------------ */

// biome-ignore lint/suspicious/noExplicitAny: test utility
function extractText(msg: any): string {
  if (!msg.content) return "";
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((c: unknown) => (c as Record<string, unknown>).type === "text")
      .map((c: unknown) => (c as Record<string, unknown>).text as string)
      .join("\n");
  }
  if (typeof msg.content === "string") return msg.content;
  return "";
}
