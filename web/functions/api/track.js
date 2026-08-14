/**
 * 前端轻量埋点 — POST /api/track（自建分析）
 *
 * 同源上报，游客与登录用户均可（有 JWT 则记录 userId，解析失败不阻断）。
 * 仅记录 type 与结构化 meta；IP 每分钟限流 20 次，避免刷量。
 * console.log JSON 与 logs.ts 风格一致。
 */

import { extractToken, verifyJwt } from "../_lib/jwt.js";

const MAX_BODY_BYTES = 8 * 1024;
const MAX_TYPE_LENGTH = 64;
const MAX_META_LENGTH = 4096;
const IP_REQUESTS_PER_MINUTE = 20;
const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  Vary: "Origin",
};

function response(status, body) {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  return (!origin || origin === new URL(request.url).origin)
    && request.headers.get("Sec-Fetch-Site") !== "cross-site";
}

function safeToken(value, max = 128) {
  if (typeof value !== "string") return undefined;
  return value.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, max);
}

function redactMeta(value) {
  try {
    return JSON.stringify(value)
      .replace(/(?:Bearer\s+)?(?:sk|ghp|github_pat|AIza)[-_a-zA-Z0-9]{12,}/g, "[REDACTED]")
      .replace(/(?:api[_-]?key|authorization|cookie|token)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
      .slice(0, MAX_META_LENGTH);
  } catch {
    return undefined;
  }
}

// 本地副本：与 chat.js 相同的 KV 分钟桶限流模式。
async function checkRateLimit(kv, key, limit) {
  try {
    const bucket = Math.floor(Date.now() / 60_000);
    const storageKey = `track-rate:${bucket}:${key}`;
    const current = Number(await kv.get(storageKey)) || 0;
    if (current >= limit) return false;
    await kv.put(storageKey, String(current + 1), { expirationTtl: 120 });
    return true;
  } catch {
    return null;
  }
}

export function onRequestOptions(context) {
  if (context?.request && !sameOrigin(context.request)) {
    return response(403, { error: "Cross-origin requests are not allowed" });
  }
  return new Response(null, { status: 204, headers: { Allow: "POST, OPTIONS", ...HEADERS } });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!sameOrigin(request)) {
    return response(403, { error: "Cross-origin requests are not allowed" });
  }

  if (!env.RATE_LIMIT_KV) {
    return response(503, { error: "Analytics ingestion is not configured" });
  }

  const clientIp = request.headers.get("CF-Connecting-IP");
  if (clientIp) {
    const allowed = await checkRateLimit(env.RATE_LIMIT_KV, `ip:${clientIp}`, IP_REQUESTS_PER_MINUTE);
    if (allowed === null) {
      return response(503, { error: "Rate limiting is unavailable" });
    }
    if (!allowed) {
      return response(429, { error: "Too many requests" });
    }
  }

  // 可选认证：有 JWT 就尽力记录 userId，游客允许。
  let userId;
  if (env.JWT_SECRET) {
    const payload = await verifyJwt(extractToken(request), env.JWT_SECRET);
    if (payload?.sub) userId = safeToken(payload.sub, 64);
  }

  let body;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return response(413, { error: "Request too large" });
    }
    body = JSON.parse(raw);
  } catch {
    return response(400, { error: "Invalid JSON" });
  }

  const type = typeof body.type === "string" ? body.type.trim().slice(0, MAX_TYPE_LENGTH) : "";
  if (!type) {
    return response(400, { error: "Invalid request: type required" });
  }

  const meta = body.meta && typeof body.meta === "object" && !Array.isArray(body.meta)
    ? redactMeta(body.meta)
    : undefined;

  console.log(JSON.stringify({
    source: "frontend-analytics",
    type: safeToken(type, MAX_TYPE_LENGTH),
    time: new Date().toISOString(),
    userId,
    ip: clientIp,
    meta,
  }));

  return response(200, { accepted: true });
}
