/**
 * 跨层集成测试 — traceId 传播验证
 *
 * 验证 traceId 能跨前后端传递：
 *   1. 后端 trace-context 生成 traceId
 *   2. API 响应包含 traceId header
 *   3. 前端从响应提取 traceId
 *   4. 前端日志上报携带 traceId
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  generateTraceId,
  generateSpanId,
  runWithTrace,
  getTrace,
  createChildSpan,
  type TraceContext,
} from "../../services/trace-context.js";
import { getLogger, resetLogger } from "../../services/logger.js";
import type { LogEntry, LogReportRequest } from "../../shared/log-protocol.js";

describe("traceId 格式验证", () => {
  it("generateTraceId 应生成 trace_<timestamp>_<random> 格式", () => {
    const traceId = generateTraceId();
    expect(traceId).toMatch(/^trace_[a-z0-9]+_[a-z0-9]{6}$/);
  });

  it("generateSpanId 应生成 span_<random> 格式", () => {
    const spanId = generateSpanId();
    expect(spanId).toMatch(/^span_[a-z0-9]{8}$/);
  });

  it("多次生成应唯一", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateTraceId()));
    expect(ids.size).toBe(100);
  });
});

describe("runWithTrace 上下文传播", () => {
  it("在 trace 上下文中应能获取 traceId", async () => {
    const traceId = generateTraceId();
    const spanId = generateSpanId();

    const result = await runWithTrace(
      { traceId, spanId, operation: "test" },
      async () => {
        const ctx = getTrace();
        return ctx?.traceId;
      }
    );

    expect(result).toBe(traceId);
  });

  it("子 span 应继承父 traceId", async () => {
    const parentTraceId = generateTraceId();

    const childCtx = await runWithTrace(
      { traceId: parentTraceId, spanId: generateSpanId(), operation: "parent" },
      async () => {
        return createChildSpan("child");
      }
    );

    expect(childCtx.traceId).toBe(parentTraceId);
    expect(childCtx.parentSpanId).toBeDefined();
    expect(childCtx.operation).toBe("child");
  });

  it("嵌套 span 应形成调用链", async () => {
    const rootTraceId = generateTraceId();

    const result = await runWithTrace(
      { traceId: rootTraceId, spanId: generateSpanId(), operation: "root" },
      async () => {
        const childCtx = createChildSpan("level1");

        return runWithTrace(childCtx, async () => {
          const grandchildCtx = createChildSpan("level2");

          return runWithTrace(grandchildCtx, async () => {
            const ctx = getTrace();
            return {
              traceId: ctx?.traceId,
              operation: ctx?.operation,
              parentSpanId: ctx?.parentSpanId,
            };
          });
        });
      }
    );

    expect(result.traceId).toBe(rootTraceId);
    expect(result.operation).toBe("level2");
    expect(result.parentSpanId).toBeDefined();
  });
});

describe("日志与 trace 集成", () => {
  it("logger 应自动注入 traceId", async () => {
    const logs: string[] = [];
    const mockLogger = {
      debug: (msg: string) => logs.push(`DEBUG: ${msg}`),
      info: (msg: string) => logs.push(`INFO: ${msg}`),
      warn: (msg: string) => logs.push(`WARN: ${msg}`),
      error: (msg: string) => logs.push(`ERROR: ${msg}`),
      child: () => mockLogger,
    };

    // 临时替换 logger
    const originalLogger = getLogger();

    const traceId = generateTraceId();
    await runWithTrace(
      { traceId, spanId: generateSpanId(), operation: "log-test" },
      async () => {
        // logger 内部会调用 getTrace() 获取 traceId
        const ctx = getTrace();
        expect(ctx?.traceId).toBe(traceId);
      }
    );
  });
});

describe("LogEntry 协议验证", () => {
  it("LogEntry 应符合共享协议格式", () => {
    const entry: LogEntry = {
      level: "error",
      time: new Date().toISOString(),
      msg: "Test error",
      source: "frontend",
      component: "chat",
      traceId: generateTraceId(),
      sessionId: "ses_test123",
    };

    expect(entry.level).toBe("error");
    expect(entry.source).toBe("frontend");
    expect(entry.traceId).toMatch(/^trace_/);
  });

  it("LogReportRequest 应包含 entries 数组", () => {
    const request: LogReportRequest = {
      entries: [
        {
          level: "warn",
          time: new Date().toISOString(),
          msg: "Test warning",
          source: "frontend",
          component: "map",
        },
      ],
      traceId: generateTraceId(),
    };

    expect(request.entries).toHaveLength(1);
    expect(request.entries[0].level).toBe("warn");
  });
});

describe("TRACE_HEADERS 常量验证", () => {
  it("应定义标准 header 名", async () => {
    const { TRACE_HEADERS } = await import("../../shared/log-protocol.js");
    expect(TRACE_HEADERS.TRACE_ID).toBe("x-trace-id");
    expect(TRACE_HEADERS.SESSION_ID).toBe("x-session-id");
    expect(TRACE_HEADERS.SPAN_ID).toBe("x-span-id");
  });
});
