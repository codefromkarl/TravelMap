/** Security contract tests for the share short-link function. */
import { describe, expect, it, vi } from "vitest";
import { onRequest, onRequestOptions } from "../../functions/api/share.js";

function createMockKv() {
  const store = {};
  return {
    get: vi.fn(async (key) => (store[key] === undefined ? null : store[key])),
    put: vi.fn(async (key, value) => { store[key] = value; }),
    _store: store,
  };
}

async function createContext(options = {}) {
  const kv = options.kv || createMockKv();
  const headers = new Headers({ "Content-Type": "application/json" });
  if (options.origin !== "") headers.set("Origin", options.origin || "https://example.com");
  headers.set("CF-Connecting-IP", "203.0.113.10");

  const method = options.method || "POST";
  const url = "https://example.com/api/share" + (options.query || "");
  const request = new Request(url, {
    method,
    headers,
    body: method === "POST"
      ? options.rawBody ?? JSON.stringify(options.body ?? { content: "test-content" })
      : undefined,
  });

  return { request, env: { RATE_LIMIT_KV: kv, ...options.env }, kv };
}

describe("method and origin security", () => {
  it("OPTIONS does not expose wildcard CORS", () => {
    const response = onRequestOptions();
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("rejects non-POST/GET methods", async () => {
    const response = await onRequest(await createContext({ method: "DELETE" }));
    expect(response.status).toBe(405);
  });

  it("rejects cross-origin requests", async () => {
    const response = await onRequest(await createContext({ origin: "https://attacker.example" }));
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("FORBIDDEN_ORIGIN");
  });
});

describe("fail-closed configuration", () => {
  it("returns 503 when RATE_LIMIT_KV is missing", async () => {
    const response = await onRequest(await createContext({ env: { RATE_LIMIT_KV: undefined } }));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("SECURITY_NOT_CONFIGURED");
  });
});

describe("POST /api/share", () => {
  it("stores content and returns an id", async () => {
    const kv = createMockKv();
    const response = await onRequest(await createContext({ kv, body: { content: "abc123" } }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(typeof body.id).toBe("string");
    expect(body.id.length).toBeGreaterThan(0);
    expect(kv._store["share:" + body.id]).toBe("abc123");
  });

  it("returns 429 when the IP rate limit is exhausted", async () => {
    const kv = createMockKv();
    const bucket = Math.floor(Date.now() / 60_000);
    kv._store["share-rate:" + bucket + ":ip:203.0.113.10"] = "10";
    const response = await onRequest(await createContext({ kv }));
    expect(response.status).toBe(429);
    expect((await response.json()).code).toBe("RATE_LIMITED");
  });

  it("rejects invalid JSON", async () => {
    const response = await onRequest(await createContext({ rawBody: "not-json" }));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID_JSON");
  });

  it("rejects missing content", async () => {
    const response = await onRequest(await createContext({ body: {} }));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID_REQUEST");
  });

  it("rejects content larger than 32 KiB", async () => {
    const response = await onRequest(await createContext({ body: { content: "x".repeat(32 * 1024 + 1) } }));
    expect(response.status).toBe(413);
    expect((await response.json()).code).toBe("CONTENT_TOO_LARGE");
  });
});

describe("GET /api/share", () => {
  it("returns stored content by id", async () => {
    const kv = createMockKv();
    kv._store["share:known-id"] = "payload";
    const response = await onRequest(await createContext({ method: "GET", query: "?id=known-id", kv }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ content: "payload" });
  });

  it("returns 404 for an unknown id", async () => {
    const response = await onRequest(await createContext({ method: "GET", query: "?id=missing" }));
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("NOT_FOUND");
  });

  it("returns 400 when id is missing", async () => {
    const response = await onRequest(await createContext({ method: "GET" }));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID_REQUEST");
  });
});
