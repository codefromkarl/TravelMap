/**
 * TravelAgent - 基于 pi 框架的旅行规划 Agent
 *
 * 支持：
 * - 偏好挖掘（preference-dig）：模糊需求时主动追问
 * - 行程微调（steering-loop）：生成后通过 steer() 逐步修改
 */

import type { AgentEvent, AgentTool } from "@earendil-works/pi-agent-core";
import { Agent } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai";
import { printConfigWarnings } from "../services/config.js";
import {
  DEFAULT_HANDOFF_CONFIG,
  getCostTracker,
  type HandoffConfig,
  isToolCallTool,
} from "../services/cost-tracker.js";
import { type CompressorOptions, compressHistory } from "../services/message-compressor.js";
import { type PostProcessorConfig, postProcessTripPlan } from "../services/post-processor.js";
import { injectSearchResults, runParallelSearch } from "../services/search-orchestrator.js";
import {
  createCompanionTools,
  createPlanningTools,
  createSearchTools,
  createTools,
} from "../tools/index.js";
import type { TripPlan, TripRequest } from "../types/trip.js";
import {
  getLanguageInstruction,
  getPhasePrompt,
  type PromptPhase,
  STEERING_PROMPT_DIFF,
} from "./prompts.js";
import { findLatestPlanInMessages, mergeTripPlanDiff } from "./trip-plan-parser.js";

export interface TravelAgentOptions {
  /** LLM 供应商 */
  provider?: "openai" | "anthropic" | "google" | "deepseek" | "xai" | "openrouter";
  /** 模型 ID */
  model?: string;
  /** 模型 Handoff 配置（null 表示不切换模型） */
  handoff?: HandoffConfig | null;
  /**
   * 启用预搜索编排 — 在 LLM 编排前并行调用搜索服务
   * 搜索结果被注入 prompt，LLM 不再需要逐个调用搜索工具
   * 默认 true（推荐开启以节省 token）
   */
  preSearch?: boolean;
  /**
   * 编排后处理配置 — 自动计算预算和生成行动链接
   * 默认启用（节省 2-4 次 LLM 调用）
   */
  postProcess?: PostProcessorConfig | null;
  /**
   * 消息历史压缩配置 — 长对话时自动压缩旧消息
   * 默认启用（阈值 8 条消息，保留最近 1 轮）
   */
  messageCompression?: CompressorOptions | null;
}

export type TravelAgentEvent = AgentEvent;

/** 启动时仅打印一次配置警告 */
let _configWarningsPrinted = false;
function printConfigWarningsOnce(): void {
  if (_configWarningsPrinted) return;
  _configWarningsPrinted = true;
  printConfigWarnings();
}

export class TravelAgent {
  private agent: Agent;
  private eventListeners: Set<(event: TravelAgentEvent) => void> = new Set();
  private handoffConfig: HandoffConfig | null;
  private strongModel: ReturnType<typeof getModel>;
  private cheapModel: ReturnType<typeof getModel>;
  private costTracker = getCostTracker();
  private preSearch: boolean;
  private postProcessConfig: PostProcessorConfig | null;
  private messageCompressionConfig: CompressorOptions | null;
  /** 最近一次后处理的结果 */
  private lastProcessedPlan: TripPlan | null = null;
  /** 当前行程的出行人群画像 */
  private travelers: import("../types/trip.js").TravelerProfile | undefined;

