/**
 * 会话持久化服务测试
 */

import { describe, expect, it } from "vitest";
import {
  createPersistedTrip,
  extractSummary,
  extractTitle,
  isValidMessages,
} from "../../../services/session-persist-service.js";

describe("extractTitle", () => {
  it("从目的地字段提取标题", () => {
    const content = "**目的地**: 北京\n**日期**: 2025-06-01 至 2025-06-03";
    expect(extractTitle(content)).toContain("北京");
  });

  it("从目的地+日期提取完整标题", () => {
    const content = "**目的地**: 上海\n\n**日期**: 2025-07-01 至 2025-07-05";
    const title = extractTitle(content);
    expect(title).toContain("上海");
    expect(title).toContain("2025-07-01");
    expect(title).toContain("2025-07-05");
  });

  it("从 markdown 标题提取", () => {
    const content = "# 北京 3日行程\n## Day 1";
    expect(extractTitle(content)).toContain("北京");
  });

  it("无匹配时截取前30字", () => {
    const content = "这是一段普通文本没有任何特殊标记但足够长";
    const title = extractTitle(content);
    expect(title.length).toBeLessThanOrEqual(50);
  });

  it("空内容返回默认标题", () => {
    expect(extractTitle("")).toBe("未命名行程");
  });
});

describe("extractSummary", () => {
  it("去除 markdown 标记", () => {
    const content = "## 标题\n\n**加粗**文本\n\n普通文本";
    const summary = extractSummary(content);
    expect(summary).not.toContain("##");
    expect(summary).not.toContain("**");
  });

  it("截取前100字", () => {
    const content = "a".repeat(200);
    expect(extractSummary(content).length).toBeLessThanOrEqual(100);
  });
});

describe("isValidMessages", () => {
  it("有效消息数组", () => {
    const messages = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ];
    expect(isValidMessages(messages)).toBe(true);
  });

  it("空数组无效", () => {
    expect(isValidMessages([])).toBe(false);
  });

  it("缺少 role 字段无效", () => {
    expect(isValidMessages([{ content: "hello" }])).toBe(false);
  });

  it("非数组无效", () => {
    expect(isValidMessages("not array" as unknown as unknown[])).toBe(false);
  });
});

describe("createPersistedTrip", () => {
  it("创建完整记录", () => {
    const trip = createPersistedTrip("test-id", "**目的地**: 北京", [
      { role: "user", content: "规划北京行程" },
    ]);
    expect(trip.id).toBe("test-id");
    expect(trip.title).toContain("北京");
    expect(trip.messages).toHaveLength(1);
    expect(trip.createdAt).toBeTruthy();
    expect(trip.updatedAt).toBeTruthy();
  });
});
