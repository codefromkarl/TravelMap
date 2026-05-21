/**
 * 统一 HTTP 客户端层
 *
 * 封装：
 * - fetchWithTimeout    — AbortController + setTimeout（兼容旧 Node）
 * - fetchWithRetry      — 指数退避重试（max 3 次，仅对 GET/幂等请求）
 * - createApiClient     — 预配置 timeout、headers、proxy 的客户端
 * - 统一错误分类 + URL 日志脱敏
 */

import { getLogger } from "./logger.js";
import { getTrace } from "./trace-context.js";

/** 统一错误类型 */
export class NetworkError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "NetworkError";
  }
}

export class TimeoutError extends Error {
  constructor(
    message: string,
    public readonly timeoutMs: number,
  ) {
    super(message);
    this.name = "TimeoutError";
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseText?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

/** 请求配置 */
export interface FetchOptions extends RequestInit {
  timeout?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  /** 标记 POST 请求为幂等（允许重试），默认 false */
  idempotent?: boolean;
}

/** 敏感 query key 列表 — 这些参数在日志中会被脱敏 */
const SENSITIVE_KEYS = new Set([
  "key",
  "appid",
  "token",
  "api_key",
  "apikey",
  "secret",
  "password",
  "auth",
]);

/** 脱敏 URL（替换敏感 query param 值） */
export function sanitizeUrl(url: string | URL): string {
  let u: URL;
  try {
    u = typeof url === "string" ? new URL(url) : new URL(url.toString());
  } catch {
    return String(url);
  }

  for (const key of u.searchParams.keys()) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      u.searchParams.set(key, "***");
    }
  }
  return u.toString();
}

/** 带超时的 fetch（AbortController + setTimeout，兼容 Node < 18.17） */
export async function fetchWithTimeout(url: string, options: FetchOptions = {}): Promise<Response> {
  const { timeout = 4000, ...fetchOptions } = options;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout);

  try {
    const res = await fetch(url, { ...fetchOptions, signal: controller.signal });
    return res;
  } catch (err) {
    if (timedOut || (err instanceof Error && err.name === "AbortError")) {
      throw new TimeoutError(`Request timeout after ${timeout}ms: ${sanitizeUrl(url)}`, timeout);
    }
    throw new NetworkError(`Network error: ${sanitizeUrl(url)}`, err);
  } finally {
    clearTimeout(timer);
  }
}

/** 指数退避重试（GET/HEAD/OPTIONS 默认重试，POST 需声明 idempotent=true） */
export async function fetchWithRetry(url: string, options: FetchOptions = {}): Promise<Response> {
  const method = (options.method ?? "GET").toUpperCase();
  const isIdempotent =
    method === "GET" || method === "HEAD" || method === "OPTIONS" || options.idempotent === true;
  const maxRetries = options.maxRetries ?? (isIdempotent ? 3 : 0);
  const baseDelay = options.baseDelayMs ?? (process.env.NODE_ENV === "test" ? 0 : 500);

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, options);

      // 认证错误 — 不重试
      if (res.status === 401 || res.status === 403) {
        throw new AuthError(`Authentication failed (${res.status}): ${sanitizeUrl(url)}`);
      }

      // 客户端错误 — 不重试
      if (res.status >= 400 && res.status < 500) {
        throw new ApiError(`Client error ${res.status}: ${sanitizeUrl(url)}`, res.status);
      }

      // 5xx 服务器错误 — 重试
      if (res.status >= 500 && res.status < 600) {
        if (attempt < maxRetries) {
          const delay = Math.min(baseDelay * 2 ** attempt, 8000);
          getLogger().warn(`Server ${res.status} retry ${attempt + 1}/${maxRetries}`, {
            url: sanitizeUrl(url),
            delay,
            attempt,
            trace: getTrace(),
          });
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw new ApiError(`Server error ${res.status}: ${sanitizeUrl(url)}`, res.status);
      }

      return res;
    } catch (err) {
      if (err instanceof AuthError || err instanceof ApiError) throw err;
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const delay = Math.min(baseDelay * 2 ** attempt, 8000);
        getLogger().warn(`${lastError.name} retry ${attempt + 1}/${maxRetries}`, {
          url: sanitizeUrl(url),
          delay,
          attempt,
          error: lastError.message,
          trace: getTrace(),
        });
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError ?? new NetworkError(`All retries failed: ${sanitizeUrl(url)}`);
}

/** API 客户端配置 */
export interface ApiClientConfig {
  baseUrl?: string;
  timeout?: number;
  headers?: Record<string, string>;
  proxyUrl?: string;
}

/** 创建预配置客户端 */
export function createApiClient(config: ApiClientConfig = {}) {
  const { baseUrl, timeout = 4000, headers = {}, proxyUrl } = config;

  return {
    async get(path: string, options: FetchOptions = {}): Promise<Response> {
      const url = baseUrl ? `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}` : path;
      const finalUrl = proxyUrl ? `${proxyUrl}?url=${encodeURIComponent(url)}` : url;
      return fetchWithRetry(finalUrl, {
        ...options,
        method: "GET",
        headers: { ...headers, ...options.headers },
        timeout: options.timeout ?? timeout,
      });
    },

    async post(path: string, body?: unknown, options: FetchOptions = {}): Promise<Response> {
      const url = baseUrl ? `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}` : path;
      const finalUrl = proxyUrl ? `${proxyUrl}?url=${encodeURIComponent(url)}` : url;
      // POST 走 fetchWithRetry，调用方可通过 options.idempotent=true 启用重试
      return fetchWithRetry(finalUrl, {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers, ...options.headers },
        body: body ? JSON.stringify(body) : undefined,
        timeout: options.timeout ?? timeout,
      });
    },
  };
}
