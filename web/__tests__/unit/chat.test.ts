/** Security contract tests for the production chat proxy. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRequest, onRequestOptions } from "../../functions/api/chat.js";
import { signJwt } from "../../functions/_lib/jwt.js";

const JWT_SECRET = "test-chat-secret";

function createMockKv() {
  const store: Record<string, string> = {};
  return {
    get: vi.fn(async (key: string, opts?: { type?: string }) => {
      const value = store[key];
      if (value === undefined) return null;
      return opts?.type === "json" ? JSON.parse(value) : value;
    }),
    put: vi.fn(async (key: string, value: string) => { store[key] = value; }),
    _store: store,
  };
}

async function createContext(options: {
  method?: string;
  body?: unknown;
  rawBody?: string;
  userId?: string | null;
  origin?: string;
  env?: Record<string, unknown>;
  kv?: ReturnType<typeof createMockKv>;
} = {}) {
  const kv = options.kv || createMockKv();
  const userId = options.userId === undefined ? "u1" : options.userId;
  const headers = new Headers({ "Content-Type": "application/json" });
  if (options.origin !== "") headers.set("Origin", options.origin || "https://example.com");
  headers.set("CF-Connecting-IP", "203.0.113.10");

  if (userId) {
    const token = await signJwt({ sub: userId }, JWT_SECRET);
    headers.set("Cookie", `auth_token=${token}`);
    kv._store[`user:${userId}`] ||= JSON.stringify({ id: userId, usage: { apiCalls: 0 } });
  }

  const method = options.method || "POST";
  const request = new Request("https://example.com/api/chat", {
    method,
    headers,
    body: method === "POST"
      ? options.rawBody ?? JSON.stringify(options.body ?? { messages: [{ role: "user", content: "hi" }] })
      : undefined,
  });

  return {
    request,
    env: {
      JWT_SECRET,
      LLM_API_KEY: "sk-test-key",
      LLM_PROVIDER: "openai",
      LLM_MODEL: "gpt-4o-mini",
      RATE_LIMIT_KV: kv,
      ...options.env,
    },
    kv,
  };
}

const mockFetch = vi.fn();

beforeEach(() => {
  globalThis.fetch = mockFetch as typeof fetch;
  mockFetch.mockReset();
  mockFetch.mockResolvedValue(new Response(JSON.stringify({ choices: [] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }));
});

describe("method and origin security", () => {
  it("OPTIONS does not expose wildcard CORS", () => {
    const response = onRequestOptions();
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("rejects non-POST methods", async () => {
    const response = await onRequest(await createContext({ method: "GET" }));
    expect(response.status).toBe(405);
  });

  it("rejects cross-origin requests before authentication", async () => {
    const response = await onRequest(await createContext({ origin: "https://attacker.example", userId: null }));
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("FORBIDDEN_ORIGIN");
  });
});

describe("fail-closed configuration", () => {
  it.each([
    ["JWT_SECRET", ""],
    ["RATE_LIMIT_KV", undefined],
  ])("returns 503 when %s is missing", async (name, value) => {
    const response = await onRequest(await createContext({ env: { [name]: value } }));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("SECURITY_NOT_CONFIGURED");
  });

  it.each([
    ["LLM_API_KEY", ""],
    ["LLM_MODEL", ""],
    ["LLM_PROVIDER", "unknown"],
  ])("returns 503 for invalid provider config %s", async (name, value) => {
    const response = await onRequest(await createContext({ env: { [name]: value } }));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("PROVIDER_NOT_CONFIGURED");
  });

  it("supports a provider-specific encrypted secret", async () => {
    const response = await onRequest(await createContext({
      env: { LLM_API_KEY: "", OPENAI_API_KEY: "sk-provider-specific" },
    }));
    expect(response.status).toBe(200);
  });
});

describe("authentication, rate limiting and quota", () => {
  it("rejects requests without a cookie", async () => {
    const response = await onRequest(await createContext({ userId: null }));
    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe("AUTH_REQUIRED");
  });

  it("rejects a valid JWT without a user record", async () => {
    const context = await createContext({ userId: "missing" });
    delete context.kv._store["user:missing"];
    const response = await onRequest(context);
    expect(response.status).toBe(401);
  });

  it("returns 429 before upstream when the user rate limit is exhausted", async () => {
    const kv = createMockKv();
    const bucket = Math.floor(Date.now() / 60_000);
    kv._store[`chat-rate:${bucket}:user:u1`] = "12";
    const response = await onRequest(await createContext({ kv }));
    expect(response.status).toBe(429);
    expect((await response.json()).code).toBe("RATE_LIMITED");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("applies a higher secondary limit to the connecting IP", async () => {
    const kv = createMockKv();
    const bucket = Math.floor(Date.now() / 60_000);
    kv._store[`chat-rate:${bucket}:ip:203.0.113.10`] = "60";
    const response = await onRequest(await createContext({ kv }));
    expect(response.status).toBe(429);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 503 when the rate limiter fails", async () => {
    const kv = createMockKv();
    kv.get.mockImplementation(async (key: string, opts?: { type?: string }) => {
      if (key === "user:u1") return opts?.type === "json" ? { id: "u1", usage: { apiCalls: 0 } } : "";
      throw new Error("KV unavailable");
    });
    const response = await onRequest(await createContext({ kv }));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("RATE_LIMIT_UNAVAILABLE");
  });

  it("returns 429 when the daily quota is exhausted", async () => {
    const kv = createMockKv();
    kv._store["user:u1"] = JSON.stringify({ id: "u1", usage: { apiCalls: 200 } });
    const response = await onRequest(await createContext({ kv }));
    expect(response.status).toBe(429);
    expect((await response.json()).code).toBe("QUOTA_EXCEEDED");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns the remaining quota after accepting a request", async () => {
    const kv = createMockKv();
    kv._store["user:u1"] = JSON.stringify({ id: "u1", usage: { apiCalls: 5 } });
    const response = await onRequest(await createContext({ kv }));
    expect(response.headers.get("X-Quota-Remaining")).toBe("194");
  });
});

describe("request validation and fixed upstream", () => {
  it("rejects invalid JSON", async () => {
    const response = await onRequest(await createContext({ rawBody: "not-json" }));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID_JSON");
  });

  it("rejects bodies larger than 64 KiB", async () => {
    const rawBody = JSON.stringify({ messages: [{ role: "user", content: "x".repeat(65 * 1024) }] });
    const response = await onRequest(await createContext({ rawBody }));
    expect(response.status).toBe(413);
  });

  it.each(["_provider", "baseUrl", "apiKey"])("rejects client routing field %s", async (field) => {
    const response = await onRequest(await createContext({
      body: { messages: [{ role: "user", content: "hi" }], [field]: "https://attacker.example" },
    }));
    expect(response.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("uses only the server provider URL and overwrites the model", async () => {
    const response = await onRequest(await createContext({
      body: { model: "client-model", messages: [{ role: "user", content: "hi" }] },
      env: { LLM_PROVIDER: "anthropic", LLM_MODEL: "claude-server", ANTHROPIC_API_KEY: "secret" },
    }));
    expect(response.status).toBe(200);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(JSON.parse(init.body).model).toBe("claude-server");
    expect(init.redirect).toBe("manual");
  });
});

describe("upstream error redaction", () => {
  it("does not return provider response details", async () => {
    mockFetch.mockResolvedValueOnce(new Response("secret provider detail", { status: 429 }));
    const response = await onRequest(await createContext());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("secret provider detail");
  });

  it("does not return thrown error details", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Authorization Bearer leaked-value"));
    const response = await onRequest(await createContext());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("leaked-value");
  });
});
