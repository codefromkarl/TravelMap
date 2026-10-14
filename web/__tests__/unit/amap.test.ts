/** Credentialed map proxy: deny before any upstream traffic, preserve real POI contracts. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../src/__tests__/mocks/server.js";
import { onRequest, onRequestOptions } from "../../functions/api/amap.js";
import { signJwt } from "../../functions/_lib/jwt.js";

const SECRET = "unit-map-jwt";
const WEB_KEY = "unit-server-owned-map-key";
const validBody = { endpoint: "place/text", params: { city: "杭州", citylimit: "true", types: "110000", offset: "20", extensions: "all" } };
function createKv() {
  const store: Record<string, string> = { "user:u1": JSON.stringify({ id: "u1" }) };
  return {
    store,
    get: vi.fn(async (key: string, options?: { type: string }) => {
      const raw = store[key] ?? null;
      return options?.type === "json" && raw !== null ? JSON.parse(raw) : raw;
    }),
    put: vi.fn(async (key: string, value: string) => { store[key] = value; }),
  };
}
async function context(options: { body?: unknown; raw?: string; origin?: string; token?: string | null; env?: Record<string, unknown>; headers?: Record<string, string>; method?: string } = {}) {
  const kv = createKv();
  const token = options.token === undefined ? await signJwt({ sub: "u1" }, SECRET) : options.token;
  const headers = new Headers({ "Content-Type": "application/json", Origin: "https://travel.example", "CF-Connecting-IP": "203.0.113.1", ...options.headers });
  if (options.origin !== undefined) options.origin ? headers.set("Origin", options.origin) : headers.delete("Origin");
  if (token) headers.set("Cookie", `auth_token=${token}`);
  const method = options.method ?? "POST";
  return {
    request: new Request("https://travel.example/api/amap", { method, headers, body: method === "POST" ? options.raw ?? JSON.stringify(options.body ?? validBody) : undefined }),
    env: { JWT_SECRET: SECRET, RATE_LIMIT_KV: kv, AMAP_WEB_KEY: WEB_KEY, ...options.env },
    kv,
  };
}
let calls: Request[] = [];
beforeEach(() => {
  calls = [];
  server.use(http.get("https://restapi.amap.com/v3/:kind/:action", ({ request }) => {
    calls.push(request);
    return HttpResponse.json({ status: "1", count: "1", pois: [{ id: "p1", name: "西湖", location: "120.1,30.2" }] });
  }));
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
async function denied(ctx: Awaited<ReturnType<typeof context>>, status: number, code: string) {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const response = await onRequest(ctx);
  expect(fetchSpy).not.toHaveBeenCalled();
  fetchSpy.mockRestore();
  expect(response.status).toBe(status);
  expect((await response.json()).code).toBe(code);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  expect(calls.length).toBe(0);
}

describe("map authentication and request boundaries", () => {
  it.each(["https://attacker.example", ""])("rejects origin %s", async origin => {
    await denied(await context({ origin, token: null }), 403, "FORBIDDEN_ORIGIN");
  });
  it("rejects cross-site metadata even with matching origin", async () => {
    await denied(await context({ headers: { "Sec-Fetch-Site": "cross-site" } }), 403, "FORBIDDEN_ORIGIN");
  });
  it("OPTIONS never allows cross-origin credentialed access", async () => {
    const ctx = await context({ method: "OPTIONS" });
    expect(onRequestOptions(ctx).status).toBe(204);
    expect(onRequestOptions(ctx).headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(onRequestOptions(await context({ method: "OPTIONS", origin: "https://attacker.example" })).status).toBe(403);
    expect((await onRequest(await context({ method: "GET" }))).status).toBe(405);
  });
  it.each(["JWT_SECRET", "RATE_LIMIT_KV"])("requires %s", async binding => {
    await denied(await context({ env: { [binding]: undefined } }), 503, "SECURITY_NOT_CONFIGURED");
  });
  it("requires server map key", async () => {
    await denied(await context({ env: { AMAP_WEB_KEY: "" } }), 503, "PROVIDER_NOT_CONFIGURED");
  });
  it.each([null, "invalid"])("requires valid JWT %s", async token => {
    await denied(await context({ token }), 401, "AUTH_REQUIRED");
  });
  it("requires a matching KV user record", async () => {
    const ctx = await context();
    delete ctx.kv.store["user:u1"];
    await denied(ctx, 401, "AUTH_REQUIRED");
    ctx.kv.store["user:u1"] = JSON.stringify({ id: "another-user" });
    await denied(ctx, 401, "AUTH_REQUIRED");
  });
  it.each(["user:u1", "ip:203.0.113.1"])("enforces minute %s limit", async scope => {
    const ctx = await context();
    ctx.kv.store[`amap-rate:${Math.floor(Date.now() / 60000)}:${scope}`] = "120";
    await denied(ctx, 429, "RATE_LIMITED");
  });
  it("fails closed on KV read/write failures", async () => {
    const ctx = await context();
    ctx.kv.put.mockRejectedValue(new Error("KV unavailable"));
    await denied(ctx, 503, "RATE_LIMIT_UNAVAILABLE");
    ctx.kv.get.mockRejectedValue(new Error("KV unavailable"));
    await denied(ctx, 503, "RATE_LIMIT_UNAVAILABLE");
  });
  it.each([
    { ...validBody, apiKey: "attacker" },
    { ...validBody, endpoint: { toString: 1 } },
    { ...validBody, endpoint: [] },
    { ...validBody, endpoint: null },
    { ...validBody, baseUrl: "https://attacker.example" },
    { ...validBody, endpoint: "../other" },
    { ...validBody, endpoint: "https://attacker.example" },
    { ...validBody, endpoint: "toString" },
    { ...validBody, params: { ...validBody.params, key: "attacker" } },
    { ...validBody, params: { ...validBody.params, callback: "alert" } },
    { ...validBody, params: { ...validBody.params, city: "x".repeat(101) } },
    { ...validBody, params: { ...validBody.params, offset: "100" } },
    { endpoint: "place/around", params: { location: "181,30" } },
    { endpoint: "place/around", params: { location: "120,91", radius: "999999" } },
    { endpoint: "place/text", params: [] },
  ])("rejects invalid route/parameter body %#", async body => {
    await denied(await context({ body }), 400, "INVALID_REQUEST");
  });
  it("rejects malformed JSON and non JSON content types", async () => {
    await denied(await context({ raw: "{" }), 400, "INVALID_JSON");
    await denied(await context({ headers: { "Content-Type": "text/plain" } }), 400, "INVALID_REQUEST");
  });
  it("bounds bodies with and without declared length", async () => {
    await denied(await context({ raw: "x".repeat(8193) }), 413, "REQUEST_TOO_LARGE");
    await denied(await context({ headers: { "Content-Length": "8193" } }), 413, "REQUEST_TOO_LARGE");
  });
});

describe("map upstream", () => {
  it("preserves real attraction JSON and uses only the server key and fixed host", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await onRequest(await context());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "1", pois: [{ name: "西湖", location: "120.1,30.2" }] });
    const url = new URL(calls[0].url);
    expect(url.origin).toBe("https://restapi.amap.com");
    expect(url.pathname).toBe("/v3/place/text");
    expect(url.searchParams.get("key")).toBe(WEB_KEY);
    expect(url.searchParams.get("city")).toBe("杭州");
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({ redirect: "manual", signal: expect.any(AbortSignal) });
  });
  it("preserves the existing hotel place/around parameters", async () => {
    const response = await onRequest(await context({ body: { endpoint: "place/around", params: { location: "120.1,30.2", types: "10", radius: 5000, sortrule: "distance", offset: "20", page: "1", extensions: "all", keywords: "酒店" } } }));
    expect(response.status).toBe(200);
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/v3/place/around");
    expect(url.searchParams.get("radius")).toBe("5000");
  });
  it.each(["redirect", "non2xx", "provider", "nonjson", "malformed", "network", "oversize"])("hides %s provider details", async kind => {
    const secretDetail = `provider detail ${WEB_KEY}`;
    server.use(http.get("https://restapi.amap.com/v3/place/text", ({ request }) => {
      calls.push(request);
      if (kind === "redirect") return new HttpResponse(secretDetail, { status: 302, headers: { Location: "https://attacker.example" } });
      if (kind === "non2xx") return new HttpResponse(secretDetail, { status: 429 });
      if (kind === "provider") return HttpResponse.json({ status: "0", info: secretDetail });
      if (kind === "nonjson") return HttpResponse.html(secretDetail);
      if (kind === "malformed") return new HttpResponse("{", { headers: { "Content-Type": "application/json" } });
      if (kind === "network") return HttpResponse.error();
      return HttpResponse.json({ status: "1", pois: [], detail: "x".repeat(512 * 1024) });
    }));
    const response = await onRequest(await context());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ code: "UPSTREAM_ERROR", error: "Map request unavailable" });
    expect(calls.length).toBe(1);
  });
  it("times out stalled upstream requests", async () => {
    vi.useFakeTimers();
    server.use(http.get("https://restapi.amap.com/v3/place/text", async ({ request }) => {
      calls.push(request);
      await new Promise(resolve => request.signal.addEventListener("abort", resolve, { once: true }));
      return HttpResponse.error();
    }));
    const ctx = await context();
    const responsePromise = onRequest(ctx);
    // Wait for auth and interception before advancing the provider deadline.
    await vi.waitFor(() => expect(calls.length).toBe(1));
    await vi.advanceTimersByTimeAsync(8000);
    const response = await responsePromise;
    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe("UPSTREAM_ERROR");
  });
});
