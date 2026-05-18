/**
 * TravelAgent - 基于 pi 框架的旅行规划 Agent
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

  async planTrip(request: TripRequest): Promise<void> {
    const prompt = this.buildPrompt(request);
    await this.agent.prompt(prompt);
  }

  steer(message: string): void {
    this.agent.steer({ role: "user", content: message, timestamp: Date.now() });
  }

  followUp(message: string): void {
    this.agent.followUp({ role: "user", content: message, timestamp: Date.now() });
  }

  abort(): void {
    this.agent.abort();
  }

  async waitForIdle(): Promise<void> {
    await this.agent.waitForIdle();
  }

  getMessages() {
    return this.agent.state.messages;
  }

  reset(): void {
    this.agent.reset();
  }

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
    ].join("\n");
  }
}
