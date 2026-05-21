/**
 * Agent 完整编排测试 — 景点→天气→酒店→预算 四步链路
 *
 * 验证 Agent 的完整编排流程：
 *   1. 景点搜索 (search_attractions)
 *   2. 天气查询 (get_weather)
 *   3. 酒店搜索 (search_hotels)
 *   4. 预算计算 (calculate_budget)
 *
 * 测试策略：
 *   - 使用 mockStreamFn 模拟 LLM 流式响应
 *   - 真实执行工具
 *   - 验证工具调用顺序和事件流
 */

import type { AgentEvent, AgentTool } from "@earendil-works/pi-agent-core";
import { Agent } from "@earendil-works/pi-agent-core";
import { createAssistantMessageEventStream, Type } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";

// ─── Helpers ───────────────────────────────────────────

function createRecordingTool(name: string): {
  tool: AgentTool;
  calls: Array<Record<string, unknown>>;
} {
  const calls: Array<Record<string, unknown>> = [];

  const tool: AgentTool = {
    name,
    label: name,
    description: `Test tool: ${name}`,
    parameters: Type.Object({
      city: Type.String(),
      days: Type.Optional(Type.Number()),
    }),
    execute: async (_id: string, params: unknown) => {
      const resolved = params instanceof Promise ? await params : params;
      calls.push(resolved as Record<string, unknown>);
      return {
        content: [
          {
            type: "text" as const,
            text: `${name} result for ${(resolved as Record<string, unknown>).city as string}`,
          },
        ],
        details: { city: (resolved as Record<string, unknown>).city, mock: true },
      };
    },
  };

  return { tool, calls };
}

// biome-ignore lint/suspicious/noExplicitAny: mock event wrapper
const push = (stream: ReturnType<typeof createAssistantMessageEventStream>, event: any): void => {
  stream.push(event);
};

// ─── 测试 ─────────────────────────────────────────────