  constructor(options: TravelAgentOptions = {}) {
    const provider = options.provider ?? "openai";
    const modelId = options.model ?? "gpt-4o";
    this.handoffConfig = options.handoff ?? DEFAULT_HANDOFF_CONFIG;
    this.preSearch = options.preSearch ?? true;
    this.postProcessConfig = options.postProcess ?? { enableActionLinks: true };
    this.messageCompressionConfig = options.messageCompression ?? {
      threshold: 8,
      preserveRounds: 1,
    };

    // 启动时验证环境变量，打印降级提示（仅首次构造时调用）
    printConfigWarningsOnce();

    // 初始化两个模型
    const strongProvider = this.handoffConfig?.strongModel.provider ?? provider;
    const strongModelId = this.handoffConfig?.strongModel.model ?? modelId;
    this.strongModel = getModel(
      strongProvider as Parameters<typeof getModel>[0],
      strongModelId as Parameters<typeof getModel>[1],
    );

    const cheapProvider = this.handoffConfig?.cheapModel.provider ?? provider;
    const cheapModelId = this.handoffConfig?.cheapModel.model ?? "gpt-4o-mini";
    this.cheapModel = getModel(
      cheapProvider as Parameters<typeof getModel>[0],
      cheapModelId as Parameters<typeof getModel>[1],
    );

    this.agent = new Agent({
      initialState: {
        systemPrompt: this.preSearch ? getPhasePrompt("search") : getPhasePrompt("planning"),
        model: this.strongModel,
        thinkingLevel: "medium",
        tools: [],
        messages: [],
      },
      /**
       * beforeToolCall: 根据工具类型切换模型
       * 搜索/查询类工具 → 便宜模型
       * 其他 → 强模型
       */
      beforeToolCall: async (ctx) => {
        const toolName = ctx.toolCall.name;
        if (this.handoffConfig && isToolCallTool(toolName)) {
          this.agent.state.model = this.cheapModel;
        }
        return undefined;
      },
      /**
       * afterToolCall: 工具执行完毕后切回强模型
       * 同时记录 token 使用量
       */
      afterToolCall: async (ctx) => {
        if (this.handoffConfig) {
          this.agent.state.model = this.strongModel;
        }
        // 记录费用（从 assistant message 中提取 token 信息）
        const lastMsg = ctx.assistantMessage as unknown as Record<string, unknown>;
        if (lastMsg) {
          const usage = lastMsg.usage as
            | { inputTokens?: number; outputTokens?: number }
            | undefined;
          if (usage) {
            const currentModel = this.agent.state.model as unknown as Record<string, unknown>;
            this.costTracker.record({
              model: (currentModel.modelId as string) ?? "unknown",
              provider: (currentModel.provider as string) ?? "unknown",
              inputTokens: usage.inputTokens ?? 0,
              outputTokens: usage.outputTokens ?? 0,
              phase: isToolCallTool(ctx.toolCall.name) ? "tool_call" : "planning",
            });
          }
        }
        return undefined;
      },
      /**
       * prepareNextTurn: 在每轮 assistant turn 结束后，
       * 检查是否有 steering 消息需要注入。
       *
       * 对于 steering-loop 场景，这是关键的 hook 点——
       * agent 生成行程后可在此处决定是否暂停等待用户反馈。
       */
      prepareNextTurn: async () => {
        // 默认行为：继续运行直到没有更多消息
        // steering 消息通过 steer() API 注入
        return undefined;
      },
    });

    this.agent.subscribe((event) => {
      for (const listener of this.eventListeners) {
        listener(event);
      }
    });
  }

