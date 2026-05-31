/**
 * TravelAgent - 基于 pi 框架的旅行规划 Agent
 *
 * 公开接口（3 步生命周期）:
 *   1. plan(request)  — 发起规划（自动管理工具和预搜索）
 *   2. refine(msg)    — 行程微调（统一 steer/followUp/preferenceDig）
 *   3. finalize()     — 后处理 + 审查
 *
 * 支持：
 * - 偏好挖掘（preference-dig）：模糊需求时主动追问
 * - 行程微调（steering-loop）：生成后通过 refine() 逐步修改
 * - Diff 模式：refine(message, { diff: true }) 只输出变更部分
 */

import type { AgentEvent, AgentTool } from "@earendil-works/pi-agent-core";
import { Agent } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai";
import { printConfigWarnings } from "../services/config.js";
import {
  type CostTracker,
  DEFAULT_HANDOFF_CONFIG,
  getCostTracker,
  type HandoffConfig,
  isToolCallTool,
} from "../services/cost-tracker.js";
import { getLogger } from "../services/logger.js";
import { type CompressorOptions, compressHistory } from "../services/message-compressor.js";
import { type PostProcessorConfig, postProcessTripPlan } from "../services/post-processor.js";
import { injectSearchResults, runParallelSearch } from "../services/search-orchestrator.js";
import {
  createChildSpan,
  generateSpanId,
  generateTraceId,
  runWithTrace,
} from "../services/trace-context.js";
import {
  createCompanionTools,
  createDiscoverTools,
  createPlanningTools,
  createSearchTools,
  createTools,
} from "../tools/index.js";
import type { TripPlan, TripRequest, ValidatedTripPlan } from "../types/trip.js";
import { validateTripPlan } from "../types/trip.js";
import { selectModelTier } from "./model-selector.js";
import { buildUserPrompt } from "./prompt-builder.js";
import { getPhasePrompt, type PromptPhase, STEERING_PROMPT_DIFF } from "./prompts.js";
import { ReviewAgent, type ReviewResult } from "./review-agent.js";
import { findLatestPlanInMessages, mergeTripPlanDiff } from "./trip-plan-parser.js";

// ─── 配置 ─────────────────────────────────────────────────

export interface TravelAgentOptions {
  /** LLM 供应商 */
  provider?: "openai" | "anthropic" | "google" | "deepseek" | "xai" | "openrouter";
  /** 模型 ID */
  model?: string;
  /** 模型 Handoff 配置（null 表示不切换模型） */
  handoff?: HandoffConfig | null;
  /** 费用追踪器（不传则使用全局单例） */
  costTracker?: CostTracker;
  /** 启用预搜索编排（默认 true） */
  preSearch?: boolean;
  /** 启用行程审查（默认 true） */
  reviewEnabled?: boolean;
  /** 编排后处理配置 */
  postProcess?: PostProcessorConfig | null;
  /** 消息历史压缩配置 */
  messageCompression?: CompressorOptions | null;
}

export type TravelAgentEvent = AgentEvent;

/** refine() 的选项 */
export interface RefineOptions {
  /** 使用 Diff 模式（LLM 只输出变更部分，代码层合并） */
  diff?: boolean;
}

// ─── 内部工具阶段 ──────────────────────────────────────────

type ToolPhase = "search" | "planning" | "companion" | "discover" | "all";

const PHASE_TOOLS: Record<ToolPhase, () => AgentTool[]> = {
  search: createSearchTools,
  planning: createPlanningTools,
  companion: createCompanionTools,
  discover: createDiscoverTools,
  all: createTools,
};

// ─── 启动警告（仅一次）──────────────────────────────────────

let _configWarningsPrinted = false;
function printConfigWarningsOnce(): void {
  if (_configWarningsPrinted) return;
  _configWarningsPrinted = true;
  printConfigWarnings();
}

// ─── TravelAgent ──────────────────────────────────────────

export class TravelAgent {
  // 核心依赖
  private agent: Agent;
  private costTracker: CostTracker;
  private reviewer: ReviewAgent;

  // 模型
  private handoffConfig: HandoffConfig | null;
  private strongModel: ReturnType<typeof getModel>;
  private cheapModel: ReturnType<typeof getModel>;

