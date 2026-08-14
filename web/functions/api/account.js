/**
 * 账号数据导出与删除（GDPR 合规）— Cloudflare Pages Function
 *
 * GET    /api/account/export -> 导出当前用户完整数据 { user: {id,name,email,createdAt}, trips: [...], exportedAt }
 * DELETE /api/account         -> 删除当前用户全部数据 { deleted: { user: true, trips: N } }
 *
 * 需要 JWT 认证（auth_token Cookie）。两个端点都受 IP 限流保护（每 IP 每分钟 ≤ 5 次）。
 * 安全模式对齐 chat.js / trips.js：same-origin 校验、no-store 响应头、稳定错误码。
 * 只删除用户自有数据（user:<id>、trips:<userId>:*）；share:* 分享数据不属于用户，保留。
 */

import { extractToken, verifyJwt } from "../_lib/jwt.js";
import { getUser } from "../_lib/quota.js";

const IP_REQUESTS_PER_MINUTE = 5;
const MAX_BODY_BYTES = 4 * 1024;
const KV_LIST_PAGE_LIMIT = 1000;

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'",
  "X-Content-Type-Options": "nosniff",
  Vary: "Origin",
};

function jsonResponse(status, code, message, extraHeaders = {}) {
  return new Response(JSON.stringify({ error: message, code }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...RESPONSE_HEADERS,
      ...extraHeaders,
    },
  });
}

function successResponse(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...RESPONSE_HEADERS,
    },
  });
}

function hasAllowedOrigin(request) {
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return false;
  return request.headers.get("Sec-Fetch-Site") !== "cross-site";
}

function validateBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "invalid_body";
  return null;
}

async function checkRateLimit(kv, key, limit) {
  try {
    const bucket = Math.floor(Date.now() / 60_000);
    const storageKey = "account-rate:" + bucket + ":" + key;
    const current = Number(await kv.get(storageKey)) || 0;
    if (current >= limit) return false;
    await kv.put(storageKey, String(current + 1), { expirationTtl: 120 });
    return true;
  } catch {
    return null;
  }
}

async function checkIpRateLimit(request, kv) {
  const clientIp = request.headers.get("CF-Connecting-IP");
  if (clientIp) {
    const ipRate = await checkRateLimit(kv, "ip:" + clientIp, IP_REQUESTS_PER_MINUTE);
    if (ipRate === null) {
      return { blocked: true, response: jsonResponse(503, "RATE_LIMIT_UNAVAILABLE", "Rate limiting is unavailable") };
    }
    if (!ipRate) {
      return { blocked: true, response: jsonResponse(429, "RATE_LIMITED", "Too many requests", { "Retry-After": "60" }) };
    }
  }
  return { blocked: false };
}

/** KV list 分页枚举：循环直到 list_complete（无 cursor）。 */
async function listTripKeys(kv, userId) {
  const prefix = "trips:" + userId + ":";
  const keys = [];
  let cursor;
  do {
    const page = await kv.list({ prefix, cursor, limit: KV_LIST_PAGE_LIMIT });
    for (const item of page.keys) keys.push(item.name);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return keys;
}

function exportUserShape(user) {
  return {
    id: user.id,
    name: user.name || "",
    email: user.email || "",
    createdAt: user.createdAt || "",
  };
}

async function handleExport({ env }, user) {
  const kv = env.RATE_LIMIT_KV;
  try {
    const indexKey = "trips:" + user.id + ":index";
    const keys = await listTripKeys(kv, user.id);
    const trips = [];
    for (const key of keys) {
      if (key === indexKey) continue;
      const trip = await kv.get(key, { type: "json" });
      if (trip && typeof trip === "object") trips.push(trip);
    }
    return successResponse({
      user: exportUserShape(user),
      trips,
      exportedAt: new Date().toISOString(),
    });
  } catch {
    return jsonResponse(503, "STORAGE_UNAVAILABLE", "Account storage is unavailable");
  }
}

async function handleDelete({ request, env }, userId) {
  const kv = env.RATE_LIMIT_KV;

  let body = {};
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return jsonResponse(413, "REQUEST_TOO_LARGE", "Request too large");
    }
    if (raw.trim().length > 0) body = JSON.parse(raw);
  } catch {
    return jsonResponse(400, "INVALID_JSON", "Invalid JSON");
  }

  const validationError = validateBody(body);
  if (validationError) {
    return jsonResponse(400, "INVALID_REQUEST", "Invalid request: " + validationError);
  }

  try {
    const indexKey = "trips:" + userId + ":index";
    const keys = await listTripKeys(kv, userId);
    let tripsDeleted = 0;
    for (const key of keys) {
      if (key === indexKey) continue;
      await kv.delete(key);
      tripsDeleted++;
    }
    await kv.delete(indexKey);
    await kv.delete("user:" + userId);
    return successResponse({ deleted: { user: true, trips: tripsDeleted } });
  } catch {
    return jsonResponse(503, "STORAGE_UNAVAILABLE", "Account storage is unavailable");
  }
}

function parseAccountPath(request) {
  try {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2 || parts[0] !== "api" || parts[1] !== "account") return undefined;
    if (parts.length === 2) return null;
    if (parts.length === 3 && parts[2] === "export") return "export";
    return undefined;
  } catch {
    return undefined;
  }
}

export function onRequestOptions(context) {
  if (context?.request && !hasAllowedOrigin(context.request)) {
    return jsonResponse(403, "FORBIDDEN_ORIGIN", "Cross-origin requests are not allowed");
  }
  return new Response(null, {
    status: 204,
    headers: { Allow: "GET, DELETE, OPTIONS", ...RESPONSE_HEADERS },
  });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "GET" && request.method !== "DELETE") {
    return new Response(null, {
      status: 405,
      headers: { Allow: "GET, DELETE, OPTIONS", ...RESPONSE_HEADERS },
    });
  }

  if (!hasAllowedOrigin(request)) {
    return jsonResponse(403, "FORBIDDEN_ORIGIN", "Cross-origin requests are not allowed");
  }

  if (!env.JWT_SECRET || !env.RATE_LIMIT_KV) {
    return jsonResponse(503, "SECURITY_NOT_CONFIGURED", "Account security is not configured");
  }

  const payload = await verifyJwt(extractToken(request), env.JWT_SECRET);
  if (!payload?.sub) {
    return jsonResponse(401, "AUTH_REQUIRED", "Authentication required");
  }

  const user = await getUser(env.RATE_LIMIT_KV, payload.sub);
  if (!user) {
    return jsonResponse(401, "AUTH_REQUIRED", "Authentication required");
  }

  const accountPath = parseAccountPath(request);
  if (accountPath === undefined) {
    return jsonResponse(404, "NOT_FOUND", "Not found");
  }
  if (request.method === "GET" && accountPath !== "export") {
    return jsonResponse(404, "NOT_FOUND", "Not found");
  }
  if (request.method === "DELETE" && accountPath !== null) {
    return jsonResponse(404, "NOT_FOUND", "Not found");
  }

  const rate = await checkIpRateLimit(request, env.RATE_LIMIT_KV);
  if (rate.blocked) return rate.response;

  return request.method === "GET"
    ? handleExport(context, user)
    : handleDelete(context, payload.sub);
}
