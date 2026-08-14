/** Security & GDPR contract tests for the account export/delete Pages Function. */
import { describe, expect, it, vi } from "vitest";
import { onRequest, onRequestOptions } from "../../functions/api/account.js";
import { signJwt } from "../../functions/_lib/jwt.js";

const JWT_SECRET = "test-account-secret";

function createMockKv() {
  const store: Record<string, string> = {};
  // 故意用小分页（2 条/页）以覆盖 KV list 分页 cursor 循环
  const PAGE_SIZE = 2;
  return {
    get: vi.fn(async (key: string, opts?: { type?: string }) => {
      const value = store[key];
      if (value === undefined) return null;
      return opts?.type === "json" ? JSON.parse(value) : value;
    }),
    put: vi.fn(async (key: string, value: string) => { store[key] = value; }),
    delete: vi.fn(async (key: string) => { delete store[key]; }),
    list: vi.fn(async ({ prefix, cursor }: { prefix: string; cursor?: string }) => {
      const remaining = Object.keys(store)
        .filter((key) => key.startsWith(prefix))
        .filter((key) => !cursor || key > cursor)
        .sort();
      const chunk = remaining.slice(0, PAGE_SIZE);
      return {
        keys: chunk.map((name) => ({ name })),
        list_complete: remaining.length <= PAGE_SIZE,
        cursor: remaining.length > PAGE_SIZE ? chunk[chunk.length - 1] : undefined,
      };
    }),
    _store: store,
  };
}

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    provider: "github",
    name: "测试用户",
    avatar: "https://example.com/avatar.png",
    email: "user@example.com",
    createdAt: "2026-01-01T00:00:00.000Z",
    usage: { apiCalls: 0 },
    ...overrides,
  };
}

