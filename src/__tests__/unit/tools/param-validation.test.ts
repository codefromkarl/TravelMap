/**
 * 参数验证单元测试
 *
 * 测试 TypeBox schema 的参数验证功能，包括：
 * 1. 基本类型验证
 * 2. 必填/可选字段验证
 * 3. 类型强制转换
 * 4. 错误消息格式
 */

import type { Tool, ToolCall } from "@earendil-works/pi-ai";
import { Type, validateToolArguments } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";

// 辅助函数：创建工具调用
function createToolCall(
  schema: Tool["parameters"],
  args: Record<string, unknown>,
): { tool: Tool; toolCall: ToolCall } {
  const tool: Tool = {
    name: "test_tool",
    description: "测试工具",
    parameters: schema,
  };

  const toolCall: ToolCall = {
    type: "toolCall",
    id: "test-call-1",
    name: "test_tool",
    arguments: args,
  };

  return { tool, toolCall };
}

describe("参数验证", () => {
  describe("基本类型验证", () => {
    it("应验证字符串类型", () => {
      const schema = Type.Object({
        name: Type.String(),
      });

      // 有效参数
      const { tool: tool1, toolCall: call1 } = createToolCall(schema, { name: "杭州" });
      expect(validateToolArguments(tool1, call1)).toEqual({ name: "杭州" });

      // 无效参数（数字）
      const { tool: tool2, toolCall: call2 } = createToolCall(schema, { name: 123 });
      // TypeBox 会尝试强制转换
      expect(validateToolArguments(tool2, call2)).toEqual({ name: "123" });
    });

    it("应验证数字类型", () => {
      const schema = Type.Object({
        count: Type.Number(),
      });

      // 有效参数
      const { tool: tool1, toolCall: call1 } = createToolCall(schema, { count: 5 });
      expect(validateToolArguments(tool1, call1)).toEqual({ count: 5 });

      // 字符串数字会被强制转换
      const { tool: tool2, toolCall: call2 } = createToolCall(schema, { count: "10" });
      expect(validateToolArguments(tool2, call2)).toEqual({ count: 10 });

      // 非数字字符串应抛出错误
      const { tool: tool3, toolCall: call3 } = createToolCall(schema, { count: "abc" });
      expect(() => validateToolArguments(tool3, call3)).toThrow("Validation failed");
    });

    it("应验证布尔类型", () => {
      const schema = Type.Object({
        enabled: Type.Boolean(),
      });

      // 有效参数
      const { tool: tool1, toolCall: call1 } = createToolCall(schema, { enabled: true });
      expect(validateToolArguments(tool1, call1)).toEqual({ enabled: true });

      // 字符串 "true" 会被强制转换
      const { tool: tool2, toolCall: call2 } = createToolCall(schema, { enabled: "true" });
      expect(validateToolArguments(tool2, call2)).toEqual({ enabled: true });

      // 字符串 "false" 会被强制转换
      const { tool: tool3, toolCall: call3 } = createToolCall(schema, { enabled: "false" });
      expect(validateToolArguments(tool3, call3)).toEqual({ enabled: false });
    });
  });

  describe("必填/可选字段验证", () => {
    it("应验证必填字段", () => {
      const schema = Type.Object({
        city: Type.String(),
        days: Type.Number(),
      });

      // 缺少必填字段
      const { tool, toolCall } = createToolCall(schema, { city: "杭州" });
      expect(() => validateToolArguments(tool, toolCall)).toThrow("Validation failed");
    });

    it("应允许可选字段缺失", () => {
      const schema = Type.Object({
        city: Type.String(),
        preferences: Type.Optional(Type.Array(Type.String())),
      });

      // 可选字段缺失
      const { tool: tool1, toolCall: call1 } = createToolCall(schema, { city: "杭州" });
      expect(validateToolArguments(tool1, call1)).toEqual({ city: "杭州" });

      // 可选字段存在
      const { tool: tool2, toolCall: call2 } = createToolCall(schema, {
        city: "杭州",
        preferences: ["美食", "历史"],
      });
      expect(validateToolArguments(tool2, call2)).toEqual({
        city: "杭州",
        preferences: ["美食", "历史"],
      });
    });
  });

  describe("复杂类型验证", () => {
    it("应验证数组类型", () => {
      const schema = Type.Object({
        items: Type.Array(Type.String()),
      });

      // 有效数组
      const { tool: tool1, toolCall: call1 } = createToolCall(schema, {
        items: ["a", "b", "c"],
      });
      expect(validateToolArguments(tool1, call1)).toEqual({ items: ["a", "b", "c"] });

      // 非数组应抛出错误（使用对象，因为基本类型可能被强制转换）
      const { tool: tool2, toolCall: call2 } = createToolCall(schema, { items: { key: "value" } });
      expect(() => validateToolArguments(tool2, call2)).toThrow("Validation failed");
    });

    it("应验证嵌套对象", () => {
      const schema = Type.Object({
        city: Type.String(),
        location: Type.Object({
          lat: Type.Number(),
          lng: Type.Number(),
        }),
      });

      // 有效嵌套对象
      const { tool: tool1, toolCall: call1 } = createToolCall(schema, {
        city: "杭州",
        location: { lat: 30.25, lng: 120.15 },
      });
      expect(validateToolArguments(tool1, call1)).toEqual({
        city: "杭州",
        location: { lat: 30.25, lng: 120.15 },
      });

      // 嵌套对象类型错误
      const { tool: tool2, toolCall: call2 } = createToolCall(schema, {
        city: "杭州",
        location: { lat: "30.25", lng: "120.15" },
      });
      // 字符串数字会被强制转换
      expect(validateToolArguments(tool2, call2)).toEqual({
        city: "杭州",
        location: { lat: 30.25, lng: 120.15 },
      });
    });
  });

  describe("实际工具 schema 验证", () => {
    it("应验证景点搜索工具参数", () => {
      // 模拟 search_attractions 工具的 schema
      const schema = Type.Object({
        city: Type.String({ description: "城市名称" }),
        preferences: Type.Optional(
          Type.Array(Type.String(), {
            description: "兴趣偏好标签，如 '历史文化', '美食', '自然风光'",
          }),
        ),
        keywords: Type.Optional(Type.String({ description: "额外搜索关键词" })),
      });

      // 有效参数
      const { tool: tool1, toolCall: call1 } = createToolCall(schema, {
        city: "杭州",
        preferences: ["历史文化", "美食"],
        keywords: "西湖",
      });
      expect(validateToolArguments(tool1, call1)).toEqual({
        city: "杭州",
        preferences: ["历史文化", "美食"],
        keywords: "西湖",
      });

      // 只有必填参数
      const { tool: tool2, toolCall: call2 } = createToolCall(schema, { city: "北京" });
      expect(validateToolArguments(tool2, call2)).toEqual({ city: "北京" });

      // 缺少必填参数
      const { tool: tool3, toolCall: call3 } = createToolCall(schema, {
        preferences: ["美食"],
      });
      expect(() => validateToolArguments(tool3, call3)).toThrow("Validation failed");
    });

    it("应验证预算计算工具参数", () => {
      // 模拟 calculate_budget 工具的 schema
      const AttractionSchema = Type.Object({
        name: Type.String(),
        ticketPrice: Type.Number(),
      });

      const MealSchema = Type.Object({
        type: Type.String(),
        name: Type.String(),
        estimatedCost: Type.Number(),
      });

      const DayPlanSchema = Type.Object({
        date: Type.String(),
        dayIndex: Type.Number(),
        city: Type.String(),
        attractions: Type.Array(AttractionSchema),
        meals: Type.Array(MealSchema),
      });

      const schema = Type.Object({
        days: Type.Array(DayPlanSchema),
        budgetLimit: Type.Optional(Type.Number()),
      });

      // 有效参数
      const { tool: tool1, toolCall: call1 } = createToolCall(schema, {
        days: [
          {
            date: "2026-05-20",
            dayIndex: 1,
            city: "杭州",
            attractions: [{ name: "西湖", ticketPrice: 0 }],
            meals: [{ type: "lunch", name: "楼外楼", estimatedCost: 100 }],
          },
        ],
        budgetLimit: 1000,
      });
      expect(validateToolArguments(tool1, call1)).toEqual({
        days: [
          {
            date: "2026-05-20",
            dayIndex: 1,
            city: "杭州",
            attractions: [{ name: "西湖", ticketPrice: 0 }],
            meals: [{ type: "lunch", name: "楼外楼", estimatedCost: 100 }],
          },
        ],
        budgetLimit: 1000,
      });

      // 缺少必填字段
      const { tool: tool2, toolCall: call2 } = createToolCall(schema, { budgetLimit: 1000 });
      expect(() => validateToolArguments(tool2, call2)).toThrow("Validation failed");
    });
  });

  describe("错误消息格式", () => {
    it("应提供清晰的错误消息", () => {
      const schema = Type.Object({
        city: Type.String(),
        days: Type.Number(),
      });

      const { tool, toolCall } = createToolCall(schema, { city: "杭州" });

      try {
        validateToolArguments(tool, toolCall);
        expect.fail("应抛出验证错误");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const message = (error as Error).message;
        expect(message).toContain("Validation failed");
        expect(message).toContain("test_tool");
        expect(message).toContain("days");
      }
    });
  });
});
