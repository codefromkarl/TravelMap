/**
 * Agent 集成测试 — Mock LLM + 真实工具执行
 *
 * 测试策略：
 *   - 使用 createAssistantMessageEventStream 模拟 LLM 流式响应
 *   - 真实执行 Agent 工具
 *   - 验证端到端的事件流和工具调用结果
 */

import type { AgentEvent, AgentTool } from "@earendil-works/pi-agent-core";
import { Agent } from "@earendil-works/pi-agent-core";
import { createAssistantMessageEventStream, Type } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

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
        details: { city: (resolved as Record<string, unknown>).city },
      };
    },
  };

  return { tool, calls };
}

function createTextStreamFn(text: string) {
  return () => {
    const stream = createAssistantMessageEventStream();
    const msg = {
      role: "assistant" as const,
      content: [{ type: "text" as const, text }],
      stopReason: "stop" as const,
      timestamp: Date.now(),
    };

    setImmediate(() => {
      push(stream, { type: "start", partial: msg });
      push(stream, { type: "done", reason: "stop", message: msg });
    });

    return stream;
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

// biome-ignore lint/suspicious/noExplicitAny: mock event wrapper
const push = (stream: ReturnType<typeof createAssistantMessageEventStream>, event: any): void => {
  stream.push(event);
};

describe("Agent 集成测试", () => {
  describe("事件流验证", () => {
    it("完整的 agent_start → ... → agent_end 生命周期", async () => {
      const mockStreamFn = createTextStreamFn("好的，我来帮您规划行程");

      const agent = new Agent({
        initialState: {
          systemPrompt: "你是旅行助手",
          // biome-ignore lint/suspicious/noExplicitAny: test mock
          model: {} as any,
          thinkingLevel: "off",
          tools: [],
          messages: [],
        },
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        streamFn: mockStreamFn as any,
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        convertToLlm: (msgs) => msgs as any,
      });

      const events: AgentEvent[] = [];
      agent.subscribe((event: AgentEvent) => {
        events.push(event);
      });

      await agent.prompt("你好");
      await agent.waitForIdle();

      const types = events.map((e) => e.type);
      expect(types[0]).toBe("agent_start");
      expect(types[types.length - 1]).toBe("agent_end");
    });
  });

  describe("工具调用流程", () => {
    it("Agent 应在 prompt 后触发工具调用", async () => {
      const { tool: attractionsTool, calls: attractionCalls } =
        createRecordingTool("search_attractions");

      let streamCallCount = 0;
      const mockStreamFn = () => {
        streamCallCount++;
        const stream = createAssistantMessageEventStream();

        setImmediate(() => {
          if (streamCallCount === 1) {
            const toolMsg = {
              role: "assistant" as const,
              content: [
                {
                  type: "toolCall" as const,
                  id: "tc_1",
                  name: "search_attractions",
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
              toolCall: {
                type: "toolCall" as const,
                id: "tc_1",
                name: "search_attractions",
                arguments: { city: "北京" },
              },
              partial: toolMsg,
            });
            push(stream, { type: "done", reason: "toolUse", message: toolMsg });
          } else {
            const textMsg = {
              role: "assistant" as const,
              content: [{ type: "text" as const, text: "已为您搜索到北京的景点" }],
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
          systemPrompt: "你是旅行助手",
          // biome-ignore lint/suspicious/noExplicitAny: test mock
          model: {} as any,
          thinkingLevel: "off",
          tools: [attractionsTool],
          messages: [],
        },
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        streamFn: mockStreamFn as any,
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        convertToLlm: (msgs) => msgs as any,
      });

      const events: AgentEvent[] = [];
      agent.subscribe((event: AgentEvent) => {
        events.push(event);
      });

      await agent.prompt("帮我搜索北京的景点");
      await agent.waitForIdle();

      expect(attractionCalls).toHaveLength(1);
      expect(attractionCalls[0]).toEqual({ city: "北京" });

      expect(events.some((e) => e.type === "agent_start")).toBe(true);
      expect(events.some((e) => e.type === "agent_end")).toBe(true);
      expect(events.some((e) => e.type === "tool_execution_start")).toBe(true);
      expect(events.some((e) => e.type === "tool_execution_end")).toBe(true);
    });
  });

  describe("多工具并行执行", () => {
    it("两个独立工具应被并行调用", async () => {
      const { tool: tool1, calls: calls1 } = createRecordingTool("tool_a");
      const { tool: tool2, calls: calls2 } = createRecordingTool("tool_b");

      let streamCallCount = 0;
      const mockStreamFn = () => {
        streamCallCount++;
        const stream = createAssistantMessageEventStream();

        setImmediate(() => {
          if (streamCallCount === 1) {
            const toolMsg = {
              role: "assistant" as const,
              content: [
                {
                  type: "toolCall" as const,
                  id: "tc_1",
                  name: "tool_a",
                  arguments: { city: "北京" },
                },
                {
                  type: "toolCall" as const,
                  id: "tc_2",
                  name: "tool_b",
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
              toolCall: {
                type: "toolCall" as const,
                id: "tc_1",
                name: "tool_a",
                arguments: { city: "北京" },
              },
              partial: toolMsg,
            });
            push(stream, {
              type: "toolcall_end",
              contentIndex: 1,
              toolCall: {
                type: "toolCall" as const,
                id: "tc_2",
                name: "tool_b",
                arguments: { city: "北京" },
              },
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

      await agent.prompt("执行两个工具");
      await agent.waitForIdle();

      expect(calls1).toHaveLength(1);
      expect(calls2).toHaveLength(1);
    });
  });
});
