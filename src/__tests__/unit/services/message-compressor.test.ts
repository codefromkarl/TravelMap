/**
 * MessageCompressor — 单元测试
 *
 * 测试策略:
 *   - 验证阈值内不压缩
 *   - 验证超过阈值后正确压缩
 *   - 验证摘要内容包含关键信息
 *   - 验证 token 估算
 */

import { describe, expect, it } from "vitest";
import {
  compressHistory,
  estimateMessageTokens,
  estimateTokens,
  getCompressionStats,
} from "../../../services/message-compressor.js";

describe("MessageCompressor", () => {
  describe("compressHistory", () => {
    it("消息数未达阈值时不应压缩", () => {
      const messages = [
        { role: "system", content: "system prompt" },
        { role: "user", content: "user 1" },
        { role: "assistant", content: "assistant 1" },
      ];

      const result = compressHistory(messages, { threshold: 6 });

      expect(result.compressed).toBe(false);
      expect(result.messages).toHaveLength(3);
    });

    it("超过阈值时应压缩旧消息", () => {
      const messages = [
        { role: "system", content: "system prompt" },
        { role: "user", content: "请规划北京3天旅行" },
        { role: "assistant", content: '{"city":"北京","days":3}' },
        { role: "toolResult", content: "tool result" },
        { role: "user", content: "第二天改去故宫" },
        { role: "assistant", content: "已修改" },
        { role: "user", content: "再加个长城" },
        { role: "assistant", content: "已添加" },
        { role: "user", content: "预算多少" },
      ];

      const result = compressHistory(messages, { threshold: 6, preserveRounds: 1 });

      expect(result.compressed).toBe(true);
      // system + summary + 最近 1 轮(3条)
      expect(result.messages.length).toBeLessThan(messages.length);
      expect(result.summary).toBeTruthy();
      expect(result.summary).toContain("北京");
    });

    it("应保留 system prompt", () => {
      const messages = [
        { role: "system", content: "你是旅行管家" },
        { role: "user", content: "user 1" },
        { role: "assistant", content: "assistant 1" },
        { role: "user", content: "user 2" },
        { role: "assistant", content: "assistant 2" },
        { role: "user", content: "user 3" },
        { role: "assistant", content: "assistant 3" },
        { role: "user", content: "user 4" },
        { role: "assistant", content: "assistant 4" },
      ];

      const result = compressHistory(messages, { threshold: 6, preserveRounds: 1 });

      expect(result.messages[0]!.role).toBe("system");
      expect(result.messages[0]!.content).toBe("你是旅行管家");
    });

    it("摘要应包含用户修改记录", () => {
      const messages = [
        { role: "system", content: "system" },
        { role: "user", content: "请规划北京旅行" },
        { role: "assistant", content: "好的" },
        { role: "user", content: "第二天换成文化景点" },
        { role: "assistant", content: "已修改" },
        { role: "user", content: "第三天加长城" },
        { role: "assistant", content: "已添加" },
        { role: "user", content: "预算多少" },
        { role: "assistant", content: "2000元" },
      ];

      const result = compressHistory(messages, { threshold: 6, preserveRounds: 1 });

      expect(result.compressed).toBe(true);
      expect(result.summary).toContain("第二天换成文化景点");
      expect(result.summary).toContain("第三天加长城");
    });

    it("数组格式的 content 应正确提取", () => {
      const messages = [
        { role: "system", content: "system" },
        { role: "user", content: [{ type: "text", text: "请规划上海旅行" }] },
        { role: "assistant", content: [{ type: "text", text: '{"city":"上海"}' }] },
        { role: "user", content: [{ type: "text", text: "加迪士尼" }] },
        { role: "assistant", content: [{ type: "text", text: "ok" }] },
        { role: "user", content: [{ type: "text", text: "加外滩" }] },
        { role: "assistant", content: [{ type: "text", text: "ok" }] },
        { role: "user", content: [{ type: "text", text: "加豫园" }] },
      ];

      const result = compressHistory(messages, { threshold: 6 });

      expect(result.compressed).toBe(true);
      expect(result.summary).toContain("上海");
    });

    it("无 system 消息时应正确处理", () => {
      const messages = [
        { role: "user", content: "user 1" },
        { role: "assistant", content: "assistant 1" },
        { role: "user", content: "user 2" },
        { role: "assistant", content: "assistant 2" },
        { role: "user", content: "user 3" },
        { role: "assistant", content: "assistant 3" },
        { role: "user", content: "user 4" },
        { role: "assistant", content: "assistant 4" },
      ];

      const result = compressHistory(messages, { threshold: 6 });

      expect(result.compressed).toBe(true);
      expect(result.messages[0]!.role).toBe("system"); // 压缩后添加的摘要
    });
  });

  describe("estimateTokens", () => {
    it("纯中文应按 chars/2 估算", () => {
      const text = "你好世界"; // 4 个中文字符
      expect(estimateTokens(text)).toBe(2);
    });

    it("纯英文应按 chars/4 估算", () => {
      const text = "hello world"; // 11 个字符
      expect(estimateTokens(text)).toBe(3); // ceil(11/4)
    });

    it("混合文本应取适当比例", () => {
      const text = "hello 世界"; // 7 字符：5 非中文 + 2 中文 + 0 JSON结构
      // 新估算: ceil(2/2) + ceil(5/4) = 1 + 2 = 3
      expect(estimateTokens(text)).toBe(3);
    });
  });

  describe("estimateMessageTokens", () => {
    it("应累加所有消息的 tokens", () => {
      const messages = [
        { role: "system", content: "system prompt" },
        { role: "user", content: "请规划旅行" },
      ];

      const tokens = estimateMessageTokens(messages);
      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe("getCompressionStats", () => {
    it("应计算压缩前后的 token 差异", () => {
      const original = [
        { role: "system", content: "system" },
        { role: "user", content: "请规划北京旅行" },
        { role: "assistant", content: "assistant reply with lots of content here" },
        { role: "user", content: "修改" },
        { role: "assistant", content: "done" },
      ];
      const compressed = [
        { role: "system", content: "system" },
        { role: "system", content: "[历史摘要] 用户请求: 请规划北京旅行" },
        { role: "user", content: "修改" },
        { role: "assistant", content: "done" },
      ];

      const stats = getCompressionStats(original, compressed);
      expect(stats.beforeTokens).toBeGreaterThan(stats.afterTokens);
      expect(stats.savedPercent).toBeGreaterThan(0);
    });
  });
});
