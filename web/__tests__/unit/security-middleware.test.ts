import { describe, expect, it, vi } from "vitest";
import { onRequest } from "../../functions/_middleware.js";

function context(path: string) {
  return {
    request: new Request(`https://example.com${path}`),
    next: vi.fn(async () => new Response("next", { status: 200 })),
  };
}

describe("Pages sensitive artifact middleware", () => {
  it.each([
    "/.dev.vars",
    "/.dev.vars.production",
    "/nested/.env",
    "/nested/.env.local",
    "/config.local.js",
    "/assets/app.js.map",
  ])("returns an uncached 404 for %s", async (path) => {
    const ctx = context(path);
    const response = await onRequest(ctx);
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(ctx.next).not.toHaveBeenCalled();
  });

  it("passes ordinary assets and API routes through", async () => {
    for (const path of ["/", "/index.html", "/modules/app.js", "/api/chat"]) {
      const ctx = context(path);
      const response = await onRequest(ctx);
      expect(response.status).toBe(200);
      expect(ctx.next).toHaveBeenCalledOnce();
    }
  });
});
