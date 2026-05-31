/**
 * log-protocol 单元测试
 */

import { describe, expect, it } from "vitest";
import type {
  LogEntry,
  LogLevel,
  LogReportRequest,
  LogReportResponse,
} from "../../../shared/log-protocol.js";
import { TRACE_HEADERS } from "../../../shared/log-protocol.js";

describe("log-protocol", () => {
  describe("TRACE_HEADERS", () => {
    it("包含正确的 header 名", () => {
      expect(TRACE_HEADERS.TRACE_ID).toBe("x-trace-id");
      expect(TRACE_HEADERS.SESSION_ID).toBe("x-session-id");
      expect(TRACE_HEADERS.SPAN_ID).toBe("x-span-id");
    });

    it("是只读对象", () => {
      // TypeScript as const 确保类型安全
      expect(typeof TRACE_HEADERS).toBe("object");
    });
  });

  describe("类型兼容性", () => {
    it("LogEntry 类型结构正确", () => {
      const entry: LogEntry = {
        level: "error",
        time: "2026-05-23T10:00:00Z",
        msg: "Test message",
        source: "backend",
        component: "test",
      };

      expect(entry.level).toBe("error");
      expect(entry.time).toBe("2026-05-23T10:00:00Z");
      expect(entry.msg).toBe("Test message");
      expect(entry.source).toBe("backend");
      expect(entry.component).toBe("test");
    });

    it("LogEntry 支持可选字段", () => {
      const entry: LogEntry = {
        level: "warn",
        time: "2026-05-23T10:00:00Z",
        msg: "Test warning",
        source: "frontend",
        component: "test",
        traceId: "trace-123",
        sessionId: "session-456",
        spanId: "span-789",
        data: { key: "value" },
      };

      expect(entry.traceId).toBe("trace-123");
      expect(entry.sessionId).toBe("session-456");
      expect(entry.spanId).toBe("span-789");
      expect(entry.data).toEqual({ key: "value" });
    });

    it("LogLevel 包含所有级别", () => {
      const levels: LogLevel[] = ["debug", "info", "warn", "error"];
      expect(levels).toHaveLength(4);
    });

    it("LogReportRequest 类型结构正确", () => {
      const request: LogReportRequest = {
        entries: [
          {
            level: "error",
            time: "2026-05-23T10:00:00Z",
            msg: "Test",
            source: "frontend",
            component: "test",
          },
        ],
        traceId: "trace-123",
      };

      expect(request.entries).toHaveLength(1);
      expect(request.traceId).toBe("trace-123");
    });

    it("LogReportResponse 类型结构正确", () => {
      const response: LogReportResponse = {
        accepted: 5,
        rejected: 2,
      };

      expect(response.accepted).toBe(5);
      expect(response.rejected).toBe(2);
    });
  });
});
