/**
 * Error Utils 单元测试
 */

import { describe, expect, it } from "vitest";
import { ContextualError, createServiceError, withContext } from "../../../services/error-utils.js";

describe("error-utils", () => {
  describe("withContext", () => {
    it("应创建 ContextualError 附加上下文（不修改原始 Error）", () => {
      const err = new Error("原始错误");
      const result = withContext(err, { operation: "search", city: "杭州" });
      expect(result).toBeInstanceOf(ContextualError);
      expect(result.message).toBe("原始错误");
      expect(result.context).toEqual({ operation: "search", city: "杭州" });
      // 原始 Error 不被修改
      expect(err.message).toBe("原始错误");
    });

    it("应为非 Error 创建 ContextualError", () => {
      const result = withContext("字符串错误", { service: "test" });
      expect(result).toBeInstanceOf(ContextualError);
      expect(result.message).toBe("字符串错误");
    });

    it("应通过 cause 链保留原始错误", () => {
      const err = new Error("stack test");
      const result = withContext(err, { operation: "test" });
      expect(result.cause).toBe(err);
      expect(result.originalMessage).toBe("stack test");
    });

    it("应支持多层嵌套不膨胀", () => {
      const err = new Error("original");
      const layer1 = withContext(err, { service: "a" });
      const layer2 = withContext(layer1, { operation: "b" });
      // 消息不膨胀
      expect(layer2.message).toBe("original");
      // cause 链完整
      expect(layer2.cause).toBe(layer1);
      expect((layer2.cause as ContextualError).cause).toBe(err);
    });
  });

  describe("createServiceError", () => {
    it("应创建带上下文和 status 的 ContextualError", () => {
      const err = createServiceError(
        "API 失败",
        { service: "google", endpoint: "/places" },
        { status: 502 },
      );
      expect(err).toBeInstanceOf(ContextualError);
      expect(err.message).toBe("API 失败");
      expect(err.context).toEqual({ service: "google", endpoint: "/places" });
      expect((err as ContextualError & { status: number }).status).toBe(502);
    });

    it("应支持 cause", () => {
      const cause = new Error("network");
      const err = createServiceError("失败", { service: "test" }, { cause });
      expect(err.cause).toBe(cause);
    });
  });
});
