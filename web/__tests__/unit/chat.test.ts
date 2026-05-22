/**
 * Chat API 路由单元测试
 *
 * 覆盖：provider 路由、认证守卫、API key 检查、配额检查、请求转发
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  onRequest,
  onRequestOptions,
} from "../../functions/api/chat.js";
import { signJwt } from "../../functions/_lib/jwt.js";

const JWT_SECRET = "test-chat-secret";

// ─── Mock KV ────────────────────────────────────────────────
function createMockKv() {
  const store: Record<string, string> = {};
  return {
    get: vi.fn(async (key: string, opts?: { type?: string }) => {
      const val = store[key];
      if (val === undefined) return null;
      if (opts?.type === "json") return JSON.parse(val);
      return val;
    }),
    put: vi.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
    _store: store,
  };
}

// ─── 构造测试 context ───────────────────────────────────────
function createTestContext(overrides: {
  method?: string;
  body?: object;
  cookie?: string;
  env?: Record<string, string>;
  kv?: any;
}) {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  if (overrides.cookie) headers.set("Cookie", overrides.cookie);

  const request = new Request("https://example.com/api/chat", {
    method: overrides.method || "POST",
    headers,
    body: overrides.body ? JSON.stringify(overrides.body) : undefined,
  });

  const kv = overrides.kv || createMockKv();

  return {
    request,
    env: {
      JWT_SECRET,
      LLM_API_KEY: "sk-test-key",
      LLM_PROVIDER: "openai",
      LLM_MODEL: "gpt-4",
      RATE_LIMIT_KV: kv,
      ...overrides.env,
    },
    kv,
  };
}

// ─── Mock fetch ─────────────────────────────────────────────
const mockFetch = vi.fn();

beforeEach(() => {
  // 直接替换 globalThis.fetch（forks pool 下 vi.stubGlobal 可能丢失参数）
  globalThis.fetch = mockFetch as any;
  mockFetch.mockReset();
});

// ─── CORS / Method ─────────────────────────────────────────
describe("HTTP 方法处理", () => {
  it("OPTIONS 应返回 204 + CORS 头", () => {
    const resp = onRequestOptions();
    expect(resp.status).toBe(204);
    expect(resp.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(resp.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
  });

  it("HEAD 应返回 405", async () => {
    const ctx = createTestContext({ method: "HEAD" });
    const resp = await onRequest(ctx);
    expect(resp.status).toBe(405);
  });

  it("GET 应返回 405", async () => {
    const ctx = createTestContext({ method: "GET" });
    const resp = await onRequest(ctx);
    expect(resp.status).toBe(405);
  });
});

// ─── API Key 检查 ──────────────────────────────────────────
describe("API Key 配置检查", () => {
  it("缺少 LLM_API_KEY 和 OPENAI_API_KEY 应返回 503", async () => {
    const ctx = createTestContext({
      env: { LLM_API_KEY: "", OPENAI_API_KEY: "" },
      cookie: "auth_token=dummy",
    });
    const resp = await onRequest(ctx);
    expect(resp.status).toBe(503);
    const body = await resp.json();
    expect(body.error).toBe("Service not configured");
    expect(body.missing).toContain("LLM_API_KEY");
  });

  it("有 OPENAI_API_KEY（无 LLM_API_KEY）应正常工作", async () => {
    const token = await signJwt({ sub: "u1" }, JWT_SECRET);
    const kv = createMockKv();
    // 预创建用户
    kv._store["user:u1"] = JSON.stringify({ id: "u1", usage: { apiCalls: 0 } });

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const ctx = createTestContext({
      env: { LLM_API_KEY: "", OPENAI_API_KEY: "sk-fallback" },
      cookie: `auth_token=${token}`,
      body: { messages: [{ role: "user", content: "hi" }] },
      kv,
    });
    const resp = await onRequest(ctx);
    expect(resp.status).toBe(200);
  });
});

// ─── 认证守卫 ──────────────────────────────────────────────
describe("认证守卫", () => {
  it("无 Cookie 应返回 401", async () => {
    const ctx = createTestContext({ cookie: undefined });
    const resp = await onRequest(ctx);
    expect(resp.status).toBe(401);
    const body = await resp.json();
    expect(body.code).toBe("AUTH_REQUIRED");
  });

  it("无效 JWT 应返回 401", async () => {
    const ctx = createTestContext({ cookie: "auth_token=invalid.token.here" });
    const resp = await onRequest(ctx);
    expect(resp.status).toBe(401);
  });

  it("有效 JWT 但无 sub 字段应返回 401", async () => {
    // 签发一个没有 sub 的 token
    const token = await signJwt({ role: "admin" } as any, JWT_SECRET);
    const ctx = createTestContext({
      cookie: `auth_token=${token}`,
    });
    const resp = await onRequest(ctx);
    expect(resp.status).toBe(401);
  });
});

// ─── 配额检查 ──────────────────────────────────────────────
describe("配额检查", () => {
  it("配额耗尽应返回 403", async () => {
    const token = await signJwt({ sub: "u-exhausted" }, JWT_SECRET);
    const kv = createMockKv();
    kv._store["user:u-exhausted"] = JSON.stringify({
      id: "u-exhausted",
      usage: { apiCalls: 200 },
    });

    const ctx = createTestContext({
      cookie: `auth_token=${token}`,
      body: { messages: [] },
      kv,
    });
    const resp = await onRequest(ctx);
    expect(resp.status).toBe(403);
    const body = await resp.json();
    expect(body.code).toBe("QUOTA_EXCEEDED");
  });

  it("无 RATE_LIMIT_KV 时应跳过配额检查", async () => {
    const token = await signJwt({ sub: "u1" }, JWT_SECRET);
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const ctx = createTestContext({
      cookie: `auth_token=${token}`,
      body: { messages: [{ role: "user", content: "hi" }] },
      env: { RATE_LIMIT_KV: undefined as any },
    });
    // 不设 kv — env 中 RATE_LIMIT_KV 为 undefined
    delete ctx.env.RATE_LIMIT_KV;
    const resp = await onRequest(ctx);
    expect(resp.status).toBe(200);
  });
});

// ─── 请求体解析 ─────────────────────────────────────────────
describe("请求体解析", () => {
  async function makeAuthedRequest(body: string) {
    const token = await signJwt({ sub: "u1" }, JWT_SECRET);
    const kv = createMockKv();
    kv._store["user:u1"] = JSON.stringify({ id: "u1", usage: { apiCalls: 0 } });

    const headers = new Headers();
    headers.set("Content-Type", "application/json");
    headers.set("Cookie", `auth_token=${token}`);

    const request = new Request("https://example.com/api/chat", {
      method: "POST",
      headers,
      body,
    });

    return {
      request,
      env: {
        JWT_SECRET,
        LLM_API_KEY: "sk-test",
        LLM_PROVIDER: "openai",
        RATE_LIMIT_KV: kv,
      },
      kv,
    };
  }

  it("无效 JSON 应返回 400", async () => {
    const ctx = await makeAuthedRequest("not json at all");
    const resp = await onRequest(ctx);
    expect(resp.status).toBe(400);
    const data = await resp.json();
    expect(data.error).toBe("Invalid JSON");
  });

  it("超大请求体应返回 413", async () => {
    // 构造超过 256KB 的请求体
    const hugeBody = JSON.stringify({ messages: [{ content: "x".repeat(256 * 1024) }] });
    const ctx = await makeAuthedRequest(hugeBody);
    const resp = await onRequest(ctx);
    expect(resp.status).toBe(413);
  });
});

// ─── Provider 路由 ──────────────────────────────────────────
describe("Provider 路由", () => {
  it("不支持的 provider 应返回 400", async () => {
    const token = await signJwt({ sub: "u1" }, JWT_SECRET);
    const kv = createMockKv();
    kv._store["user:u1"] = JSON.stringify({ id: "u1", usage: { apiCalls: 0 } });

    const ctx = createTestContext({
      cookie: `auth_token=${token}`,
      body: { _provider: "nonexistent_provider", messages: [] },
      kv,
    });
    const resp = await onRequest(ctx);
    expect(resp.status).toBe(400);
    const data = await resp.json();
    expect(data.error).toContain("Unsupported provider");
  });

  it("应将请求转发到正确的 provider URL", async () => {
    const token = await signJwt({ sub: "u1" }, JWT_SECRET);
    const kv = createMockKv();
    kv._store["user:u1"] = JSON.stringify({ id: "u1", usage: { apiCalls: 0 } });

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const ctx = createTestContext({
      cookie: `auth_token=${token}`,
      body: { messages: [{ role: "user", content: "hi" }], stream: false },
      env: { LLM_PROVIDER: "anthropic" },
      kv,
    });
    const resp = await onRequest(ctx);
    expect(resp.status).toBe(200);

    // 检查 fetch 被调用时的 URL
    expect(mockFetch).toHaveBeenCalled();
    const fetchCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    expect(fetchCall[0]).toContain("anthropic.com");
  });

  it("请求体中的 _provider 字段应被删除后转发", async () => {
    const token = await signJwt({ sub: "u1" }, JWT_SECRET);
    const kv = createMockKv();
    kv._store["user:u1"] = JSON.stringify({ id: "u1", usage: { apiCalls: 0 } });

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const ctx = createTestContext({
      cookie: `auth_token=${token}`,
      body: { _provider: "openai", messages: [{ role: "user", content: "hi" }] },
      kv,
    });
    await onRequest(ctx);

    // 提取转发的 body
    const fetchCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    const forwardedBody = JSON.parse(fetchCall[1].body);
    expect(forwardedBody).not.toHaveProperty("_provider");
  });
});

// ─── 上游错误处理 ──────────────────────────────────────────
describe("上游错误处理", () => {
  it("fetch 抛错应返回 502", async () => {
    const token = await signJwt({ sub: "u1" }, JWT_SECRET);
    const kv = createMockKv();
    kv._store["user:u1"] = JSON.stringify({ id: "u1", usage: { apiCalls: 0 } });

    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const ctx = createTestContext({
      cookie: `auth_token=${token}`,
      body: { messages: [{ role: "user", content: "hi" }] },
      kv,
    });
    const resp = await onRequest(ctx);
    expect(resp.status).toBe(502);
    const data = await resp.json();
    expect(data.error).toBe("Upstream service unavailable");
  });
});

// ─── 配额头 ─────────────────────────────────────────────────
describe("响应配额头", () => {

  it("响应应包含 X-Quota-Remaining 头", async () => {
    const token = await signJwt({ sub: "u1" }, JWT_SECRET);
    const kv = createMockKv();
    kv._store["user:u1"] = JSON.stringify({ id: "u1", usage: { apiCalls: 5 } });

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const ctx = createTestContext({
      cookie: `auth_token=${token}`,
      body: { messages: [{ role: "user", content: "hi" }] },
      kv,
    });
    const resp = await onRequest(ctx);
    const remaining = resp.headers.get("X-Quota-Remaining");
    // 消耗了 1 次后为 200 - 6 = 194（consumeQuota 先把 apiCalls 从 5 增到 6）
    expect(remaining).toBe("194");
  });
});
