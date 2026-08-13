import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestOptions, onRequestPost } from "../../functions/api/logs.js";
import { signJwt } from "../../functions/_lib/jwt.js";

const SECRET = "logs-test-secret";

async function context(options: { origin?: string; authenticated?: boolean; body?: unknown } = {}) {
  const user = { id: "u1", usage: { apiCalls: 0 } };
  const kv = { get: vi.fn(async () => user) };
  const headers = new Headers({
    "Content-Type": "application/json",
    Origin: options.origin || "https://example.com",
  });
  if (options.authenticated !== false) {
    headers.set("Cookie", `auth_token=${await signJwt({ sub: "u1" }, SECRET)}`);
  }
  return {
    request: new Request("https://example.com/api/logs", {
      method: "POST",
      headers,
      body: JSON.stringify(options.body ?? {
        entries: [{ level: "error", time: "2026-08-13T00:00:00Z", msg: "failed", component: "chat" }],
      }),
    }),
    env: { JWT_SECRET: SECRET, RATE_LIMIT_KV: kv },
  };
}

describe("secure log ingestion", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("does not expose wildcard CORS", () => {
    expect(onRequestOptions().headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("rejects cross-origin and anonymous requests", async () => {
    expect((await onRequestPost(await context({ origin: "https://attacker.example" }))).status).toBe(403);
    expect((await onRequestPost(await context({ authenticated: false }))).status).toBe(401);
  });

  it("fails closed without auth bindings", async () => {
    const ctx = await context();
    ctx.env.JWT_SECRET = "";
    expect((await onRequestPost(ctx)).status).toBe(503);
  });

  it("redacts credential-shaped content and ignores arbitrary data overrides", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await onRequestPost(await context({
      body: {
        entries: [{
          level: "error",
          time: "2026-08-13T00:00:00Z",
          msg: "Authorization: Bearer sk-abcdefghijklmnopqrstuvwxyz1234",
          component: "chat",
          data: { source: "attacker", apiKey: "sk-abcdefghijklmnopqrstuvwxyz1234" },
        }],
      },
    }));
    expect(response.status).toBe(200);
    const logged = errorSpy.mock.calls.flat().join(" ");
    expect(logged).toContain("[REDACTED]");
    expect(logged).not.toContain("abcdefghijklmnopqrstuvwxyz1234");
    expect(logged).not.toContain('"source":"attacker"');
  });
});