  // 配置
  private preSearch: boolean;
  private postProcessConfig: PostProcessorConfig | null;
  private messageCompressionConfig: CompressorOptions | null;

  // 状态
  private eventListeners: Set<(event: TravelAgentEvent) => void> = new Set();
  private lastProcessedPlan: TripPlan | null = null;
  private lastReview: ReviewResult | null = null;
  private travelers: import("../types/trip.js").TravelerProfile | undefined;

  constructor(options: TravelAgentOptions = {}) {
    const provider = options.provider ?? "openai";
    const modelId = options.model ?? "gpt-4o";
    this.handoffConfig = options.handoff ?? DEFAULT_HANDOFF_CONFIG;
    this.costTracker = options.costTracker ?? getCostTracker();
    this.preSearch = options.preSearch ?? true;
    this.postProcessConfig = options.postProcess ?? { enableActionLinks: true };
    this.messageCompressionConfig = options.messageCompression ?? {
      threshold: 18,
      preserveRounds: 3,
      maxSummaryLength: 800,
    };
    this.reviewer = new ReviewAgent({ enabled: options.reviewEnabled ?? true });

    printConfigWarningsOnce();

    // 初始化模型
    this.strongModel = this.initModel("strong", provider, modelId);
    this.cheapModel = this.initModel("cheap", provider, modelId);

    // 初始化 Agent
    this.agent = this.createAgent();
  }

  // ============ 公开生命周期 ============

  /**
   * 发起旅行规划（步骤 1）
   *
   * 自动管理：
   * - 根据请求复杂度选择模型
   * - 预搜索编排（景点/天气/坐标）
   * - 工具阶段切换
   */
  async plan(request: TripRequest): Promise<void> {
    const logger = getLogger().child({ component: "travel-agent", operation: "plan" });
    logger.info("plan 开始", {
      city: request.city,
      days: request.travelDays,
      mode: request.mode ?? "plan",
    });

    this.travelers = request.travelers;

    // 发现模式
    if (request.mode === "discover") {
      return this.runDiscoverMode(request);
    }

    // 行程规划模式
    return this.runPlanMode(request);
  }

  /**
   * 行程微调（步骤 2）
   *
   * 统一入口，替代 steer/steerDiff/respondToPreferenceDig/followUp。
   * 根据上下文自动选择最佳策略。
   *
   * @param message 用户反馈
   * @param options 选项（diff: 使用 Diff 模式）
   */
  refine(message: string, options?: RefineOptions): void {
    this.maybeCompressHistory();

    if (options?.diff) {
      // Diff 模式：LLM 只输出变更部分
      this.agent.state.systemPrompt = STEERING_PROMPT_DIFF;
    } else {
      // 默认：切换到微调阶段 prompt
      this.setPromptPhase("steering");
    }

    this.agent.steer({
      role: "user",
      content: [{ type: "text", text: message }],
      timestamp: Date.now(),
    });
  }

  /**
   * 编排完成后处理（步骤 3）
   *
   * 从消息历史中解析 TripPlan，执行：
   * 1. 后处理管线（预算计算、行动链接生成等）
   * 2. 行程质量审查
   * 3. 自动修复（如审查发现 error 级别问题）
   *
   * @returns 处理后的 TripPlan，如无法解析则返回 null
   */
  async finalize(): Promise<ValidatedTripPlan | null> {
    const logger = getLogger().child({ component: "travel-agent", operation: "finalize" });
    logger.info("finalize 开始");

    const found = findLatestPlanInMessages(
      this.agent.state.messages as Array<{ role: string; content: unknown }>,
    );

    if (!found) {
      logger.debug("finalize 跳过：未找到行程 JSON");
      return null;
    }

    let tripPlan: TripPlan;

    if (found.type === "diff") {
      if (!this.lastProcessedPlan) return null;
      tripPlan = mergeTripPlanDiff(this.lastProcessedPlan, found.diff);
    } else {
      tripPlan = found.plan;
    }

    // 后处理
    const config: PostProcessorConfig = { ...this.postProcessConfig, travelers: this.travelers };
    const result = await runWithTrace(createChildSpan("post-process"), () =>
      postProcessTripPlan(tripPlan, config),
    );
    logger.info("后处理完成", {
      budgetCalculated: result.budgetCalculated,
      linksGenerated: result.linksGenerated,
    });

    // 审查 + 自动修复
    const review = await runWithTrace(createChildSpan("review"), () =>
      this.reviewer.review(result.tripPlan, this.travelers),
    );
    logger.info("审查完成", { passed: review.passed, score: review.score });
    this.lastReview = review;

    if (!review.passed) {
      const fixMessage = this.reviewer.generateFixMessage(review.issues);
      if (fixMessage) {
        logger.info("审查发现错误，自动修复", { issueCount: review.issues.length });
        this.setPromptPhase("steering");
        this.refine(fixMessage);
      }
    }

    this.lastProcessedPlan = result.tripPlan;

    // 验证并返回（验证失败时记录警告但不阻塞）
    try {
      return validateTripPlan(result.tripPlan);
    } catch (err) {
      logger.warn("TripPlan 验证失败（已降级返回）", {
        error: err instanceof Error ? err.message : String(err),
      });
      return result.tripPlan as ValidatedTripPlan;
    }
  }

