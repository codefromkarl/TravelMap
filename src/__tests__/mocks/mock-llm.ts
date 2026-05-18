/**
 * LLM Mock — 用于 Agent 集成测试
 *
 * 模拟 pi-ai 的 streamSimple，不调用真实 LLM API。
 * 支持自定义响应内容，用于测试 Agent 的工具调用链。
 */

import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { StreamFn } from "@earendil-works/pi-agent-core/dist/types.js";

export interface MockLlmResponse {
  /** 助手回复文本 */
  text?: string;
  /** 工具调用列表 */
  toolCalls?: Array<{
    name: string;
    args: Record<string, unknown>;
  }>;
  /** 是否标记结束 */
  stopReason?: "end_turn" | "tool_use" | "error";
}

/**
 * 创建一个 mock streamFn，按序返回预设响应。
 *
 * 用法：
 * ```ts
 * const mockStream = createMockStreamFn([
 *   { toolCalls: [{ name: "search_attractions", args: { city: "北京" } }], stopReason: "tool_use" },
 *   { text: "已为您规划好行程", stopReason: "end_turn" },
 * ]);
 * ```
 */
export function createMockStreamFn(responses: MockLlmResponse[]): StreamFn {
  let callIndex = 0;

  return ((..._args: unknown[]) => {
    const response = responses[Math.min(callIndex, responses.length - 1)];
    callIndex++;

    const toolCalls =
      response?.toolCalls?.map((tc, i) => ({
        type: "toolCall" as const,
        id: `mock_tc_${i}`,
        name: tc.name,
        args: tc.args,
      })) ?? [];

    const textContent = response?.text ? [{ type: "text" as const, text: response.text }] : [];

    const content = [...textContent, ...toolCalls];

    const assistantMessage = {
      role: "assistant" as const,
      content,
      stopReason: response?.stopReason ?? (toolCalls.length > 0 ? "tool_use" : "end_turn"),
      timestamp: Date.now(),
    };

    // 模拟 stream 事件序列
    return {
      [Symbol.asyncIterator]() {
        let step = 0;
        return {
          async next() {
            if (step === 0) {
              step++;
              return {
                done: false,
                value: { type: "message_start", message: assistantMessage },
              };
            }
            if (step === 1) {
              step++;
              return {
                done: false,
                value: { type: "message_update", message: assistantMessage },
              };
            }
            return { done: true, value: undefined };
          },
        };
      },
    };
  }) as unknown as StreamFn;
}

/**
 * 创建 mock AgentTool，用于测试 Agent 调用工具的流程
 */
export function createMockTool(
  name: string,
  executeOverride?: (params: Record<string, unknown>) => unknown,
): AgentTool {
  return {
    name,
    label: name,
    description: `Mock tool: ${name}`,
    parameters: {
      type: "object",
      properties: {},
    },
    execute: async (_id: string, params: Record<string, unknown>) => {
      const result = executeOverride
        ? executeOverride(params)
        : { content: [{ type: "text" as const, text: `Mock ${name} executed` }], details: params };
      return result as Awaited<ReturnType<AgentTool["execute"]>>;
    },
  };
}