function makeTrip(overrides: Record<string, unknown> = {}) {
  return {
    id: "a1",
    title: "杭州三日游",
    city: "杭州",
    days: 3,
    tripPlan: { days: [] },
    markdown: "# 行程",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

async function createContext(options: {
  method?: string;
  path?: string;
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
    headers.set("Cookie", "auth_token=" + token);
    kv._store["user:" + userId] ||= JSON.stringify(makeUser({ id: userId }));
  }

  const method = options.method || "GET";
  const request = new Request("https://example.com" + (options.path || "/api/account/export"), {
    method,
    headers,
    body: options.rawBody !== undefined ? options.rawBody : undefined,
  });

  return {
    request,
    env: { JWT_SECRET, RATE_LIMIT_KV: kv, ...options.env },
    kv,
  };
}

describe("method and origin security", () => {
  it("OPTIONS does not expose wildcard CORS", () => {
    const response = onRequestOptions();
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(response.headers.get("Allow")).toBe("GET, DELETE, OPTIONS");
  });

  it("rejects non-GET/DELETE methods", async () => {
    const response = await onRequest(await createContext({ method: "POST" }));
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
});

describe("authentication", () => {
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
    expect((await response.json()).code).toBe("AUTH_REQUIRED");
  });
});

describe("routing", () => {
  it("returns 404 for GET /api/account without the export path", async () => {
    const response = await onRequest(await createContext({ method: "GET", path: "/api/account" }));
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("NOT_FOUND");
  });

  it("returns 404 for DELETE /api/account/export", async () => {
    const response = await onRequest(await createContext({ method: "DELETE", path: "/api/account/export" }));
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("NOT_FOUND");
  });
});

describe("GET /api/account/export", () => {
  it("exports user and all trips across paginated KV list", async () => {
    const kv = createMockKv();
    const tripA = makeTrip({ id: "a1" });
    const tripB = makeTrip({ id: "a2", title: "上海周末游", city: "上海" });
    const tripC = makeTrip({ id: "a3", title: "北京五日游", city: "北京" });
    kv._store["trips:u1:a1"] = JSON.stringify(tripA);
    kv._store["trips:u1:a2"] = JSON.stringify(tripB);
    kv._store["trips:u1:a3"] = JSON.stringify(tripC);
    kv._store["trips:u1:index"] = JSON.stringify([
      { id: "a1", title: "杭州三日游", city: "杭州", days: 3, updatedAt: tripA.updatedAt },
    ]);

    const response = await onRequest(await createContext({ method: "GET", kv }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const data = await response.json();
    expect(data.user).toEqual({
      id: "u1",
      name: "测试用户",
      email: "user@example.com",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(data.user).not.toHaveProperty("usage");
    expect(data.user).not.toHaveProperty("provider");
    expect(data.trips).toEqual([tripA, tripB, tripC]);
    expect(typeof data.exportedAt).toBe("string");
    expect(data.exportedAt.length).toBeGreaterThan(0);
    // 4 个键（3 行程 + index），页大小 2 → 至少 2 次 list，验证分页 cursor 循环
    expect(kv.list.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("exports an empty trips array when the user has no trips", async () => {
    const kv = createMockKv();
    const response = await onRequest(await createContext({ method: "GET", kv }));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.user.id).toBe("u1");
    expect(data.trips).toEqual([]);
    expect(typeof data.exportedAt).toBe("string");
  });
});

describe("DELETE /api/account", () => {
  it("deletes user, all trips and index across pagination, keeping share keys", async () => {
    const kv = createMockKv();
    kv._store["trips:u1:a1"] = JSON.stringify(makeTrip({ id: "a1" }));
    kv._store["trips:u1:a2"] = JSON.stringify(makeTrip({ id: "a2" }));
    kv._store["trips:u1:a3"] = JSON.stringify(makeTrip({ id: "a3" }));
    kv._store["trips:u1:index"] = JSON.stringify([
      { id: "a1", title: "杭州三日游", city: "杭州", days: 3, updatedAt: "2026-01-02T00:00:00.000Z" },
    ]);
    kv._store["share:s1"] = "shared-by-someone-else";

    const response = await onRequest(await createContext({ method: "DELETE", path: "/api/account", kv }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ deleted: { user: true, trips: 3 } });
    expect(kv._store["user:u1"]).toBeUndefined();
    expect(kv._store["trips:u1:a1"]).toBeUndefined();
    expect(kv._store["trips:u1:a2"]).toBeUndefined();
    expect(kv._store["trips:u1:a3"]).toBeUndefined();
    expect(kv._store["trips:u1:index"]).toBeUndefined();
    expect(kv._store["share:s1"]).toBe("shared-by-someone-else");
    // 4 个键（3 行程 + index），页大小 2 → 至少 2 次 list
    expect(kv.list.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("is idempotent when the user has no data", async () => {
    const kv = createMockKv();
    const response = await onRequest(await createContext({ method: "DELETE", path: "/api/account", kv }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: { user: true, trips: 0 } });
  });

  it("accepts an empty object body", async () => {
    const response = await onRequest(await createContext({ method: "DELETE", path: "/api/account", rawBody: "{}" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: { user: true, trips: 0 } });
  });

  it("rejects a non-object body", async () => {
    const response = await onRequest(await createContext({ method: "DELETE", path: "/api/account", rawBody: "null" }));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID_REQUEST");
  });

  it("rejects invalid JSON", async () => {
    const response = await onRequest(await createContext({ method: "DELETE", path: "/api/account", rawBody: "not-json" }));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID_JSON");
  });
});

describe("rate limiting", () => {
  it.each([
    ["GET /api/account/export", "GET", "/api/account/export"],
    ["DELETE /api/account", "DELETE", "/api/account"],
  ])("returns 429 for %s when the IP limit is exhausted", async (_label, method, path) => {
    const kv = createMockKv();
    const bucket = Math.floor(Date.now() / 60_000);
    kv._store["account-rate:" + bucket + ":ip:203.0.113.10"] = "5";
    const response = await onRequest(await createContext({ method, path, kv }));
    expect(response.status).toBe(429);
    expect((await response.json()).code).toBe("RATE_LIMITED");
    expect(response.headers.get("Retry-After")).toBe("60");
  });
});

