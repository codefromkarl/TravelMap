/**
 * Agent 集成测试 — Mock LLM + 真实工具执行
 *
 * 这是最接近 AI 自动化测试的一层：
 *   - Mock LLM 的响应（让它决定调用什么工具）
 *   - 真实执行 Agent 工具
 *   - 验证端到端的事件流和工具调用结果
 *
 * 后续迭代方向：
 *   - 用真实 LLM 替换 mock（E2E evaluation）
 *   - 添加 LLM-as-Judge 评估输出质量
 *   - 添加多条测试场景覆盖不同旅行请求
 */

import type { AgentEvent, AgentTool } from "@earendil-works/pi-agent-core";
import { Agent } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";

/**
 * 创建一个简单的测试工具，记录调用并返回固定结果
 */
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
    execute: async (_id: string, params: Record<string, unknown>) => {
      calls.push(params);
      return {
        content: [
          {
            type: "text" as const,
            text: `${name} result for ${(params as { city: string }).city}`,
          },
        ],
        details: { city: (params as { city: string }).city },
      };
    },
  };

  return { tool, calls };
}

/**
 * 创建 mock streamFn — 返回包含工具调用的助手消息
 */
function _createToolCallStreamFn(toolName: string, args: Record<string, unknown>) {
  return async function* () {
    yield {
      type: "message_start",
      message: {
        role: "assistant",
        content: [],
        timestamp: Date.now(),
      },
    };

    yield {
      type: "message_update",
      message: {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "tc_test_1",
            name: toolName,
            args,
          },
        ],
        stopReason: "tool_use",
        timestamp: Date.now(),
      },
    };
  };
}

/**
 * 创建 mock streamFn — 返回纯文本助手消息
 */
function createTextStreamFn(text: string) {
  return async function* () {
    yield {
      type: "message_start",
      message: {
        role: "assistant",
        content: [],
        timestamp: Date.now(),
      },
    };

    yield {
      type: "message_update",
      message: {
        role: "assistant",
        content: [{ type: "text", text }],
        stopReason: "end_turn",
        timestamp: Date.now(),
      },
    };
  };
}

describe.skip("Agent 集成测试", () => {
  describe("工具调用流程", () => {
    it("Agent 应在 prompt 后触发工具调用", async () => {
      const { tool: attractionsTool, calls: attractionCalls } =
        createRecordingTool("search_attractions");

      // 先发送工具调用，再发送最终文本
      let callCount = 0;
      const mockStreamFn = async function* () {
        callCount++;
        if (callCount === 1) {
          // 第一轮：返回工具调用
          yield {
            type: "message_start",
            message: { role: "assistant", content: [], timestamp: Date.now() },
          };
          yield {
            type: "message_update",
            message: {
              role: "assistant",
              content: [
                {
                  type: "toolCall",
                  id: "tc_1",
                  name: "search_attractions",
                  args: { city: "北京" },
                },
              ],
              stopReason: "tool_use",
              timestamp: Date.now(),
            },
          };
        } else {
          // 第二轮：返回最终文本
          yield {
            type: "message_start",
            message: { role: "assistant", content: [], timestamp: Date.now() },
          };
          yield {
            type: "message_update",
            message: {
              role: "assistant",
              content: [{ type: "text", text: "已为您搜索到北京的景点" }],
              stopReason: "end_turn",
              timestamp: Date.now(),
            },
          };
        }
      };

      const agent = new Agent({
        initialState: {
          systemPrompt: "你是旅行助手",
          model: {} as any,
          thinkingLevel: "off",
          tools: [attractionsTool],
          messages: [],
        },
        streamFn: mockStreamFn as any,
        convertToLlm: (msgs) => msgs as any,
      });

      const events: AgentEvent[] = [];
      agent.subscribe((event: AgentEvent) => {
        events.push(event);
      });

      await agent.prompt("帮我搜索北京的景点");
      await agent.waitForIdle();

      // 验证工具被调用
      expect(attractionCalls).toHaveLength(1);
      expect(attractionCalls[0]).toEqual({ city: "北京" });

      // 验证事件序列
      expect(events.some((e) => e.type === "agent_start")).toBe(true);
      expect(events.some((e) => e.type === "agent_end")).toBe(true);
      expect(events.some((e) => e.type === "tool_execution_start")).toBe(true);
      expect(events.some((e) => e.type === "tool_execution_end")).toBe(true);
    });
  });

  describe("事件流验证", () => {
    it("完整的 agent_start → ... → agent_end 生命周期", async () => {
      const mockStreamFn = createTextStreamFn("好的，我来帮您规划行程");

      const agent = new Agent({
        initialState: {
          systemPrompt: "你是旅行助手",
          model: {} as any,
          thinkingLevel: "off",
          tools: [],
          messages: [],
        },
        streamFn: mockStreamFn as any,
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

  describe("多工具并行执行", () => {
    it("两个独立工具应被依次调用", async () => {
      const { tool: tool1, calls: calls1 } = createRecordingTool("tool_a");
      const { tool: tool2, calls: calls2 } = createRecordingTool("tool_b");

      let callCount = 0;
      const mockStreamFn = async function* () {
        callCount++;
        if (callCount === 1) {
          yield {
            type: "message_start",
            message: { role: "assistant", content: [], timestamp: Date.now() },
          };
          yield {
            type: "message_update",
            message: {
              role: "assistant",
              content: [
                { type: "toolCall", id: "tc_1", name: "tool_a", args: { city: "北京" } },
                { type: "toolCall", id: "tc_2", name: "tool_b", args: { city: "北京" } },
              ],
              stopReason: "tool_use",
              timestamp: Date.now(),
            },
          };
        } else {
          yield {
            type: "message_start",
            message: { role: "assistant", content: [], timestamp: Date.now() },
          };
          yield {
            type: "message_update",
            message: {
              role: "assistant",
              content: [{ type: "text", text: "完成" }],
              stopReason: "end_turn",
              timestamp: Date.now(),
            },
          };
        }
      };

      const agent = new Agent({
        initialState: {
          systemPrompt: "测试",
          model: {} as any,
          thinkingLevel: "off",
          tools: [tool1, tool2],
          messages: [],
        },
        streamFn: mockStreamFn as any,
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
