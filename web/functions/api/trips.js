/**
 * 行程云同步服务端化 — Cloudflare Pages Function
 *
 * GET    /api/trips        -> 当前用户行程摘要 { trips: [{id,title,city,days,updatedAt}] }
 * GET    /api/trips/<id>   -> 单个完整行程 { trip }
 * PUT    /api/trips/<id>   -> body { trip }，写入 KV（TTL 90 天）并更新 index
 * DELETE /api/trips/<id>   -> 删除行程并从 index 移除
 *
 * 需要 JWT 认证（auth_token Cookie）。PUT 受 IP 限流保护（每 IP 每分钟 ≤ 30 次）。
 * 安全模式对齐 chat.js / share.js：same-origin 校验、no-store 响应头、稳定错误码。
 */

import { extractToken, verifyJwt } from "../_lib/jwt.js";
import { getUser } from "../_lib/quota.js";

const MAX_TRIP_BYTES = 256 * 1024;
const MAX_BODY_BYTES = 256 * 1024 + 1024;
const IP_REQUESTS_PER_MINUTE = 30;
const TRIP_TTL_SECONDS = 90 * 24 * 60 * 60;

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
  if (!body.trip || typeof body.trip !== "object" || Array.isArray(body.trip)) return "trip_required";
  const trip = body.trip;
  if (typeof trip.id !== "string" || trip.id.length === 0) return "trip_id_required";
  if (typeof trip.title !== "string" || trip.title.length === 0) return "trip_title_required";
  if (typeof trip.updatedAt !== "string" || trip.updatedAt.length === 0) return "trip_updated_at_required";
  if (Number.isNaN(Date.parse(trip.updatedAt))) return "trip_updated_at_invalid";
  return null;
}

function tripSummary(trip) {
  return {
    id: trip.id,
    title: trip.title,
    city: typeof trip.city === "string" ? trip.city : "",
    days: Array.isArray(trip.days) ? trip.days.length : (Number.isFinite(trip.days) ? trip.days : 0),
    updatedAt: trip.updatedAt,
  };
}

async function checkRateLimit(kv, key, limit) {
  try {
    const bucket = Math.floor(Date.now() / 60_000);
    const storageKey = "trips-rate:" + bucket + ":" + key;
    const current = Number(await kv.get(storageKey)) || 0;
    if (current >= limit) return false;
    await kv.put(storageKey, String(current + 1), { expirationTtl: 120 });
    return true;
  } catch {
    return null;
  }
}

async function readIndex(kv, userId) {
  const raw = await kv.get("trips:" + userId + ":index", { type: "json" });
  return Array.isArray(raw) ? raw : [];
}

async function writeIndex(kv, userId, summary) {
  let list = [];
  try {
    list = await readIndex(kv, userId);
  } catch {
    // index 读取失败时视为空，用本次写入重建
  }
  const others = list.filter((item) => item && item.id !== summary.id);
  others.push(summary);
  others.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  await kv.put("trips:" + userId + ":index", JSON.stringify(others), {
    expirationTtl: TRIP_TTL_SECONDS,
  });
}

async function removeFromIndex(kv, userId, tripId) {
  let list = [];
  try {
    list = await readIndex(kv, userId);
  } catch {
    list = [];
  }
  const next = list.filter((item) => item && item.id !== tripId);
  await kv.put("trips:" + userId + ":index", JSON.stringify(next), {
    expirationTtl: TRIP_TTL_SECONDS,
  });
}

function parseTripId(request) {
  try {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2 || parts[0] !== "api" || parts[1] !== "trips") return undefined;
    if (parts.length === 2) return null;
    if (parts.length === 3) return decodeURIComponent(parts[2]);
    return undefined;
  } catch {
    return undefined;
  }
}

async function handleListTrips({ env }, userId) {
  try {
    const trips = await readIndex(env.RATE_LIMIT_KV, userId);
    return successResponse({ trips });
  } catch {
    return jsonResponse(503, "STORAGE_UNAVAILABLE", "Trip storage is unavailable");
  }
}

async function handleGetTrip({ env }, userId, tripId) {
  try {
    const trip = await env.RATE_LIMIT_KV.get("trips:" + userId + ":" + tripId, { type: "json" });
    if (!trip) return jsonResponse(404, "NOT_FOUND", "Trip not found");
    return successResponse({ trip });
  } catch {
    return jsonResponse(503, "STORAGE_UNAVAILABLE", "Trip storage is unavailable");
  }
}

