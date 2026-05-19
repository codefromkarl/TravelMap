/**
 * Error Utils 单元测试
 */

import { describe, expect, it } from "vitest";
import { createServiceError, withContext } from "../../../services/error-utils.js";

describe("error-utils", () => {
  describe("withContext", () => {
    it("应为 Error 附加上下文到 message", () => {
      const err = new Error("原始错误");
      const result = withContext(err, { operation: "search", city: "杭州" });
      expect(result.message).toContain("原始错误");
      expect(result.message).toContain('"operation":"search"');
      expect(result.message).toContain('"city":"杭州"');
    });

    it("应为非 Error 创建新的 Error", () => {
      const result = withContext("字符串错误", { service: "test" });
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toContain("字符串错误");
    });

    it("应保留原始调用栈", () => {
      const err = new Error("stack test");
      const originalStack = err.stack;
      const result = withContext(err, { operation: "test" });
      expect(result.stack).toBe(originalStack);
    });
  });

  describe("createServiceError", () => {
    it("应创建带上下文和 status 的 Error", () => {
      const err = createServiceError(
        "API 失败",
        { service: "google", endpoint: "/places" },
        { status: 502 },
      );
      expect(err.message).toBe("API 失败");
      expect((err as Error & { context: unknown }).context).toEqual({
        service: "google",
        endpoint: "/places",
      });
      expect((err as Error & { status: number }).status).toBe(502);
    });

    it("应支持 cause", () => {
      const cause = new Error("network");
      const err = createServiceError("失败", { service: "test" }, { cause });
      expect(err.cause).toBe(cause);
    });
  });
});
