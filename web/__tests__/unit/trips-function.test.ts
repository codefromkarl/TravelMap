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
  syncUser?: string;
  env?: Record<string, unknown>;
  kv?: ReturnType<typeof createMockKv>;
} = {}) {
  const kv = options.kv || createMockKv();
  const userId = options.userId === undefined ? "u1" : options.userId;
  const headers = new Headers({ "Content-Type": "application/json" });
  if (options.origin !== "") headers.set("Origin", options.origin || "https://example.com");
  headers.set("CF-Connecting-IP", "203.0.113.10");
  if (options.syncUser) headers.set("X-Sync-User", options.syncUser);

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
      : method === "DELETE" && (options.rawBody !== undefined || options.body !== undefined)
        ? options.rawBody ?? JSON.stringify(options.body) : undefined,
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
    expect(await response.json()).toEqual({ userId: "u1", trips: [] });
  });

  it("returns stored summaries without large fields", async () => {
    const kv = createMockKv();
    kv._store["trips:u1:index"] = JSON.stringify([
      { id: "t1", title: "杭州三日游", city: "杭州", days: 3, updatedAt: "2026-01-02T00:00:00.000Z" },
    ]);
    const response = await onRequest(await createContext({ method: "GET", kv }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      userId: "u1",
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
    expect(await response.json()).toEqual({ userId: "u1", trip });
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
    const ack = await response.json();
    expect(ack).toMatchObject({ ok: true, id: "t1", userId: "u1", deleted: false, updatedAt: trip.updatedAt });
    expect(typeof ack.version).toBe("string");
    expect(JSON.parse(kv._store["trips:u1:t1"])).toEqual({ ...trip, version: ack.version, deleted: false });
    expect(JSON.parse(kv._store["trips:u1:index"])).toEqual([
      { id: "t1", title: "杭州三日游", city: "杭州", days: 3, updatedAt: "2026-01-02T00:00:00.000Z", version: ack.version, deleted: false },
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
  it("replaces private trip content with a compact deletion record in the index", async () => {
    const kv = createMockKv();
    const trip = makeTrip();
    kv._store["trips:u1:t1"] = JSON.stringify(trip);
    kv._store["trips:u1:index"] = JSON.stringify([
      { id: "t1", title: "杭州三日游", city: "杭州", days: 3, updatedAt: "2026-01-02T00:00:00.000Z" },
      { id: "t2", title: "其它", city: "上海", days: 1, updatedAt: "2026-01-01T00:00:00.000Z" },
    ]);

    const response = await onRequest(await createContext({ method: "DELETE", path: "/api/trips/t1", kv }));
    expect(response.status).toBe(200);
    const ack = await response.json();
    expect(ack).toMatchObject({ ok: true, id: "t1", userId: "u1", deleted: true });
    const tombstone = JSON.parse(kv._store["trips:u1:t1"]);
    expect(tombstone).toEqual({ id: "t1", version: ack.version, updatedAt: ack.updatedAt, deleted: true });
    expect(kv._store["trips:u1:t1"]).not.toContain("杭州");
    expect(JSON.parse(kv._store["trips:u1:index"])).toEqual([
      tombstone,
      { id: "t2", title: "其它", city: "上海", days: 1, updatedAt: "2026-01-01T00:00:00.000Z" },
    ]);
  });
});


async function createVersionedTrip(kv: ReturnType<typeof createMockKv>) {
  const created = await onRequest(await createContext({ method: "PUT", path: "/api/trips/t1", kv }));
  expect(created.status).toBe(200);
  return created.json();
}

describe("versioned reconciliation", () => {
  it("rejects missing and stale update bases, then accepts the matching version", async () => {
    const kv = createMockKv();
    const first = await createVersionedTrip(kv);
    const stored = kv._store["trips:u1:t1"];
    for (const baseVersion of [undefined, "stale-version"]) {
      const denied = await onRequest(await createContext({ method: "PUT", path: "/api/trips/t1", kv,
        body: { trip: makeTrip({ title: "new" }), baseVersion } }));
      expect(denied.status).toBe(409);
      expect(await denied.json()).toMatchObject({ code: "SYNC_CONFLICT", userId: "u1", remote: { version: first.version, deleted: false } });
      expect(kv._store["trips:u1:t1"]).toBe(stored);
    }
    const accepted = await onRequest(await createContext({ method: "PUT", path: "/api/trips/t1", kv,
      body: { trip: makeTrip({ title: "new" }), baseVersion: first.version } }));
    const second = await accepted.json();
    expect(accepted.status).toBe(200);
    expect(second.version).not.toBe(first.version);
    expect(JSON.parse(kv._store["trips:u1:t1"]).title).toBe("new");
  });

  it("keeps deletion idempotent and prevents stale or matching-tombstone resurrection", async () => {
    const kv = createMockKv();
    const first = await createVersionedTrip(kv);
    const removed = await onRequest(await createContext({ method: "DELETE", path: "/api/trips/t1", kv, body: { baseVersion: first.version } }));
    expect(removed.status).toBe(200);
    const tombstone = (await removed.json()).tombstone;
    const repeat = await onRequest(await createContext({ method: "DELETE", path: "/api/trips/t1", kv, body: { baseVersion: first.version } }));
    expect(repeat.status).toBe(200);
    expect((await repeat.json()).version).toBe(tombstone.version);
    const get = await onRequest(await createContext({ path: "/api/trips/t1", kv }));
    expect(get.status).toBe(410);
    expect(await get.json()).toMatchObject({ code: "TRIP_DELETED", userId: "u1", tombstone });
    for (const baseVersion of [undefined, first.version, tombstone.version]) {
      const put = await onRequest(await createContext({ method: "PUT", path: "/api/trips/t1", kv, body: { trip: makeTrip(), baseVersion } }));
      expect(put.status).toBe(409);
      expect(JSON.parse(kv._store["trips:u1:t1"])).toEqual(tombstone);
    }
  });

  it("rejects a stale deletion of a newer active record", async () => {
    const kv = createMockKv();
    const first = await createVersionedTrip(kv);
    const changed = await onRequest(await createContext({ method: "PUT", path: "/api/trips/t1", kv,
      body: { trip: makeTrip({ title: "newer" }), baseVersion: first.version } }));
    expect(changed.status).toBe(200);
    const stored = kv._store["trips:u1:t1"];
    const removed = await onRequest(await createContext({ method: "DELETE", path: "/api/trips/t1", kv, body: { baseVersion: first.version } }));
    expect(removed.status).toBe(409);
    expect(kv._store["trips:u1:t1"]).toBe(stored);
  });

  it("allows safe legacy adoption once and rejects older legacy content", async () => {
    const kv = createMockKv();
    kv._store["trips:u1:t1"] = JSON.stringify(makeTrip());
    const stale = await onRequest(await createContext({ method: "PUT", path: "/api/trips/t1", kv,
      body: { trip: makeTrip({ updatedAt: "2026-01-01T00:00:00.000Z" }) } }));
    expect(stale.status).toBe(409);
    const adopted = await onRequest(await createContext({ method: "PUT", path: "/api/trips/t1", kv }));
    expect(adopted.status).toBe(200);
    expect(typeof (await adopted.json()).version).toBe("string");
    const blind = await onRequest(await createContext({ method: "PUT", path: "/api/trips/t1", kv }));
    expect(blind.status).toBe(409);
  });

  it("does not create a missing record from an expired or unknown base version", async () => {
    const ctx = await createContext({ method: "PUT", path: "/api/trips/t1", body: { trip: makeTrip(), baseVersion: "expired-version" } });
    const result = await onRequest(ctx);
    expect(result.status).toBe(409);
    expect(await result.json()).toMatchObject({ code: "SYNC_CONFLICT", remote: null });
    expect(ctx.kv._store["trips:u1:t1"]).toBeUndefined();
  });

  it.each(["GET", "PUT", "DELETE"])("rejects captured-account mismatch for %s before writes", async method => {
    const ctx = await createContext({ method, path: "/api/trips/t1", syncUser: "previous-account" });
    const result = await onRequest(ctx);
    expect(result.status).toBe(403);
    expect((await result.json()).code).toBe("SYNC_OWNER_MISMATCH");
    expect(ctx.kv.put).not.toHaveBeenCalled();
  });

  it("rejects a known foreign-owner record even without the captured-account header", async () => {
    const ctx = await createContext({ method: "PUT", path: "/api/trips/t1", body: { trip: makeTrip({ syncOwnerId: "other" }) } });
    const result = await onRequest(ctx);
    expect(result.status).toBe(403);
    expect((await result.json()).code).toBe("SYNC_OWNER_MISMATCH");
    expect(ctx.kv._store["trips:u1:t1"]).toBeUndefined();
  });

  it("isolates identical item IDs by authenticated account", async () => {
    const kv = createMockKv();
    await createVersionedTrip(kv);
    const other = await onRequest(await createContext({ userId: "u2", path: "/api/trips/t1", kv }));
    expect(other.status).toBe(404);
    const created = await onRequest(await createContext({ userId: "u2", method: "PUT", path: "/api/trips/t1", kv, body: { trip: makeTrip({ title: "other" }) } }));
    expect(created.status).toBe(200);
    expect(JSON.parse(kv._store["trips:u1:t1"]).title).toBe("杭州三日游");
    expect(JSON.parse(kv._store["trips:u2:t1"]).title).toBe("other");
  });

  it("rejects the reserved index path rather than exposing or overwriting index data", async () => {
    const response = await onRequest(await createContext({ path: "/api/trips/index" }));
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("NOT_FOUND");
  });

  it("fails closed when index reads fail before content mutation", async () => {
    const kv = createMockKv();
    const existing = JSON.stringify(makeTrip());
    kv._store["trips:u1:t1"] = existing;
    const get = kv.get.getMockImplementation()!;
    kv.get.mockImplementation(async (key, opts) => {
      if (key === "trips:u1:index") throw new Error("index outage");
      return get(key, opts);
    });
    const result = await onRequest(await createContext({ method: "PUT", path: "/api/trips/t1", kv }));
    expect(result.status).toBe(503);
    expect((await result.json()).code).toBe("STORAGE_UNAVAILABLE");
    expect(kv._store["trips:u1:t1"]).toBe(existing);
  });

  it.each([42, {}, ""])("rejects malformed base version %s", async baseVersion => {
    const result = await onRequest(await createContext({ method: "PUT", path: "/api/trips/t1", body: { trip: makeTrip(), baseVersion } }));
    expect(result.status).toBe(400);
    expect((await result.json()).code).toBe("INVALID_REQUEST");
  });

  it("strips device bookkeeping and never accepts a client-selected version", async () => {
    const ctx = await createContext({ method: "PUT", path: "/api/trips/t1", body: { trip: makeTrip({ version: "client-version", syncOwnerId: "u1", syncState: "clean", localRevision: 4, syncConflict: { private: true } }) } });
    const result = await onRequest(ctx);
    expect(result.status).toBe(200);
    const stored = JSON.parse(ctx.kv._store["trips:u1:t1"]);
    expect(stored.version).not.toBe("client-version");
    expect(stored).not.toHaveProperty("syncOwnerId");
    expect(stored).not.toHaveProperty("syncState");
    expect(stored).not.toHaveProperty("syncConflict");
  });
});
