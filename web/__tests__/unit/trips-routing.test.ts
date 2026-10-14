/** Real Pages routing through local workerd, with isolated in-memory KV. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { signJwt } from "../../functions/_lib/jwt.js";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const secret = "local-routing-test-secret";
let output: string;
let runtime: Miniflare;
let token: string;

beforeAll(async () => {
  output = await mkdtemp(path.join(tmpdir(), "travelmap-sync-route-"));
  const compiled = spawnSync(path.join(projectRoot, "node_modules/.bin/wrangler"), [
    "pages", "functions", "build", "web/functions", "--outdir", output,
  ], { cwd: projectRoot, encoding: "utf8", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
  expect(compiled.status, compiled.stderr).toBe(0);
  const runtimeOptions = convertV4MiniflareOptions({
    modules: true,
    scriptPath: path.join(output, "index.js"),
    modulesRoot: output,
    compatibilityDate: "2026-08-13",
    compatibilityFlags: ["nodejs_compat"],
    cf: false,
    bindings: { JWT_SECRET: secret },
    kvNamespaces: ["RATE_LIMIT_KV"],
    serviceBindings: { ASSETS: async () => new Response("Static fallback", { status: 404 }) },
  });
  runtimeOptions.telemetry = { enabled: false };
  runtime = new Miniflare(runtimeOptions);
  const kv = await runtime.getKVNamespace("RATE_LIMIT_KV");
  await kv.put("user:route-user", JSON.stringify({ id: "route-user", usage: { apiCalls: 0 } }));
  token = await signJwt({ sub: "route-user" }, secret);
}, 30_000);

afterAll(async () => {
  if (runtime) await runtime.dispose();
  if (output) await rm(output, { recursive: true, force: true });
});

function request(method: string, endpoint: string, body?: unknown) {
  return runtime.dispatchFetch(`https://travel.example${endpoint}`, {
    method,
    headers: { Origin: "https://travel.example", Cookie: `auth_token=${token}`,
      "Content-Type": "application/json", "X-Sync-User": "route-user" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("compiled Pages itinerary item routes", () => {
  it("routes list and item create/read/delete through authentication and shared version semantics", async () => {
    const trip = { id: "route-trip", title: "Local routing proof", city: "杭州",
      updatedAt: "2026-10-13T00:00:00.000Z", days: 1, markdown: "private itinerary" };
    const created = await request("PUT", "/api/trips/route-trip", { trip });
    expect(created.status).toBe(200);
    const ack = await created.json() as { version: string; userId: string };
    expect(ack.userId).toBe("route-user");
    expect(typeof ack.version).toBe("string");

    const read = await request("GET", "/api/trips/route-trip");
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({ userId: "route-user", trip: { title: trip.title, version: ack.version } });
    const list = await request("GET", "/api/trips");
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({ userId: "route-user", trips: [{ id: trip.id, version: ack.version }] });

    const removed = await request("DELETE", "/api/trips/route-trip", { baseVersion: ack.version });
    expect(removed.status).toBe(200);
    const deleted = await request("GET", "/api/trips/route-trip");
    expect(deleted.status).toBe(410);
    expect(await deleted.text()).not.toContain("private itinerary");
    const stale = await request("PUT", "/api/trips/route-trip", { trip, baseVersion: ack.version });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ code: "SYNC_CONFLICT", remote: { deleted: true } });
  });

  it("rejects unauthenticated item requests rather than falling back to static HTML", async () => {
    const response = await runtime.dispatchFetch("https://travel.example/api/trips/route-trip", {
      headers: { Origin: "https://travel.example" },
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "AUTH_REQUIRED" });
  });
});