  // ============ 事件与控制 ============

  onEvent(listener: (event: TravelAgentEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  abort(): void {
    this.agent.abort();
  }

  async waitForIdle(): Promise<void> {
    await this.agent.waitForIdle();
  }

  reset(): void {
    this.agent.reset();
    this.reviewer.reset();
    this.lastProcessedPlan = null;
    this.lastReview = null;
    this.setPromptPhase(this.preSearch ? "search" : "planning");
  }

  // ============ 状态查询 ============

  getMessages() {
    return this.agent.state.messages;
  }

  getLastProcessedPlan(): TripPlan | null {
    return this.lastProcessedPlan;
  }

  getLastReview(): ReviewResult | null {
    return this.lastReview;
  }

  getCostSummary(): string {
    return this.costTracker.getFormattedSummary();
  }

  // ============ 向后兼容别名 ============

  /** @deprecated 使用 plan() 替代 */
  async planTrip(request: TripRequest): Promise<void> {
    return this.plan(request);
  }

  /** @deprecated 使用 refine() 替代 */
  steer(message: string): void {
    this.refine(message);
  }

  /** @deprecated 使用 refine(message, { diff: true }) 替代 */
  steerDiff(message: string): void {
    this.refine(message, { diff: true });
  }

  /** @deprecated 使用 refine() 替代 */
  respondToPreferenceDig(answer: string): void {
    this.refine(answer);
  }

  /** @deprecated 使用 refine() 替代 */
  followUp(message: string): void {
    this.maybeCompressHistory();
    this.agent.followUp({
      role: "user",
      content: [{ type: "text", text: message }],
      timestamp: Date.now(),
    });
  }

  /** @deprecated 内部自动管理，无需手动调用 */
  setTools(tools: AgentTool[]): void {
    this.agent.state.tools = tools;
  }

  /** @deprecated 内部自动管理，无需手动调用 */
  setToolsByPhase(phase: ToolPhase): void {
    this.agent.state.tools = PHASE_TOOLS[phase]();
  }

  // ============ 内部实现 ============

  private initModel(
    tier: "strong" | "cheap",
    fallbackProvider: string,
    fallbackModel: string,
  ): ReturnType<typeof getModel> {
    const cfg = this.handoffConfig?.[`${tier}Model`];
    const provider = cfg?.provider ?? fallbackProvider;
    const modelId =
      tier === "strong" ? (cfg?.model ?? fallbackModel) : (cfg?.model ?? "gpt-4o-mini");
    return getModel(
      provider as Parameters<typeof getModel>[0],
      modelId as Parameters<typeof getModel>[1],
    );
  }

  private createAgent(): Agent {
    const agent = new Agent({
      initialState: {
        systemPrompt: this.preSearch ? getPhasePrompt("search") : getPhasePrompt("planning"),
        model: this.strongModel,
        thinkingLevel: "medium",
        tools: [],
        messages: [],
      },
      beforeToolCall: async (ctx) => {
        if (this.handoffConfig && isToolCallTool(ctx.toolCall.name)) {
          agent.state.model = this.cheapModel;
        }
        return undefined;
      },
      afterToolCall: async (ctx) => {
        getLogger().child({ component: "travel-agent" }).debug("tool 执行完成", {
          tool: ctx.toolCall.name,
        });
        if (this.handoffConfig) {
          agent.state.model = this.strongModel;
        }
        this.recordCost(ctx);
        return undefined;
      },
      prepareNextTurn: async () => undefined,
    });

    agent.subscribe((event) => {
      for (const listener of this.eventListeners) {
        listener(event);
      }
    });

    return agent;
  }

  private recordCost(ctx: { toolCall: { name: string }; assistantMessage: unknown }): void {
    const lastMsg = ctx.assistantMessage as Record<string, unknown>;
    if (!lastMsg) return;
    const usage = lastMsg.usage as { inputTokens?: number; outputTokens?: number } | undefined;
    if (!usage) return;
    const currentModel = this.agent.state.model as unknown as Record<string, unknown>;
    this.costTracker.record({
      model: (currentModel.modelId as string) ?? "unknown",
      provider: (currentModel.provider as string) ?? "unknown",
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      phase: isToolCallTool(ctx.toolCall.name) ? "tool_call" : "planning",
    });
  }

  private setPromptPhase(phase: PromptPhase, language?: string): void {
    this.agent.state.systemPrompt = getPhasePrompt(phase, language);
  }

  private setToolsByPhaseInternal(phase: ToolPhase): void {
    this.agent.state.tools = PHASE_TOOLS[phase]();
  }

  private async runDiscoverMode(request: TripRequest): Promise<void> {
    const logger = getLogger().child({ component: "travel-agent", operation: "discover" });
    logger.info("进入发现模式");
    this.setPromptPhase("discover");
    this.setToolsByPhaseInternal("discover");

    const prompt = buildUserPrompt(request);
    await runWithTrace(
      {
        traceId: generateTraceId(),
        spanId: generateSpanId(),
        operation: "discover",
        city: request.currentLocation?.city ?? "unknown",
      },
      async () => {
        await this.agent.prompt(prompt);
        logger.info("发现模式完成", { messageCount: this.agent.state.messages.length });
      },
    );
  }

  private async runPlanMode(request: TripRequest): Promise<void> {
    const logger = getLogger().child({ component: "travel-agent", operation: "plan" });

    // 模型选择
    const tier = selectModelTier(request);
    this.agent.state.model = tier === "L1" ? this.cheapModel : this.strongModel;
    logger.debug("模型选择", { tier });

    let prompt = buildUserPrompt(request);

    // 预搜索
    if (this.preSearch) {
      prompt = await this.runPreSearch(request, prompt);
    }

    // LLM 编排
    await runWithTrace(
      {
        traceId: generateTraceId(),
        spanId: generateSpanId(),
        operation: "planTrip",
        city: request.city,
      },
      async () => {
        const llmStart = Date.now();
        await this.agent.prompt(prompt);
        logger.info("LLM 编排完成", {
          duration: Date.now() - llmStart,
          messageCount: this.agent.state.messages.length,
        });
      },
    );
  }

  private async runPreSearch(request: TripRequest, prompt: string): Promise<string> {
    const logger = getLogger().child({ component: "travel-agent", operation: "preSearch" });
    const searchStart = Date.now();
    const TIMEOUT_MS = 15_000;

    try {
      const searchBundle = await runWithTrace(createChildSpan("pre-search"), () =>
        Promise.race([
          runParallelSearch(request),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("PreSearch timeout")), TIMEOUT_MS),
          ),
        ]),
      );
      logger.info("预搜索完成", {
        duration: Date.now() - searchStart,
        attractions: searchBundle.attractions.length,
        sources: searchBundle.sources.join(","),
      });

      const injected = injectSearchResults(prompt, searchBundle);
      if (searchBundle.attractions.length > 0) {
        this.setToolsByPhaseInternal("planning");
      }
      return injected;
    } catch (err) {
      logger.warn("预搜索失败，降级到手动搜索模式", {
        error: err instanceof Error ? err.message : String(err),
        duration: Date.now() - searchStart,
      });
      this.setToolsByPhaseInternal("search");
      return prompt;
    }
  }

  private maybeCompressHistory(): void {
    if (!this.messageCompressionConfig) return;
    const messages = this.agent.state.messages as Array<{ role: string; content: unknown }>;
    const result = compressHistory(messages, this.messageCompressionConfig);
    if (result.compressed) {
      this.agent.state.messages = result.messages as unknown as typeof this.agent.state.messages;
    }
  }
}
