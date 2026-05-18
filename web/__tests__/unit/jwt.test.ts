/**
 * JWT 模块单元测试
 *
 * 覆盖：签发、验证、过期检测、无效 token、Cookie 提取
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { signJwt, verifyJwt, extractToken } from "../../functions/_lib/jwt.js";

const SECRET = "test-jwt-secret-🔑";
const ALT_SECRET = "another-secret";

// ─── 辅助：构造带 Cookie 的 Request ─────────────────────────
function mockRequest(cookieStr?: string): Request {
  const headers = new Headers();
  if (cookieStr) headers.set("Cookie", cookieStr);
  return new Request("https://example.com", { headers });
}

// ─── signJwt ────────────────────────────────────────────────
describe("signJwt", () => {
  it("应返回三段式 JWT 字符串", async () => {
    const token = await signJwt({ sub: "user-1" }, SECRET);
    expect(token).toBeDefined();
    const parts = token.split(".");
    expect(parts).toHaveLength(3);
    // 每段都是 base64url 编码
    for (const part of parts) {
      expect(part).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("payload 应包含 iat 和 exp 字段", async () => {
    const token = await signJwt({ sub: "user-1" }, SECRET);
    const [, bodyB64] = token.split(".");
    const decoded = JSON.parse(atob(bodyB64.replace(/-/g, "+").replace(/_/g, "/")));
    expect(decoded).toHaveProperty("iat");
    expect(decoded).toHaveProperty("exp");
    expect(decoded.sub).toBe("user-1");
  });

  it("默认 TTL 应为 7 天（604800 秒）", async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await signJwt({ sub: "u" }, SECRET);
    const after = Math.floor(Date.now() / 1000);
    const [, bodyB64] = token.split(".");
    const decoded = JSON.parse(atob(bodyB64.replace(/-/g, "+").replace(/_/g, "/")));
    expect(decoded.exp - decoded.iat).toBe(86400 * 7);
    expect(decoded.iat).toBeGreaterThanOrEqual(before);
    expect(decoded.iat).toBeLessThanOrEqual(after);
  });

  it("应支持自定义 TTL", async () => {
    const token = await signJwt({ sub: "u" }, SECRET, 3600);
    const [, bodyB64] = token.split(".");
    const decoded = JSON.parse(atob(bodyB64.replace(/-/g, "+").replace(/_/g, "/")));
    expect(decoded.exp - decoded.iat).toBe(3600);
  });

  it("不同 secret 签发的 token 应不同", async () => {
    const t1 = await signJwt({ sub: "u" }, SECRET);
    const t2 = await signJwt({ sub: "u" }, ALT_SECRET);
    expect(t1).not.toBe(t2);
  });
});

// ─── verifyJwt ──────────────────────────────────────────────
describe("verifyJwt", () => {
  it("用正确 secret 应返回 payload", async () => {
    const token = await signJwt({ sub: "user-1", role: "admin" }, SECRET);
    const payload = await verifyJwt(token, SECRET);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe("user-1");
    expect(payload!.role).toBe("admin");
  });

  it("用错误 secret 应返回 null", async () => {
    const token = await signJwt({ sub: "u" }, SECRET);
    const result = await verifyJwt(token, ALT_SECRET);
    expect(result).toBeNull();
  });

  it("token 为 null 应返回 null", async () => {
    const result = await verifyJwt(null as any, SECRET);
    expect(result).toBeNull();
  });

  it("token 为 undefined 应返回 null", async () => {
    const result = await verifyJwt(undefined as any, SECRET);
    expect(result).toBeNull();
  });

  it("空字符串应返回 null", async () => {
    const result = await verifyJwt("", SECRET);
    expect(result).toBeNull();
  });

  it("格式错误的 token（少于三段）应返回 null", async () => {
    const result = await verifyJwt("only.two", SECRET);
    expect(result).toBeNull();
  });

  it("格式错误的 token（多于三段）应返回 null", async () => {
    const result = await verifyJwt("a.b.c.d", SECRET);
    expect(result).toBeNull();
  });

  it("被篡改的 token 应返回 null", async () => {
    const token = await signJwt({ sub: "user-1" }, SECRET);
    const parts = token.split(".");
    // 篡改 payload
    const tampered = `${parts[0]}.${btoa(JSON.stringify({ sub: "hacker", exp: 9999999999 }))}.${parts[2]}`;
    const result = await verifyJwt(tampered, SECRET);
    expect(result).toBeNull();
  });

  it("过期的 token 应返回 null", async () => {
    // TTL = 0 秒，签发即过期
    const token = await signJwt({ sub: "u" }, SECRET, 0);
    // 等一秒确保 exp < now
    await new Promise((r) => setTimeout(r, 1100));
    const result = await verifyJwt(token, SECRET);
    expect(result).toBeNull();
  });

  it("未过期 token 应正常验证", async () => {
    const token = await signJwt({ sub: "u" }, SECRET, 3600);
    const result = await verifyJwt(token, SECRET);
    expect(result).not.toBeNull();
    expect(result!.sub).toBe("u");
  });

  it("signature 被篡改应返回 null", async () => {
    const token = await signJwt({ sub: "u" }, SECRET);
    const parts = token.split(".");
    const tampered = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -4)}XXXX`;
    const result = await verifyJwt(tampered, SECRET);
    expect(result).toBeNull();
  });
});

// ─── extractToken ───────────────────────────────────────────
describe("extractToken", () => {
  it("应从 Cookie 中提取 auth_token", () => {
    const req = mockRequest("auth_token=abc123; path=/");
    expect(extractToken(req)).toBe("abc123");
  });

  it("Cookie 无 auth_token 应返回 null", () => {
    const req = mockRequest("other=value");
    expect(extractToken(req)).toBeNull();
  });

  it("无 Cookie 头应返回 null", () => {
    const req = mockRequest();
    expect(extractToken(req)).toBeNull();
  });

  it("auth_token 在 Cookie 末尾（无分号）也应提取", () => {
    const req = mockRequest("a=1; auth_token=tok-end");
    expect(extractToken(req)).toBe("tok-end");
  });

  it("auth_token 为第一个 Cookie", () => {
    const req = mockRequest("auth_token=first; b=2");
    expect(extractToken(req)).toBe("first");
  });
});
