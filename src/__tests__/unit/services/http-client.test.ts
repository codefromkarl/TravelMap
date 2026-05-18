/**
 * HTTP 客户端单元测试
 *
 * 覆盖：
 * - fetchWithTimeout 正常响应 / 超时 / 网络错误
 * - fetchWithRetry 指数退避 / 认证错误 / 客户端错误
 * - 错误分类（NetworkError / TimeoutError / ApiError / AuthError）
 * - URL 脱敏
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

/**
 * 刷新微任务队列 — fake timers 下 setTimeout(0) 不会触发，
 * 需要用纯 Promise 链来 flush 所有 pending microtasks
 */
async function flushPromises(): Promise<void> {
  // 链式 await 让所有 pending microtasks 执行完
  await new Promise<void>((resolve) => queueMicrotask(resolve));
}

describe("http-client", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    vi.clearAllMocks();
  });

  afterEach(() => {
    // 确保 fake timers 不泄漏到其他 describe
    vi.useRealTimers();
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
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("超时应抛出 TimeoutError", async () => {
      vi.useFakeTimers();

      // mock fetch 监听 AbortSignal，超时时 abort 会触发 reject
      mockFetch.mockImplementationOnce(
        (_url: string, opts?: RequestInit) =>
          new Promise((_resolve, reject) => {
            const signal = opts?.signal as AbortSignal | undefined;
            if (signal?.aborted) {
              reject(new DOMException("The operation was aborted.", "AbortError"));
              return;
            }
            signal?.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          }),
      );

      const promise = fetchWithTimeout("https://api.example.com/slow", { timeout: 50 });

      // 推进时钟触发 setTimeout → controller.abort() → signal abort → reject
      vi.advanceTimersByTime(50);

      await expect(promise).rejects.toThrow(TimeoutError);
    });

    it("网络错误应抛出 NetworkError", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));

      await expect(fetchWithTimeout("https://api.example.com")).rejects.toThrow(NetworkError);
    });

    it("HTTP 500 响应应原样返回（由调用方检查 res.ok）", async () => {
      mockFetch.mockResolvedValueOnce(new Response("Internal Server Error", { status: 500 }));

      const res = await fetchWithTimeout("https://api.example.com");
      expect(res.status).toBe(500);
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

    it("可重试状态码 503 应重试后成功", async () => {
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

    it("认证错误 401 应直接抛 AuthError 不重试", async () => {
      mockFetch.mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));

      await expect(
        fetchWithRetry("https://api.example.com", { maxRetries: 2, baseDelayMs: 10 }),
      ).rejects.toThrow(AuthError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("客户端错误 404 应直接抛 ApiError", async () => {
      mockFetch.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));

      await expect(
        fetchWithRetry("https://api.example.com", { maxRetries: 2, baseDelayMs: 10 }),
      ).rejects.toThrow(ApiError);
    });

    it("超时错误应重试后仍失败则抛 TimeoutError", async () => {
      vi.useFakeTimers();

      // mock fetch 监听 AbortSignal，超时时 abort 触发 reject
      const abortableFetch = (_url: string, opts?: RequestInit) =>
        new Promise((_resolve, reject) => {
          const signal = opts?.signal as AbortSignal | undefined;
          if (signal?.aborted) {
            reject(new DOMException("The operation was aborted.", "AbortError"));
            return;
          }
          signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });

      mockFetch.mockImplementation(abortableFetch);

      const promise = fetchWithRetry("https://api.example.com", {
        timeout: 50,
        maxRetries: 1,
        baseDelayMs: 10,
      });

      // 第一次请求超时（50ms）
      vi.advanceTimersByTime(50);
      await flushPromises();

      // 推进重试退避延迟（10ms）
      vi.advanceTimersByTime(10);
      await flushPromises();

      // 第二次请求超时（50ms）
      vi.advanceTimersByTime(50);
      await flushPromises();

      await expect(promise).rejects.toThrow(TimeoutError);
    });
  });

  // ─── createApiClient ────────────────────────────────────

  describe("createApiClient", () => {
    it("get 应返回 Response", async () => {
      mockFetch.mockResolvedValueOnce(new Response('{"data":1}', { status: 200 }));

      const client = createApiClient({ timeout: 5000 });
      const res = await client.get("https://api.example.com");

      expect(res.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("post 应发送 JSON body", async () => {
      mockFetch.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));

      const client = createApiClient();
      await client.post("https://api.example.com", { key: "value" });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toBe("https://api.example.com");
      expect(callArgs[1].method).toBe("POST");
      expect(callArgs[1].body).toBe(JSON.stringify({ key: "value" }));
    });

    it("proxyUrl 应包装请求", async () => {
      mockFetch.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));

      const client = createApiClient({ proxyUrl: "https://proxy.example.com" });
      await client.get("https://api.example.com/data");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callUrl = String(mockFetch.mock.calls[0][0]);
      expect(callUrl).toContain("proxy.example.com");
      expect(callUrl).toContain("api.example.com%2Fdata");
    });
  });
});