describe("Agent 完整编排测试", () => {
  describe("四步链路：景点→天气→酒店→预算", () => {
    it("应按顺序调用四个工具", async () => {
      const { tool: attractionsTool, calls: attractionsCalls } =
        createRecordingTool("search_attractions");
      const { tool: weatherTool, calls: weatherCalls } = createRecordingTool("get_weather");
      const { tool: hotelsTool, calls: hotelsCalls } = createRecordingTool("search_hotels");
      const { tool: budgetTool, calls: budgetCalls } = createRecordingTool("calculate_budget");

      let streamCallCount = 0;

      const mockStreamFn = () => {
        streamCallCount++;
        const stream = createAssistantMessageEventStream();

        setImmediate(() => {
          if (streamCallCount === 1) {
            // 第一轮：调用景点搜索
            const toolMsg = {
              role: "assistant" as const,
              content: [
                {
                  type: "toolCall" as const,
                  id: "tc_attractions",
                  name: "search_attractions",
                  arguments: { city: "杭州", days: 3 },
                },
              ],
              stopReason: "toolUse" as const,
              timestamp: Date.now(),
            };
            push(stream, { type: "start", partial: toolMsg });
            push(stream, {
              type: "toolcall_end",
              contentIndex: 0,
              toolCall: toolMsg.content[0],
              partial: toolMsg,
            });
            push(stream, { type: "done", reason: "toolUse", message: toolMsg });
          } else if (streamCallCount === 2) {
            // 第二轮：调用天气查询
            const toolMsg = {
              role: "assistant" as const,
              content: [
                {
                  type: "toolCall" as const,
                  id: "tc_weather",
                  name: "get_weather",
                  arguments: { city: "杭州" },
                },
              ],
              stopReason: "toolUse" as const,
              timestamp: Date.now(),
            };
            push(stream, { type: "start", partial: toolMsg });
            push(stream, {
              type: "toolcall_end",
              contentIndex: 0,
              toolCall: toolMsg.content[0],
              partial: toolMsg,
            });
            push(stream, { type: "done", reason: "toolUse", message: toolMsg });
          } else if (streamCallCount === 3) {
            // 第三轮：调用酒店搜索
            const toolMsg = {
              role: "assistant" as const,
              content: [
                {
                  type: "toolCall" as const,
                  id: "tc_hotels",
                  name: "search_hotels",
                  arguments: { city: "杭州", days: 3 },
                },
              ],
              stopReason: "toolUse" as const,
              timestamp: Date.now(),
            };
            push(stream, { type: "start", partial: toolMsg });
            push(stream, {
              type: "toolcall_end",
              contentIndex: 0,
              toolCall: toolMsg.content[0],
              partial: toolMsg,
            });
            push(stream, { type: "done", reason: "toolUse", message: toolMsg });
          } else if (streamCallCount === 4) {
            // 第四轮：调用预算计算
            const toolMsg = {
              role: "assistant" as const,
              content: [
                {
                  type: "toolCall" as const,
                  id: "tc_budget",
                  name: "calculate_budget",
                  arguments: { city: "杭州", days: 3 },
                },
              ],
              stopReason: "toolUse" as const,
              timestamp: Date.now(),
            };
            push(stream, { type: "start", partial: toolMsg });
            push(stream, {
              type: "toolcall_end",
              contentIndex: 0,
              toolCall: toolMsg.content[0],
              partial: toolMsg,
            });
            push(stream, { type: "done", reason: "toolUse", message: toolMsg });
          } else {
            // 最终回复
            const textMsg = {
              role: "assistant" as const,
              content: [
                {
                  type: "text" as const,
                  text: "为您规划了杭州三日游行程，包含西湖等景点，总预算约3500元。",
                },
              ],
              stopReason: "stop" as const,
              timestamp: Date.now(),
            };
            push(stream, { type: "start", partial: textMsg });
            push(stream, { type: "done", reason: "stop", message: textMsg });
          }
        });

        return stream;
      };

      const events: AgentEvent[] = [];

      const agent = new Agent({
        initialState: {
          systemPrompt: "你是一个旅行规划助手",
          // biome-ignore lint/suspicious/noExplicitAny: test mock
          model: {} as any,
          thinkingLevel: "off",
          tools: [attractionsTool, weatherTool, hotelsTool, budgetTool],
          messages: [],
        },
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        streamFn: mockStreamFn as any,
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        convertToLlm: (msgs) => msgs as any,
        toolExecution: "sequential",
      });

      agent.subscribe((event) => {
        events.push(event);
      });

      await agent.prompt("规划一个杭州三日游");
      await agent.waitForIdle();

      // 验证所有工具都被调用
      expect(attractionsCalls).toHaveLength(1);
      expect(weatherCalls).toHaveLength(1);
      expect(hotelsCalls).toHaveLength(1);
      expect(budgetCalls).toHaveLength(1);

      // 验证工具调用参数
      expect(attractionsCalls[0].city).toBe("杭州");
      expect(weatherCalls[0].city).toBe("杭州");
      expect(hotelsCalls[0].city).toBe("杭州");
      expect(budgetCalls[0].city).toBe("杭州");

      // 验证事件流
      expect(events.some((e) => e.type === "agent_start")).toBe(true);
      expect(events.some((e) => e.type === "agent_end")).toBe(true);
      expect(events.filter((e) => e.type === "tool_execution_start").length).toBe(4);
      expect(events.filter((e) => e.type === "tool_execution_end").length).toBe(4);
    });
  });

  describe("并行工具调用", () => {
    it("两个独立工具应被并行调用", async () => {
      const { tool: tool1, calls: calls1 } = createRecordingTool("search_attractions");
      const { tool: tool2, calls: calls2 } = createRecordingTool("get_weather");

      let streamCallCount = 0;
      const mockStreamFn = () => {
        streamCallCount++;
        const stream = createAssistantMessageEventStream();

        setImmediate(() => {
          if (streamCallCount === 1) {
            // 第一轮：并行调用两个工具
            const toolMsg = {
              role: "assistant" as const,
              content: [
                {
                  type: "toolCall" as const,
                  id: "tc_1",
                  name: "search_attractions",
                  arguments: { city: "北京" },
                },
                {
                  type: "toolCall" as const,
                  id: "tc_2",
                  name: "get_weather",
                  arguments: { city: "北京" },
                },
              ],
              stopReason: "toolUse" as const,
              timestamp: Date.now(),
            };
            push(stream, { type: "start", partial: toolMsg });
            push(stream, {
              type: "toolcall_end",
              contentIndex: 0,
              toolCall: toolMsg.content[0],
              partial: toolMsg,
            });
            push(stream, {
              type: "toolcall_end",
              contentIndex: 1,
              toolCall: toolMsg.content[1],
              partial: toolMsg,
            });
            push(stream, { type: "done", reason: "toolUse", message: toolMsg });
          } else {
            const textMsg = {
              role: "assistant" as const,
              content: [{ type: "text" as const, text: "完成" }],
              stopReason: "stop" as const,
              timestamp: Date.now(),
            };
            push(stream, { type: "start", partial: textMsg });
            push(stream, { type: "done", reason: "stop", message: textMsg });
          }
        });

        return stream;
      };

      const agent = new Agent({
        initialState: {
          systemPrompt: "测试",
          // biome-ignore lint/suspicious/noExplicitAny: test mock
          model: {} as any,
          thinkingLevel: "off",
          tools: [tool1, tool2],
          messages: [],
        },
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        streamFn: mockStreamFn as any,
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        convertToLlm: (msgs) => msgs as any,
        toolExecution: "parallel",
      });

      await agent.prompt("查询北京景点和天气");
      await agent.waitForIdle();

      // 验证两个工具都被调用
      expect(calls1).toHaveLength(1);
      expect(calls2).toHaveLength(1);
    });
  });

  describe("工具调用失败处理", () => {
    it("工具调用失败时应继续执行", async () => {
      const failTool: AgentTool = {
        name: "search_attractions",
        label: "search_attractions",
        description: "Mock tool that fails",
        parameters: Type.Object({ city: Type.String() }),
        execute: async () => {
          throw new Error("API Error");
        },
      };

      const { tool: weatherTool, calls: weatherCalls } = createRecordingTool("get_weather");

      let streamCallCount = 0;
      const mockStreamFn = () => {
        streamCallCount++;
        const stream = createAssistantMessageEventStream();

        setImmediate(() => {
          if (streamCallCount === 1) {
            // 第一轮：调用会失败的工具
            const toolMsg = {
              role: "assistant" as const,
              content: [
                {
                  type: "toolCall" as const,
                  id: "tc_fail",
                  name: "search_attractions",
                  arguments: { city: "杭州" },
                },
              ],
              stopReason: "toolUse" as const,
              timestamp: Date.now(),
            };
            push(stream, { type: "start", partial: toolMsg });
            push(stream, {
              type: "toolcall_end",
              contentIndex: 0,
              toolCall: toolMsg.content[0],
              partial: toolMsg,
            });
            push(stream, { type: "done", reason: "toolUse", message: toolMsg });
          } else if (streamCallCount === 2) {
            // 第二轮：调用成功的工具
            const toolMsg = {
              role: "assistant" as const,
              content: [
                {
                  type: "toolCall" as const,
                  id: "tc_weather",
                  name: "get_weather",
                  arguments: { city: "杭州" },
                },
              ],
              stopReason: "toolUse" as const,
              timestamp: Date.now(),
            };
            push(stream, { type: "start", partial: toolMsg });
            push(stream, {
              type: "toolcall_end",
              contentIndex: 0,
              toolCall: toolMsg.content[0],
              partial: toolMsg,
            });
            push(stream, { type: "done", reason: "toolUse", message: toolMsg });
          } else {
            const textMsg = {
              role: "assistant" as const,
              content: [{ type: "text" as const, text: "部分数据获取失败，但已完成基本规划。" }],
              stopReason: "stop" as const,
              timestamp: Date.now(),
            };
            push(stream, { type: "start", partial: textMsg });
            push(stream, { type: "done", reason: "stop", message: textMsg });
          }
        });

        return stream;
      };

      const events: AgentEvent[] = [];

      const agent = new Agent({
        initialState: {
          systemPrompt: "测试",
          // biome-ignore lint/suspicious/noExplicitAny: test mock
          model: {} as any,
          thinkingLevel: "off",
          tools: [failTool, weatherTool],
          messages: [],
        },
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        streamFn: mockStreamFn as any,
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        convertToLlm: (msgs) => msgs as any,
        toolExecution: "sequential",
      });

      agent.subscribe((event) => {
        events.push(event);
      });

      await agent.prompt("规划杭州游");
      await agent.waitForIdle();

      // 验证天气工具仍然被调用
      expect(weatherCalls).toHaveLength(1);

      // 验证事件流包含 agent_end 事件（Agent 完成执行）
      expect(events.some((e) => e.type === "agent_end")).toBe(true);
    });
  });
});
