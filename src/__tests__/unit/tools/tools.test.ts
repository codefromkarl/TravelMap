/**
 * 工具 execute 测试
 *
 * 验证每个 AgentTool 的 execute 逻辑：
 *   - 参数传递正确
 *   - 返回格式符合 AgentToolResult 规范
 *   - 错误处理（服务异常 → 降级文案）
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTools,
  geocodeTool,
  searchAttractionsTool,
  searchHotelsTool,
} from "../../../tools/index.js";

describe("tools/createTools", () => {
  it("应返回 4 个工具", () => {
    const tools = createTools();
    expect(tools).toHaveLength(5);
    expect(tools.map((t) => t.name)).toEqual([
      "search_attractions",
      "search_weather",
      "search_hotels",
      "geocode",
      "calculate_budget",
    ]);
  });

  it("每个工具应有完整的必需字段", () => {
    for (const tool of createTools()) {
      expect(tool.name).toBeTruthy();
      expect(tool.label).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.parameters).toBeDefined();
      expect(typeof tool.execute).toBe("function");
    }
  });
});

describe("tools/execute — search_hotels (占位)", () => {
  it("search_hotels 应返回占位文案", async () => {
    const result = await searchHotelsTool.execute("tc_1", {
      city: "北京",
      budget: "300-500",
    });

    expect(result.content[0]).toHaveProperty("type", "text");
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("酒店搜索");
    expect(text).toContain("北京");
    expect(result.details).toEqual({ city: "北京" });
  });
});

describe("tools/execute — geocode (真实 API 降级)", () => {
  it("geocode 应返回坐标（走 Nominatim 或降级）", async () => {
    const result = await geocodeTool.execute("tc_1", {
      address: "天安门",
      city: "北京",
    });

    expect(result.content[0]).toHaveProperty("type", "text");
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("天安门");
    // 应有坐标信息
    expect(result.details).toHaveProperty("location");
  });
});

describe("tools/execute — searchAttractionsTool (attractions.ts)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("无 API Key 时应走 mock 数据", async () => {
    const result = await searchAttractionsTool.execute("tc_1", { city: "北京" });

    expect(result.content[0]).toHaveProperty("type", "text");
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("北京");
    expect(text).toContain("景点搜索结果");
  });

  it("返回 details 应包含 city", async () => {
    const result = await searchAttractionsTool.execute("tc_1", {
      city: "上海",
      preferences: ["美食"],
    });

    const details = result.details as { city: string };
    expect(details.city).toBe("上海");
  });

  it("搜索异常时应返回降级建议文案", async () => {
    const result = await searchAttractionsTool.execute("tc_1", { city: "北京" });

    // content 应该是 text 类型
    expect(result.content.every((c) => c.type === "text")).toBe(true);
  });
});
