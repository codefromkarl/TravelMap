/**
 * Auth handlers 单元测试
 *
 * 覆盖：login、logout、status、callback
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { onRequestGet as onLoginGet } from "../../functions/api/auth/login.js";
import { onRequestPost as onLogoutPost } from "../../functions/api/auth/logout.js";
import { onRequestGet as onStatusGet, onRequestOptions as onStatusOptions } from "../../functions/api/auth/status.js";
import { onRequestGet as onCallbackGet } from "../../functions/api/auth/callback.js";

const SECRET = "test-secret";

function mockContext(request: Request, envOverrides: Record<string, unknown> = {}) {
  return {
    request,
    env: {
      JWT_SECRET: SECRET,
      GITHUB_CLIENT_ID: "test-github-id",
      GOOGLE_CLIENT_ID: "test-google-id",
      GITHUB_CLIENT_SECRET: "test-github-secret",
      GOOGLE_CLIENT_SECRET: "test-google-secret",
      RATE_LIMIT_KV: {
        get: vi.fn(),
        put: vi.fn(),
      },
      ...envOverrides,
    },
  };
}

// ─── login ────────────────────────────────────────────────
describe("auth/login", () => {
  it("不支持的 provider 应返回 400", async () => {
    const req = new Request("https://example.com/api/auth/login?provider=wechat");
    const res = await onLoginGet(mockContext(req));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Unsupported");
  });

  it("缺少 clientId 时应返回 503", async () => {
    const req = new Request("https://example.com/api/auth/login?provider=github");
    const res = await onLoginGet(mockContext(req, { GITHUB_CLIENT_ID: undefined }));
    expect(res.status).toBe(503);
  });

  it("缺少 JWT_SECRET 时应 fail closed", async () => {
    const req = new Request("https://example.com/api/auth/login?provider=github");
    const res = await onLoginGet(mockContext(req, { JWT_SECRET: undefined }));
    expect(res.status).toBe(503);
  });

  it.each([
    "https://attacker.example/after-login",
    "//attacker.example/after-login",
    "/\\attacker.example/after-login",
    "/\n/attacker.example/after-login",
  ])("拒绝外域 redirect: %s", async (redirect) => {
    const req = new Request(`https://example.com/api/auth/login?provider=github&redirect=${encodeURIComponent(redirect)}`);
    const res = await onLoginGet(mockContext(req));
    expect(res.status).toBe(400);
  });

  it("GitHub 登录应返回 302 重定向", async () => {
    const req = new Request("https://example.com/api/auth/login?provider=github&redirect=/dashboard");
    const res = await onLoginGet(mockContext(req));
    expect(res.status).toBe(302);
    const loc = res.headers.get("Location") || "";
    expect(loc).toContain("github.com/login/oauth/authorize");
    expect(loc).toContain("client_id=test-github-id");
    expect(loc).toContain("redirect_uri=");
  });

  it("Google 登录应包含额外参数", async () => {
    const req = new Request("https://example.com/api/auth/login?provider=google");
    const res = await onLoginGet(mockContext(req));
    expect(res.status).toBe(302);
    const loc = res.headers.get("Location") || "";
    expect(loc).toContain("accounts.google.com");
    expect(loc).toContain("access_type=online");
    expect(loc).toContain("prompt=consent");
  });
});

// ─── logout ───────────────────────────────────────────────
describe("auth/logout", () => {
  it("应清除 auth_token cookie", async () => {
    const res = await onLogoutPost();
    expect(res.status).toBe(200);
    const cookie = res.headers.get("Set-Cookie") || "";
    expect(cookie).toContain("auth_token=");
    expect(cookie).toContain("Max-Age=0");
  });
});

// ─── status ───────────────────────────────────────────────
describe("auth/status", () => {
  it("OPTIONS 请求应返回 204", async () => {
    const res = await onStatusOptions();
    expect(res.status).toBe(204);
  });

  it("无 token 时应返回 401", async () => {
    const req = new Request("https://example.com/api/auth/status");
    const res = await onStatusGet(mockContext(req));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.authenticated).toBe(false);
  });

  it("缺少 JWT_SECRET 时应返回 503", async () => {
    const req = new Request("https://example.com/api/auth/status");
    const res = await onStatusGet(mockContext(req, { JWT_SECRET: undefined }));
    expect(res.status).toBe(503);
  });

  it("无效 token 时应返回 401", async () => {
    const req = new Request("https://example.com/api/auth/status", {
      headers: { Cookie: "auth_token=invalid-token" },
    });
    const res = await onStatusGet(mockContext(req));
    expect(res.status).toBe(401);
  });

  it("有效 token 时应返回用户信息和配额", async () => {
    const { signJwt } = await import("../../functions/_lib/jwt.js");
    const token = await signJwt({ sub: "github_123", name: "Test" }, SECRET, 60);

    const kv = { get: vi.fn().mockResolvedValue({ id: "github_123", name: "Test", provider: "github", usage: { apiCalls: 5 } }) };
    const req = new Request("https://example.com/api/auth/status", {
      headers: { Cookie: `auth_token=${token}` },
    });
    const res = await onStatusGet(mockContext(req, { RATE_LIMIT_KV: kv }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authenticated).toBe(true);
    expect(body.user.id).toBe("github_123");
    expect(body.quota.used).toBe(5);
  });
});

// ─── callback ─────────────────────────────────────────────
describe("auth/callback", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("缺少 code 或 state 应返回 400", async () => {
    const req = new Request("https://example.com/api/auth/callback?code=abc");
    const res = await onCallbackGet(mockContext(req));
    expect(res.status).toBe(400);
  });

  it("无效 state 应返回 400", async () => {
    const req = new Request("https://example.com/api/auth/callback?code=abc&state=invalid");
    const res = await onCallbackGet(mockContext(req));
    expect(res.status).toBe(400);
  });

  it("缺少 JWT_SECRET 时应返回 503", async () => {
    const req = new Request("https://example.com/api/auth/callback?code=abc&state=state");
    const res = await onCallbackGet(mockContext(req, { JWT_SECRET: undefined }));
    expect(res.status).toBe(503);
  });

  it("拒绝 state 中的外域 redirect", async () => {
    const { signJwt } = await import("../../functions/_lib/jwt.js");
    const state = await signJwt({ provider: "github", redirect: "https://attacker.example" }, SECRET, 60);
    const req = new Request(`https://example.com/api/auth/callback?code=abc&state=${state}`);
    const res = await onCallbackGet(mockContext(req));
    expect(res.status).toBe(400);
  });

  it("KV 未配置时应返回 503", async () => {
    const { signJwt } = await import("../../functions/_lib/jwt.js");
    const state = await signJwt({ provider: "github", redirect: "/" }, SECRET, 60);

    // mock OAuth exchange 成功，使流程到达 KV 检查
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ access_token: "tok" }) })
      .mockResolvedValueOnce({ json: async () => ({ id: 1, name: "Test", login: "test", avatar_url: "", email: "" }) }));

    const req = new Request(`https://example.com/api/auth/callback?code=abc&state=${state}`);
    const res = await onCallbackGet(mockContext(req, { RATE_LIMIT_KV: undefined }));
    expect(res.status).toBe(503);
  });

  it("GitHub OAuth 成功时应重定向并设置 cookie", async () => {
    const { signJwt } = await import("../../functions/_lib/jwt.js");
    const state = await signJwt({ provider: "github", redirect: "/dashboard" }, SECRET, 60);

    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({
        json: async () => ({ access_token: "gh_token_123" }),
      })
      .mockResolvedValueOnce({
        json: async () => ({ id: 42, name: "Test User", login: "testuser", avatar_url: "https://avatar", email: "test@example.com" }),
      }));

    const kv = { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined) };
    const req = new Request(`https://example.com/api/auth/callback?code=abc&state=${state}`);
    const res = await onCallbackGet(mockContext(req, { RATE_LIMIT_KV: kv }));

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("/dashboard");
    const cookie = res.headers.get("Set-Cookie") || "";
    expect(cookie).toContain("auth_token=");
    expect(kv.put).toHaveBeenCalled();
  });
});
