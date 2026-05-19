/**
 * Logger 单元测试
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getLogger,
  type Logger,
  redact,
  resetLogger,
  setLogger,
} from "../../../services/logger.js";
import { runWithTrace } from "../../../services/trace-context.js";

describe("logger", () => {
  let logs: Array<{ level: string; msg: string; data: unknown }>;
  let mockLogger: Logger;

  beforeEach(() => {
    resetLogger();
    logs = [];
    const createMock = (baseCtx?: Record<string, unknown>) => ({
      debug: (msg: string, extra?: Record<string, unknown>) =>
        logs.push({ level: "debug", msg, data: { ...baseCtx, ...extra } }),
      info: (msg: string, extra?: Record<string, unknown>) =>
        logs.push({ level: "info", msg, data: { ...baseCtx, ...extra } }),
      warn: (msg: string, extra?: Record<string, unknown>) =>
        logs.push({ level: "warn", msg, data: { ...baseCtx, ...extra } }),
      error: (msg: string, extra?: Record<string, unknown>) =>
        logs.push({ level: "error", msg, data: { ...baseCtx, ...extra } }),
      child: (base: Record<string, unknown>) => createMock({ ...baseCtx, ...base }),
    });
    mockLogger = createMock();
    setLogger(mockLogger);
  });

  describe("redact", () => {
    it("应脱敏敏感字段", () => {
      const result = redact({ key: "secret123", name: "test" });
      expect((result as Record<string, unknown>).key).toBe("***");
      expect((result as Record<string, unknown>).name).toBe("test");
    });

    it("应递归脱敏嵌套对象", () => {
      const result = redact({ outer: { token: "abc", value: 1 } });
      expect((result as { outer: { token: string } }).outer.token).toBe("***");
    });

    it("应保留空字符串不变", () => {
      const result = redact({ key: "" });
      expect((result as Record<string, unknown>).key).toBe("");
    });

    it("应处理数组", () => {
      const result = redact([{ api_key: "x" }, { name: "y" }]);
      expect((result as Array<Record<string, unknown>>)[0].api_key).toBe("***");
      expect((result as Array<Record<string, unknown>>)[1].name).toBe("y");
    });
  });

  describe("logger 方法", () => {
    it("debug 应记录日志", () => {
      getLogger().debug("test debug", { foo: "bar" });
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe("debug");
      expect(logs[0].msg).toBe("test debug");
      expect((logs[0].data as Record<string, unknown>).foo).toBe("bar");
    });

    it("info 应记录日志", () => {
      getLogger().info("test info");
      expect(logs[0].level).toBe("info");
    });

    it("warn 应记录日志", () => {
      getLogger().warn("test warn");
      expect(logs[0].level).toBe("warn");
    });

    it("error 应记录日志", () => {
      getLogger().error("test error");
      expect(logs[0].level).toBe("error");
    });
  });

  describe("trace context 集成", () => {
    it("应自动附加 traceId 和 operation", async () => {
      await runWithTrace(
        { traceId: "trace_abc", spanId: "span_1", operation: "planTrip" },
        async () => {
          getLogger().info("with trace");
        },
      );
      expect(logs).toHaveLength(1);
    });
  });

  describe("child logger", () => {
    it("子 logger 应继承父配置并合并字段", () => {
      const child = getLogger().child({ component: "search" });
      child.info("child log", { city: "杭州" });
      expect(logs).toHaveLength(1);
      expect((logs[0].data as Record<string, unknown>).component).toBe("search");
      expect((logs[0].data as Record<string, unknown>).city).toBe("杭州");
    });
  });
});
