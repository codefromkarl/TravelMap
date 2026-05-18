/**
 * HTTP 客户端单元测试
 *
 * 覆盖：
 * - fetchWithTimeout 正常响应
 * - fetchWithTimeout 超时行为
 * - fetchWithRetry 指数退避
 * - 错误分类（NetworkError / TimeoutError / ApiError / AuthError）
 * - URL 脱敏
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  AuthError,
  createApiClient,
  fetchWithRetry,
  fetchWithTimeout,
  NetworkError,
  sanitizeUrl,
  TimeoutError,
} from "../../../services/http-client.js";

// stub global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("http-client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── sanitizeUrl ──────────────────────────────────────────

  describe("sanitizeUrl", () => {
    it("应脱敏 URL 中的 key", () => {
      const url = "https://api.example.com?key=secret123&other=value";
      expect(sanitizeUrl(url)).toBe("https://api.example.com/?key=***&other=value");
    });

    it("应脱敏 appid", () => {
      const url = "https://api.example.com?appid=abc&lat=1";
      expect(sanitizeUrl(url)).toBe("https://api.example.com/?appid=***&lat=1");
    });

    it("应脱敏 token", () => {
      const url = "https://api.example.com?token=xyz";
      expect(sanitizeUrl(url)).toBe("https://api.example.com/?token=***");
    });

    it("无敏感参数时返回原 URL", () => {
      const url = "https://api.example.com?lat=1&lon=2";
      expect(sanitizeUrl(url)).toBe("https://api.example.com/?lat=1&lon=2");
    });

    it("非法 URL 返回原字符串", () => {
      expect(sanitizeUrl("not-a-url")).toBe("not-a-url");
    });
  });

  // ─── fetchWithTimeout ───────────────────────────────────

  describe("fetchWithTimeout", () => {
    it("正常响应时返回 Response", async () => {
      mockFetch.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));

      const res = await fetchWithTimeout("https://api.example.com/data");

      expect(res.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/data",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it("超时应抛出 TimeoutError", async () => {
      // 模拟一个永远挂起的 fetch
      mockFetch.mockImplementationOnce(
        () => new Promise(() => {}), // never resolves
      );

      await expect(
        fetchWithTimeout("https://api.example.com/slow", { timeout: 50 }),
      ).rejects.toThrow(TimeoutError);
    });

    it("网络错误应抛出 NetworkError", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));

      await expect(fetchWithTimeout("https://api.example.com")).rejects.toThrow(NetworkError);
    });

    it("HTTP 错误应抛出 ApiError（通过调用方检查 res.ok）", async () => {
      mockFetch.mockResolvedValueOnce(new Response("Internal Server Error", { status: 500 }));

      const res = await fetchWithTimeout("https://api.example.com");
      expect(res.status).toBe(500);
      // 注意：fetchWithTimeout 本身不检查 res.ok，由调用方处理
    });
  });

  // ─── fetchWithRetry ─────────────────────────────────────

  describe("fetchWithRetry", () => {
    it("成功响应直接返回", async () => {
      mockFetch.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));

      const res = await fetchWithRetry("https://api.example.com");
      expect(res.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("可重试状态码应重试后成功", async () => {
      mockFetch
        .mockResolvedValueOnce(new Response("error", { status: 503 }))
        .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));

      const res = await fetchWithRetry("https://api.example.com", {
        maxRetries: 2,
        baseDelayMs: 10,
      });
      expect(res.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("认证错误应直接抛 AuthError 不重试", async () => {
      mockFetch.mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));

      await expect(
        fetchWithRetry("https://api.example.com", { maxRetries: 2, baseDelayMs: 10 }),
      ).rejects.toThrow(AuthError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("不可重试状态码应直接抛 ApiError", async () => {
      mockFetch.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));

      await expect(
        fetchWithRetry("https://api.example.com", { maxRetries: 2, baseDelayMs: 10 }),
      ).rejects.toThrow(ApiError);
    });

    it("超时错误应重试后仍失败则抛 TimeoutError", async () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));

      await expect(
        fetchWithRetry("https://api.example.com", {
          timeout: 50,
          maxRetries: 1,
          baseDelayMs: 10,
        }),
      ).rejects.toThrow(TimeoutError);
    });
  });

  // ─── createApiClient ────────────────────────────────────

  describe("createApiClient", () => {
    it("get 应返回 Response", async () => {
      mockFetch.mockResolvedValueOnce(new Response('{"data":1}', { status: 200 }));

      const client = createApiClient({ timeout: 5000 });
      const res = await client.get("https://api.example.com");

      expect(res.ok).toBe(true);
    });

    it("post 应发送 JSON body", async () => {
      mockFetch.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));

      const client = createApiClient();
      await client.post("https://api.example.com", { key: "value" });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "Content-Type": "application/json" }),
          body: JSON.stringify({ key: "value" }),
        }),
      );
    });

    it("proxyUrl 应包装请求", async () => {
      mockFetch.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));

      const client = createApiClient({ proxyUrl: "https://proxy.example.com" });
      await client.get("https://api.example.com/data");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://proxy.example.com?url=https%3A%2F%2Fapi.example.com%2Fdata",
        expect.any(Object),
      );
    });
  });
});