  onEvent(listener: (event: TravelAgentEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  setTools(tools: AgentTool[]) {
    this.agent.state.tools = tools;
  }

  /**
   * 按阶段设置工具 — 减少每轮 LLM 调用的 input tokens
   *
   * @param phase 工具阶段: "search" | "planning" | "companion" | "all"
   */
  setToolsByPhase(phase: "search" | "planning" | "companion" | "all"): void {
    switch (phase) {
      case "search":
        this.agent.state.tools = createSearchTools();
        break;
      case "planning":
        this.agent.state.tools = createPlanningTools();
        break;
      case "companion":
        this.agent.state.tools = createCompanionTools();
        break;
      default:
        this.agent.state.tools = createTools();
        break;
    }
  }

  // ============ 偏好挖掘 ============

  /**
   * 发起旅行规划请求。
   *
   * 如果启用了 preSearch（默认），会先并行调用搜索服务获取景点/天气/坐标信息，
   * 将结果注入 prompt 后发给 LLM 编排，省掉 LLM 逐个调用搜索工具的回合。
   *
   * 如果请求信息模糊（如只说了城市），Agent 会根据 system prompt 中的
   * 偏好挖掘规则主动追问，每次只问一个问题。
   *
   * 用户回答后通过 `respondToPreferenceDig()` 注入回答，
   * Agent 判断信息足够后自动开始规划。
   */
  /**
   * 根据请求复杂度选择模型层级
   * L1: 轻量模型（单城市、≤3天、简单偏好）
   * L2: 强模型（多城市、>3天、复杂偏好）
   */
  private selectModelForRequest(request: TripRequest): "L1" | "L2" {
    if (request.cities.length > 1) return "L2";
    if (request.travelDays > 3) return "L2";
    if (request.preferences.length > 2) return "L2";
    if (request.freeTextInput && request.freeTextInput.length > 20) return "L2";
    return "L1";
  }

  async planTrip(request: TripRequest): Promise<void> {
    // 保存人群画像，供后处理阶段使用
    this.travelers = request.travelers;

    // 根据请求复杂度选择主模型
    const tier = this.selectModelForRequest(request);
    this.agent.state.model = tier === "L1" ? this.cheapModel : this.strongModel;

    let prompt = this.buildPrompt(request);

    // 预搜索编排：并行调用搜索服务，将结果注入 prompt
    if (this.preSearch) {
      try {
        const searchBundle = await runParallelSearch(request);
        prompt = injectSearchResults(prompt, searchBundle);
      } catch (err) {
        console.warn("[TravelAgent] 预搜索失败，降级到手动搜索模式:", err);
        // 失败时 fallback：不注入搜索结果，LLM 仍可手动调用搜索工具
      }
    }

    await this.agent.prompt(prompt);
  }

  /**
   * 偏好挖掘时，注入用户的回答。
   *
   * 使用 followUp() 确保在当前 turn 结束后追加用户消息，
   * Agent 会继续判断是否需要追问更多偏好，还是开始规划。
   */
  respondToPreferenceDig(answer: string): void {
    this.maybeCompressHistory();
    this.agent.followUp({
      role: "user",
      content: [{ type: "text", text: answer }],
      timestamp: Date.now(),
    });
  }

  // ============ Steering Loop ============

  /**
   * 切换 system prompt 阶段
   */
  private setPromptPhase(phase: PromptPhase, language?: string): void {
    this.agent.state.systemPrompt = getPhasePrompt(phase, language);
  }

  /**
   * 对已生成的行程进行微调（完整输出模式）。
   *
   * 使用 steer() 在当前 assistant turn 结束后注入用户的修改意见。
   * Agent 会根据 system prompt 中的 steering 规则，
   * 对行程进行最小化调整后输出完整修订版。
   *
   * 可多次调用，每次基于最新的行程状态进行增量修改。
   */
  steer(message: string): void {
    // 切换到微调阶段 prompt（更精简，减少 input tokens）
    this.setPromptPhase("steering");
    // 长对话时自动压缩历史
    this.maybeCompressHistory();
    this.agent.steer({
      role: "user",
      content: [{ type: "text", text: message }],
      timestamp: Date.now(),
    });
  }

  /**
   * 对已生成的行程进行微调（Diff 模式）。
   *
   * 与 steer() 的区别：
   * - steer(): LLM 输出完整 TripPlan JSON（~5000 output tokens）
   * - steerDiff(): LLM 只输出变更天数（~500 output tokens），代码层合并
   *
   * 使用 Diff prompt，要求 LLM 只输出变更部分。
   * 最终行程通过 finalize() 自动合并。
   */
  steerDiff(message: string): void {
    // 切换到 Diff 模式 prompt
    this.agent.state.systemPrompt = STEERING_PROMPT_DIFF;
    this.maybeCompressHistory();
    this.agent.steer({
      role: "user",
      content: [{ type: "text", text: message }],
      timestamp: Date.now(),
    });
  }

  /**
   * 在 agent 生成完毕后追加后续消息（如"请生成知识图谱数据"）。
   */
  followUp(message: string): void {
    this.maybeCompressHistory();
    this.agent.followUp({
      role: "user",
      content: [{ type: "text", text: message }],
      timestamp: Date.now(),
    });
  }

  // ============ 通用控制 ============

  abort(): void {
    this.agent.abort();
  }

  async waitForIdle(): Promise<void> {
    await this.agent.waitForIdle();
  }

  getMessages() {
    return this.agent.state.messages;
  }

  /**
   * 编排完成后自动后处理 — 计算预算和生成行动链接
   *
   * 从 Agent 消息历史中解析 TripPlan JSON，调用后处理服务
   * 自动注入 budget 和 actionLinks，无需 LLM 再次调用工具
   *
   * @returns 处理后的 TripPlan（含 budget + links），如无法解析则返回 null
   */
  async finalize(): Promise<TripPlan | null> {
    const messages = this.agent.state.messages;
    const found = findLatestPlanInMessages(messages as Array<{ role: string; content: unknown }>);

    if (!found) return null;

    let tripPlan: TripPlan;

    if (found.type === "diff") {
      // Diff 模式：需要合并到上次处理的 plan
      if (!this.lastProcessedPlan) return null;
      tripPlan = mergeTripPlanDiff(this.lastProcessedPlan, found.diff);
    } else {
      tripPlan = found.plan;
    }

    // 调用后处理（传入人群画像用于预算联动）
    const config: PostProcessorConfig = {
      ...this.postProcessConfig,
      travelers: this.travelers,
    };
    const result = await postProcessTripPlan(tripPlan, config);
    this.lastProcessedPlan = result.tripPlan;
    return result.tripPlan;
  }

  /** 获取最近一次后处理的 TripPlan */
  getLastProcessedPlan(): TripPlan | null {
    return this.lastProcessedPlan;
  }

  /** 获取费用统计 */
  getCostSummary() {
    return this.costTracker.getFormattedSummary();
  }

  /** 清除对话历史和队列，回到初始状态 */
  reset(): void {
    this.agent.reset();
    this.lastProcessedPlan = null;
    // 重置 system prompt 到初始阶段
    this.setPromptPhase(this.preSearch ? "search" : "planning");
  }

  // ============ 消息压缩 ============

  /**
   * 检查消息长度，超过阈值时自动压缩历史
   */
  private maybeCompressHistory(): void {
    if (!this.messageCompressionConfig) return;

    const messages = this.agent.state.messages as Array<{ role: string; content: unknown }>;
    const result = compressHistory(messages, this.messageCompressionConfig);

    if (result.compressed) {
      this.agent.state.messages = result.messages as unknown as typeof this.agent.state.messages;
    }
  }

  // ============ 内部 ============

  private buildPrompt(request: TripRequest): string {
    const cities =
      request.cities.length > 0
        ? request.cities.map((c) => `${c.city}(${c.days}天)`).join(" → ")
        : `${request.city}(${request.travelDays}天)`;

    const travelers = request.travelers;
    const travelersText = travelers
      ? [
          `**出行人群**: ${travelers.adults}成人${travelers.seniors > 0 ? ` · ${travelers.seniors}老人` : ""}${travelers.children > 0 ? ` · ${travelers.children}儿童` : ""}${travelers.infants > 0 ? ` · ${travelers.infants}婴幼儿` : ""}${travelers.pregnant ? " · 有孕妇" : ""}${travelers.mobilityImpaired ? " · 有行动不便者" : ""}`,
          "",
          "⚠️ 重要：系统已根据人群画像自动过滤了不适合的路线（如高风险登山路线对老人/孕妇已隐藏）。请在剩余可选路线中编排。",
        ].join("\n")
      : "";

    const needPreferenceDig =
      request.preferences.length === 0 && !request.freeTextInput && !travelers;

    return [
      "请为我规划一次旅行：",
      "",
      `**目的地**: ${cities}`,
      `**日期**: ${request.startDate} 至 ${request.endDate}`,
      `**天数**: ${request.travelDays}天`,
      `**交通方式**: ${request.transportation}`,
      `**住宿偏好**: ${request.accommodation}`,
      `**兴趣偏好**: ${request.preferences.join("、") || "无特殊偏好"}`,
      request.freeTextInput ? `\n**额外要求**: ${request.freeTextInput}` : "",
      travelersText ? `\n${travelersText}` : "",
      "",
      needPreferenceDig
        ? "⚠️ 注意：用户没有提供具体的偏好信息和人群构成。请先通过追问了解：1）旅行风格 2）预算范围 3）是否有老人/儿童/孕妇/行动不便者，2-3轮后自动开始规划。"
        : "",
      // 语言指令
      getLanguageInstruction(request.language),
    ].join("\n");
  }
}
