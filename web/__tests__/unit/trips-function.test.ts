/** Security contract tests for the trips cloud-sync Pages Function. */
import { describe, expect, it, vi } from "vitest";
import { onRequest, onRequestOptions } from "../../functions/api/trips.js";
import { signJwt } from "../../functions/_lib/jwt.js";

const JWT_SECRET = "test-trips-secret";

function createMockKv() {
  const store: Record<string, string> = {};
  return {
    get: vi.fn(async (key: string, opts?: { type?: string }) => {
      const value = store[key];
      if (value === undefined) return null;
      return opts?.type === "json" ? JSON.parse(value) : value;
    }),
    put: vi.fn(async (key: string, value: string) => { store[key] = value; }),
    delete: vi.fn(async (key: string) => { delete store[key]; }),
    _store: store,
  };
}

function makeTrip(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
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

  const method = options.method || "GET";
  const request = new Request(`https://example.com${options.path || "/api/trips"}`, {
    method,
    headers,
    body: method === "PUT"
      ? options.rawBody ?? JSON.stringify(options.body ?? { trip: makeTrip() })
      : undefined,
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
  });

  it("rejects non-GET/PUT/DELETE methods", async () => {
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

describe("GET /api/trips", () => {
  it("returns an empty list when no index exists", async () => {
    const response = await onRequest(await createContext({ method: "GET" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ trips: [] });
  });

  it("returns stored summaries without large fields", async () => {
    const kv = createMockKv();
    kv._store["trips:u1:index"] = JSON.stringify([
      { id: "t1", title: "杭州三日游", city: "杭州", days: 3, updatedAt: "2026-01-02T00:00:00.000Z" },
    ]);
    const response = await onRequest(await createContext({ method: "GET", kv }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      trips: [
        { id: "t1", title: "杭州三日游", city: "杭州", days: 3, updatedAt: "2026-01-02T00:00:00.000Z" },
      ],
    });
  });
});

describe("GET /api/trips/<id>", () => {
  it("returns the full stored trip", async () => {
    const kv = createMockKv();
    const trip = makeTrip();
    kv._store["trips:u1:t1"] = JSON.stringify(trip);
    const response = await onRequest(await createContext({ method: "GET", path: "/api/trips/t1", kv }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ trip });
  });

  it("returns 404 for an unknown id", async () => {
    const response = await onRequest(await createContext({ method: "GET", path: "/api/trips/missing" }));
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("NOT_FOUND");
  });
});

describe("PUT /api/trips/<id>", () => {
  it("stores the trip and updates the index", async () => {
    const kv = createMockKv();
    const trip = makeTrip();
    const response = await onRequest(await createContext({ method: "PUT", path: "/api/trips/t1", body: { trip }, kv }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, id: "t1" });
    expect(kv._store["trips:u1:t1"]).toBe(JSON.stringify(trip));
    expect(JSON.parse(kv._store["trips:u1:index"])).toEqual([
      { id: "t1", title: "杭州三日游", city: "杭州", days: 3, updatedAt: "2026-01-02T00:00:00.000Z" },
    ]);
  });

  it.each([
    ["id", { id: "", title: "t", updatedAt: "2026-01-02T00:00:00.000Z" }],
    ["title", { id: "t1", title: "", updatedAt: "2026-01-02T00:00:00.000Z" }],
    ["updatedAt", { id: "t1", title: "t" }],
  ])("rejects a trip missing %s", async (_field, trip) => {
    const response = await onRequest(await createContext({ method: "PUT", path: "/api/trips/t1", body: { trip } }));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID_REQUEST");
  });

  it("rejects an invalid updatedAt date", async () => {
    const trip = makeTrip({ updatedAt: "not-a-date" });
    const response = await onRequest(await createContext({ method: "PUT", path: "/api/trips/t1", body: { trip } }));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID_REQUEST");
  });

  it("rejects a trip whose id does not match the path", async () => {
    const trip = makeTrip({ id: "t2" });
    const response = await onRequest(await createContext({ method: "PUT", path: "/api/trips/t1", body: { trip } }));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID_REQUEST");
  });

  it("rejects a trip larger than 256 KiB", async () => {
    const trip = makeTrip({ markdown: "x".repeat(256 * 1024) });
    const response = await onRequest(await createContext({ method: "PUT", path: "/api/trips/t1", body: { trip } }));
    expect(response.status).toBe(413);
    expect((await response.json()).code).toBe("TRIP_TOO_LARGE");
  });

  it("rejects invalid JSON", async () => {
    const response = await onRequest(await createContext({ method: "PUT", path: "/api/trips/t1", rawBody: "not-json" }));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID_JSON");
  });

  it("returns 429 when the IP rate limit is exhausted", async () => {
    const kv = createMockKv();
    const bucket = Math.floor(Date.now() / 60_000);
    kv._store[`trips-rate:${bucket}:ip:203.0.113.10`] = "30";
    const response = await onRequest(await createContext({ method: "PUT", path: "/api/trips/t1", kv }));
    expect(response.status).toBe(429);
    expect((await response.json()).code).toBe("RATE_LIMITED");
  });
});

describe("DELETE /api/trips/<id>", () => {
  it("removes the trip KV record and its index entry", async () => {
    const kv = createMockKv();
    const trip = makeTrip();
    kv._store["trips:u1:t1"] = JSON.stringify(trip);
    kv._store["trips:u1:index"] = JSON.stringify([
      { id: "t1", title: "杭州三日游", city: "杭州", days: 3, updatedAt: "2026-01-02T00:00:00.000Z" },
      { id: "t2", title: "其它", city: "上海", days: 1, updatedAt: "2026-01-01T00:00:00.000Z" },
    ]);

    const response = await onRequest(await createContext({ method: "DELETE", path: "/api/trips/t1", kv }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(kv._store["trips:u1:t1"]).toBeUndefined();
    expect(JSON.parse(kv._store["trips:u1:index"])).toEqual([
      { id: "t2", title: "其它", city: "上海", days: 1, updatedAt: "2026-01-01T00:00:00.000Z" },
    ]);
  });
});