async function handlePutTrip({ request, env }, userId, tripId) {
  const kv = env.RATE_LIMIT_KV;

  const clientIp = request.headers.get("CF-Connecting-IP");
  if (clientIp) {
    const ipRate = await checkRateLimit(kv, "ip:" + clientIp, IP_REQUESTS_PER_MINUTE);
    if (ipRate === null) {
      return jsonResponse(503, "RATE_LIMIT_UNAVAILABLE", "Rate limiting is unavailable");
    }
    if (!ipRate) {
      return jsonResponse(429, "RATE_LIMITED", "Too many requests", { "Retry-After": "60" });
    }
  }

  let body;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return jsonResponse(413, "REQUEST_TOO_LARGE", "Request too large");
    }
    body = JSON.parse(raw);
  } catch {
    return jsonResponse(400, "INVALID_JSON", "Invalid JSON");
  }

  const validationError = validateBody(body);
  if (validationError) {
    return jsonResponse(400, "INVALID_REQUEST", "Invalid request: " + validationError);
  }

  const trip = body.trip;
  if (trip.id !== tripId) {
    return jsonResponse(400, "INVALID_REQUEST", "Invalid request: trip id does not match path");
  }

  if (new TextEncoder().encode(JSON.stringify(trip)).byteLength > MAX_TRIP_BYTES) {
    return jsonResponse(413, "TRIP_TOO_LARGE", "Trip too large");
  }

  try {
    await kv.put("trips:" + userId + ":" + tripId, JSON.stringify(trip), {
      expirationTtl: TRIP_TTL_SECONDS,
    });
    await writeIndex(kv, userId, tripSummary(trip));
  } catch {
    return jsonResponse(503, "STORAGE_UNAVAILABLE", "Trip storage is unavailable");
  }

  return successResponse({ ok: true, id: tripId });
}

async function handleDeleteTrip({ env }, userId, tripId) {
  const kv = env.RATE_LIMIT_KV;
  try {
    await kv.delete("trips:" + userId + ":" + tripId);
    await removeFromIndex(kv, userId, tripId);
  } catch {
    return jsonResponse(503, "STORAGE_UNAVAILABLE", "Trip storage is unavailable");
  }
  return successResponse({ ok: true });
}

export function onRequestOptions(context) {
  if (context?.request && !hasAllowedOrigin(context.request)) {
    return jsonResponse(403, "FORBIDDEN_ORIGIN", "Cross-origin requests are not allowed");
  }
  return new Response(null, {
    status: 204,
    headers: { Allow: "GET, PUT, DELETE, OPTIONS", ...RESPONSE_HEADERS },
  });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "GET" && request.method !== "PUT" && request.method !== "DELETE") {
    return new Response(null, {
      status: 405,
      headers: { Allow: "GET, PUT, DELETE, OPTIONS", ...RESPONSE_HEADERS },
    });
  }

  if (!hasAllowedOrigin(request)) {
    return jsonResponse(403, "FORBIDDEN_ORIGIN", "Cross-origin requests are not allowed");
  }

  if (!env.JWT_SECRET || !env.RATE_LIMIT_KV) {
    return jsonResponse(503, "SECURITY_NOT_CONFIGURED", "Trips security is not configured");
  }

  const payload = await verifyJwt(extractToken(request), env.JWT_SECRET);
  if (!payload?.sub) {
    return jsonResponse(401, "AUTH_REQUIRED", "Authentication required");
  }

  const user = await getUser(env.RATE_LIMIT_KV, payload.sub);
  if (!user) {
    return jsonResponse(401, "AUTH_REQUIRED", "Authentication required");
  }

  const tripId = parseTripId(request);
  if (tripId === undefined) {
    return jsonResponse(404, "NOT_FOUND", "Not found");
  }

  if (request.method === "GET") {
    return tripId === null
      ? handleListTrips(context, payload.sub)
      : handleGetTrip(context, payload.sub, tripId);
  }

  if (tripId === null) {
    return jsonResponse(400, "INVALID_REQUEST", "Missing trip id");
  }

  return request.method === "PUT"
    ? handlePutTrip(context, payload.sub, tripId)
    : handleDeleteTrip(context, payload.sub, tripId);
}
