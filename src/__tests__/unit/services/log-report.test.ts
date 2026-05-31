/**
 * log-report 单元测试
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestOptions, onRequestPost } from "../../../services/log-report.js";

describe("log-report", () => {
  describe("onRequestOptions", () => {
    it("返回 204 状态码", () => {
      const response = onRequestOptions();
      expect(response.status).toBe(204);
    });

    it("包含 CORS headers", () => {
      const response = onRequestOptions();
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
      expect(response.headers.get("Access-Control-Allow-Headers")).toContain("Content-Type");
    });
  });

  describe("onRequestPost", () => {
    const mockContext = {
      request: new Request("https://example.com/api/log-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
      env: {},
    };

    it("接受有效的日志条目", async () => {
      const body = {
        entries: [
          {
            level: "error",
            time: "2026-05-23T10:00:00Z",
            msg: "Test error",
            component: "test",
          },
        ],
      };

      const request = new Request("https://example.com/api/log-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const response = await onRequestPost({ request, env: {} });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.accepted).toBe(1);
      expect(data.rejected).toBe(0);
    });

    it("接受 warn 级别日志", async () => {
      const body = {
        entries: [
          {
            level: "warn",
            time: "2026-05-23T10:00:00Z",
            msg: "Test warning",
            component: "test",
          },
        ],
      };

      const request = new Request("https://example.com/api/log-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const response = await onRequestPost({ request, env: {} });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.accepted).toBe(1);
      expect(data.rejected).toBe(0);
    });

    it("拒绝非 warn/error 级别日志", async () => {
      const body = {
        entries: [
          {
            level: "info",
            time: "2026-05-23T10:00:00Z",
            msg: "Test info",
            component: "test",
          },
        ],
      };

      const request = new Request("https://example.com/api/log-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const response = await onRequestPost({ request, env: {} });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.accepted).toBe(0);
      expect(data.rejected).toBe(1);
    });

    it("拒绝缺少必填字段的条目", async () => {
      const body = {
        entries: [
          {
            level: "error",
            // 缺少 time 和 msg
          },
        ],
      };

      const request = new Request("https://example.com/api/log-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const response = await onRequestPost({ request, env: {} });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.accepted).toBe(0);
      expect(data.rejected).toBe(1);
    });

    it("返回 400 当 entries 不是数组", async () => {
      const body = { entries: "not-an-array" };

      const request = new Request("https://example.com/api/log-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const response = await onRequestPost({ request, env: {} });

      expect(response.status).toBe(400);
    });

    it("返回 500 当请求体无效 JSON", async () => {
      const request = new Request("https://example.com/api/log-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid-json",
      });

      const response = await onRequestPost({ request, env: {} });

      expect(response.status).toBe(500);
    });

    it("使用 header 中的 traceId", async () => {
      const body = {
        entries: [
          {
            level: "error",
            time: "2026-05-23T10:00:00Z",
            msg: "Test error",
            component: "test",
          },
        ],
      };

      const request = new Request("https://example.com/api/log-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-trace-id": "header-trace-id",
        },
        body: JSON.stringify(body),
      });

      const response = await onRequestPost({ request, env: {} });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.accepted).toBe(1);
    });

    it("处理多个条目（混合有效和无效）", async () => {
      const body = {
        entries: [
          {
            level: "error",
            time: "2026-05-23T10:00:00Z",
            msg: "Valid error",
            component: "test",
          },
          {
            level: "info",
            time: "2026-05-23T10:00:00Z",
            msg: "Invalid info",
            component: "test",
          },
          {
            level: "warn",
            time: "2026-05-23T10:00:00Z",
            msg: "Valid warning",
            component: "test",
          },
        ],
      };

      const request = new Request("https://example.com/api/log-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const response = await onRequestPost({ request, env: {} });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.accepted).toBe(2);
      expect(data.rejected).toBe(1);
    });
  });
});
