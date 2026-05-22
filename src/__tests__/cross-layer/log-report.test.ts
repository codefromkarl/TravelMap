/**
 * 前端日志上报集成测试
 *
 * 验证前端 warn/error 日志能正确上报到后端：
 *   1. /api/logs 端点接受 LogReportRequest
 *   2. 只接受 warn/error 级别
 *   3. 响应包含 accepted/rejected 计数
 *   4. CORS headers 正确设置
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  onRequestPost,
  onRequestOptions,
} from "../../../web/functions/api/logs.js";
import type { LogReportRequest } from "../../../shared/log-protocol.js";

// ─── Mock Request Helper ─────────────────────────────────

function createLogRequest(
  entries: LogReportRequest["entries"],
  options: { traceId?: string; method?: string } = {}
): Request {
  const headers = new Headers({
    "Content-Type": "application/json",
  });

  if (options.traceId) {
    headers.set("x-trace-id", options.traceId);
  }

  return new Request("https://example.com/api/logs", {
    method: options.method || "POST",
    headers,
    body: JSON.stringify({ entries, traceId: options.traceId }),
  });
}

// ─── Tests ────────────────────────────────────────────────

describe("OPTIONS /api/logs (CORS)", () => {
  it("应返回 204 + CORS headers", () => {
    const response = onRequestOptions();
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });
});

describe("POST /api/logs", () => {
  it("应接受有效的 warn 日志", async () => {
    const request = createLogRequest([
      {
        level: "warn",
        time: new Date().toISOString(),
        msg: "Test warning",
        source: "frontend",
        component: "chat",
      },
    ]);

    const response = await onRequestPost({ request, env: {} });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.accepted).toBe(1);
    expect(body.rejected).toBe(0);
  });

  it("应接受有效的 error 日志", async () => {
    const request = createLogRequest([
      {
        level: "error",
        time: new Date().toISOString(),
        msg: "Test error",
        source: "frontend",
        component: "map",
        traceId: "trace_test123",
      },
    ]);

    const response = await onRequestPost({ request, env: {} });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.accepted).toBe(1);
  });

  it("应拒绝 debug/info 级别日志", async () => {
    const request = createLogRequest([
      {
        level: "debug",
        time: new Date().toISOString(),
        msg: "Debug message",
        source: "frontend",
        component: "app",
      },
      {
        level: "info",
        time: new Date().toISOString(),
        msg: "Info message",
        source: "frontend",
        component: "app",
      },
    ]);

    const response = await onRequestPost({ request, env: {} });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.accepted).toBe(0);
    expect(body.rejected).toBe(2);
  });

  it("应混合处理不同级别日志", async () => {
    const request = createLogRequest([
      {
        level: "debug",
        time: new Date().toISOString(),
        msg: "Should be rejected",
        source: "frontend",
        component: "app",
      },
      {
        level: "warn",
        time: new Date().toISOString(),
        msg: "Should be accepted",
        source: "frontend",
        component: "chat",
      },
      {
        level: "error",
        time: new Date().toISOString(),
        msg: "Should be accepted",
        source: "frontend",
        component: "map",
      },
    ]);

    const response = await onRequestPost({ request, env: {} });
    const body = await response.json();

    expect(body.accepted).toBe(2);
    expect(body.rejected).toBe(1);
  });

  it("应从 header 提取 traceId", async () => {
    const request = createLogRequest(
      [
        {
          level: "warn",
          time: new Date().toISOString(),
          msg: "Test",
          source: "frontend",
          component: "app",
          // 不设置 traceId，应从 header 获取
        },
      ],
      { traceId: "trace_from_header" }
    );

    const response = await onRequestPost({ request, env: {} });
    expect(response.status).toBe(200);
  });

  it("缺少 entries 数组应返回 400", async () => {
    const request = new Request("https://example.com/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invalid: true }),
    });

    const response = await onRequestPost({ request, env: {} });
    expect(response.status).toBe(400);
  });

  it("缺少必填字段应 rejected", async () => {
    const request = createLogRequest([
      {
        level: "warn",
        // 缺少 time
        msg: "Test",
        source: "frontend",
        component: "app",
      } as any,
    ]);

    const response = await onRequestPost({ request, env: {} });
    const body = await response.json();

    expect(body.accepted).toBe(0);
    expect(body.rejected).toBe(1);
  });

  it("应返回 CORS headers", async () => {
    const request = createLogRequest([]);

    const response = await onRequestPost({ request, env: {} });

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Content-Type")).toBe("application/json");
  });
});
