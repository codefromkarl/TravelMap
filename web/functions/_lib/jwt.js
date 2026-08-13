/**
 * JWT 签发 / 验证 — 基于 Web Crypto API（Workers 原生支持）
 */

const enc = new TextEncoder();

function b64url(str) {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDec(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return atob(s);
}

async function getKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** 签发 JWT */
export async function signJwt(payload, secret, ttlSec = 86400 * 7) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const iat = Math.floor(Date.now() / 1000);
  const body = b64url(JSON.stringify({ ...payload, iat, exp: iat + ttlSec }));
  const key = await getKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${header}.${body}`));
  const sigB64 = b64url(String.fromCharCode(...new Uint8Array(sig)));
  return `${header}.${body}.${sigB64}`;
}

/** 验证 JWT，返回 payload 或 null */
export async function verifyJwt(token, secret) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  try {
    const key = await getKey(secret);
    const sigBuf = Uint8Array.from(b64urlDec(signature), (c) => c.charCodeAt(0));
    const ok = await crypto.subtle.verify("HMAC", key, sigBuf, enc.encode(`${header}.${body}`));
    if (!ok) return null;
    const payload = JSON.parse(b64urlDec(body));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/** 从请求 Cookie 中提取 JWT */
export function extractToken(request) {
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(/(?:^|;\s*)auth_token=([^;]+)/);
  return m ? m[1] : null;
}

/** 仅允许站内绝对路径，禁止 scheme-relative 和外域 URL。 */
export function isSafeRedirectPath(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}
