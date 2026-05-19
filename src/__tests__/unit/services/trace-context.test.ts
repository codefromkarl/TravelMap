/**
 * Trace Context 单元测试
 */

import { describe, expect, it } from "vitest";
import {
  createChildSpan,
  generateSpanId,
  generateTraceId,
  getTrace,
  runWithTrace,
} from "../../../services/trace-context.js";

describe("trace-context", () => {
  describe("generateTraceId", () => {
    it("应生成以 trace_ 开头的 ID", () => {
      const id = generateTraceId();
      expect(id).toMatch(/^trace_[a-z0-9]+_[a-z0-9]+$/);
    });

    it("每次调用应生成不同 ID", () => {
      const id1 = generateTraceId();
      const id2 = generateTraceId();
      expect(id1).not.toBe(id2);
    });
  });

  describe("generateSpanId", () => {
    it("应生成以 span_ 开头的 ID", () => {
      const id = generateSpanId();
      expect(id).toMatch(/^span_[a-z0-9]+$/);
    });
  });

  describe("runWithTrace", () => {
    it("应在异步函数内可获取 trace context", async () => {
      const ctx = { traceId: "trace_123", spanId: "span_1", operation: "test" };
      await runWithTrace(ctx, async () => {
        expect(getTrace()).toEqual(ctx);
      });
    });

    it("应正确返回异步结果", async () => {
      const ctx = { traceId: "trace_123", spanId: "span_1", operation: "test" };
      const result = await runWithTrace(ctx, async () => "hello");
      expect(result).toBe("hello");
    });

    it("嵌套调用应隔离上下文", async () => {
      const outer = { traceId: "trace_outer", spanId: "span_outer", operation: "outer" };
      await runWithTrace(outer, async () => {
        expect(getTrace()?.traceId).toBe("trace_outer");

        const inner = { traceId: "trace_inner", spanId: "span_inner", operation: "inner" };
        await runWithTrace(inner, async () => {
          expect(getTrace()?.traceId).toBe("trace_inner");
        });

        // 外层上下文应恢复
        expect(getTrace()?.traceId).toBe("trace_outer");
      });
    });

    it("无上下文时应返回 undefined", () => {
      expect(getTrace()).toBeUndefined();
    });
  });

  describe("createChildSpan", () => {
    it("无父上下文时应生成新的 traceId", () => {
      const child = createChildSpan("search");
      expect(child.traceId).toMatch(/^trace_/);
      expect(child.spanId).toMatch(/^span_/);
      expect(child.operation).toBe("search");
      expect(child.parentSpanId).toBeUndefined();
    });

    it("有父上下文时应继承 traceId", async () => {
      const parent = { traceId: "trace_parent", spanId: "span_parent", operation: "planTrip" };
      await runWithTrace(parent, async () => {
        const child = createChildSpan("search_attractions");
        expect(child.traceId).toBe("trace_parent");
        expect(child.parentSpanId).toBe("span_parent");
        expect(child.operation).toBe("search_attractions");
      });
    });

    it("应合并 base 参数", () => {
      const child = createChildSpan("search", { city: "杭州", userId: "u1" });
      expect(child.city).toBe("杭州");
      expect(child.userId).toBe("u1");
    });
  });
});
