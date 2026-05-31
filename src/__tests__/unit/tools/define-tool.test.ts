/**
 * defineTool 工厂测试
 */

import { describe, expect, it, vi } from "vitest";
import { defineTool } from "../../tools/define-tool.js";

// Mock cost-tracker
vi.mock("../../services/cost-tracker.js", () => ({
  registerToolMetadata: vi.fn(),
}));

describe("defineTool", () => {
  const mockSchema = {
    type: "object" as const,
    properties: {
      city: { type: "string" as const },
    },
    required: ["city"],
  };

  it("应创建符合 AgentTool 接口的工具", () => {
    const tool = defineTool({
      name: "test_tool",
      costTier: "cheap",
      label: "测试工具",
      description: "测试用工具",
      parameters: mockSchema,
      execute: async (params) => {
        const { city } = params as { city: string };
        return { result: `hello ${city}` };
      },
      format: (result) => (result as { result: string }).result,
    });

    expect(tool.name).toBe("test_tool");
    expect(tool.costTier).toBe("cheap");
    expect(tool.label).toBe("测试工具");
    expect(tool.description).toBe("测试用工具");
    expect(tool.parameters).toBe(mockSchema);
    expect(typeof tool.execute).toBe("function");
  });

  it("execute 应调用用户的 execute 函数并格式化结果", async () => {
    const tool = defineTool({
      name: "test_tool",
      label: "测试",
      description: "测试",
      parameters: mockSchema,
      execute: async (params) => {
        const { city } = params as { city: string };
        return { greeting: `你好 ${city}` };
      },
      format: (result) => (result as { greeting: string }).greeting,
    });

    const result = await tool.execute!("call-1", { city: "北京" });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect((result.content[0] as { text: string }).text).toBe("你好 北京");
  });

  it("execute 应捕获错误并返回降级消息", async () => {
    const tool = defineTool({
      name: "failing_tool",
      label: "失败工具",
      description: "会失败的工具",
      parameters: mockSchema,
      execute: async () => {
        throw new Error("API 不可用");
      },
      format: () => "never",
      errorHint: (params) => `建议使用 ${(params as { city: string }).city} 的本地数据`,
    });

    const result = await tool.execute!("call-1", { city: "上海" });

    expect(result.content).toHaveLength(1);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("失败工具");
    expect(text).toContain("API 不可用");
    expect(text).toContain("上海 的本地数据");
  });

  it("details 应默认合并 params 和 result", async () => {
    const tool = defineTool({
      name: "test_tool",
      label: "测试",
      description: "测试",
      parameters: mockSchema,
      execute: async (params) => {
        const { city } = params as { city: string };
        return { count: 42 };
      },
      format: () => "ok",
    });

    const result = await tool.execute!("call-1", { city: "广州" });

    expect(result.details).toEqual({ city: "广州", count: 42 });
  });

  it("details 应支持自定义函数", async () => {
    const tool = defineTool({
      name: "test_tool",
      label: "测试",
      description: "测试",
      parameters: mockSchema,
      execute: async () => ({ data: [1, 2, 3] }),
      format: () => "ok",
      details: (result, params) => ({
        custom: true,
        city: (params as { city: string }).city,
      }),
    });

    const result = await tool.execute!("call-1", { city: "深圳" });

    expect(result.details).toEqual({ custom: true, city: "深圳" });
  });
});
