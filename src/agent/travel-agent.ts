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
import type { TripRequest } from "../types/trip.js";
import { SYSTEM_PROMPT } from "./prompts.js";

export interface TravelAgentOptions {
  /** LLM 供应商 */
  provider?: "openai" | "anthropic" | "google" | "deepseek" | "xai" | "openrouter";
  /** 模型 ID */
  model?: string;
}

export type TravelAgentEvent = AgentEvent;

export class TravelAgent {
  private agent: Agent;
  private eventListeners: Set<(event: TravelAgentEvent) => void> = new Set();

  constructor(options: TravelAgentOptions = {}) {
    const provider = options.provider ?? "openai";
    const modelId = options.model ?? "gpt-4o";
    // pi-ai 的 getModel 使用模板字面量类型，动态参数需断言
    const model = getModel(
      provider as Parameters<typeof getModel>[0],
      modelId as Parameters<typeof getModel>[1],
    );

    this.agent = new Agent({
      initialState: {
        systemPrompt: SYSTEM_PROMPT,
        model,
        thinkingLevel: "medium",
        tools: [],
        messages: [],
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

  // ============ 偏好挖掘 ============

  /**
   * 发起旅行规划请求。
   *
   * 如果请求信息模糊（如只说了城市），Agent 会根据 system prompt 中的
   * 偏好挖掘规则主动追问，每次只问一个问题。
   *
   * 用户回答后通过 `respondToPreferenceDig()` 注入回答，
   * Agent 判断信息足够后自动开始规划。
   */
  async planTrip(request: TripRequest): Promise<void> {
    const prompt = this.buildPrompt(request);
    await this.agent.prompt(prompt);
  }

  /**
   * 偏好挖掘时，注入用户的回答。
   *
   * 使用 followUp() 确保在当前 turn 结束后追加用户消息，
   * Agent 会继续判断是否需要追问更多偏好，还是开始规划。
   */
  respondToPreferenceDig(answer: string): void {
    this.agent.followUp({
      role: "user",
      content: [{ type: "text", text: answer }],
      timestamp: Date.now(),
    });
  }

  // ============ Steering Loop ============

  /**
   * 对已生成的行程进行微调。
   *
   * 使用 steer() 在当前 assistant turn 结束后注入用户的修改意见。
   * Agent 会根据 system prompt 中的 steering 规则，
   * 对行程进行最小化调整后输出完整修订版。
   *
   * 可多次调用，每次基于最新的行程状态进行增量修改。
   */
  steer(message: string): void {
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

  /** 清除对话历史和队列，回到初始状态 */
  reset(): void {
    this.agent.reset();
  }

  // ============ 内部 ============

  private buildPrompt(request: TripRequest): string {
    const cities =
      request.cities.length > 0
        ? request.cities.map((c) => `${c.city}(${c.days}天)`).join(" → ")
        : `${request.city}(${request.travelDays}天)`;

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
      "",
      request.preferences.length === 0 && !request.freeTextInput
        ? "⚠️ 注意：用户没有提供具体的偏好信息。请先通过追问了解用户的旅行风格、预算、人群构成等，2-3轮后自动开始规划。"
        : "",
    ].join("\n");
  }
}
