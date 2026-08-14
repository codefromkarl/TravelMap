/**
 * 分享短链服务端化 — Cloudflare Pages Function
 *
 * POST /api/share  body { content: string } -> 保存到 KV，返回 { id }
 * GET  /api/share?id=<id> -> 返回 { content }
 *
 * 游客可访问（无 JWT），但创建受 IP 限流保护（每 IP 每分钟 ≤ 10 次）。
 * 安全模式对齐 chat.js：same-origin 校验、no-store 响应头、稳定错误码。
 */

const MAX_CONTENT_BYTES = 32 * 1024;
const MAX_BODY_BYTES = 40 * 1024;
const IP_REQUESTS_PER_MINUTE = 10;
const SHARE_TTL_SECONDS = 30 * 24 * 60 * 60;

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

function hasAllowedOrigin(request) {
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return false;
  return request.headers.get("Sec-Fetch-Site") !== "cross-site";
}

function validateBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "invalid_body";
  if (typeof body.content !== "string" || body.content.length === 0) return "content_required";
  return null;
}

async function checkRateLimit(kv, key, limit) {
  try {
    const bucket = Math.floor(Date.now() / 60_000);
    const storageKey = "share-rate:" + bucket + ":" + key;
    const current = Number(await kv.get(storageKey)) || 0;
    if (current >= limit) return false;
    await kv.put(storageKey, String(current + 1), { expirationTtl: 120 });
    return true;
  } catch {
    return null;
  }
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

async function handleGet({ request, env }) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return jsonResponse(400, "INVALID_REQUEST", "Missing share id");
  }

  try {
    const content = await env.RATE_LIMIT_KV.get("share:" + id);
    if (!content) {
      return jsonResponse(404, "NOT_FOUND", "Share not found");
    }
    return successResponse({ content });
  } catch {
    return jsonResponse(503, "STORAGE_UNAVAILABLE", "Share storage is unavailable");
  }
}

async function handlePost({ request, env }) {
  const clientIp = request.headers.get("CF-Connecting-IP");
  if (clientIp) {
    const ipRate = await checkRateLimit(env.RATE_LIMIT_KV, "ip:" + clientIp, IP_REQUESTS_PER_MINUTE);
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

  if (new TextEncoder().encode(body.content).byteLength > MAX_CONTENT_BYTES) {
    return jsonResponse(413, "CONTENT_TOO_LARGE", "Share content too large");
  }

  const id = crypto.randomUUID();
  try {
    await env.RATE_LIMIT_KV.put("share:" + id, body.content, { expirationTtl: SHARE_TTL_SECONDS });
  } catch {
    return jsonResponse(503, "STORAGE_UNAVAILABLE", "Share storage is unavailable");
  }

  return successResponse({ id });
}

export function onRequestOptions(context) {
  if (context?.request && !hasAllowedOrigin(context.request)) {
    return jsonResponse(403, "FORBIDDEN_ORIGIN", "Cross-origin requests are not allowed");
  }
  return new Response(null, {
    status: 204,
    headers: { Allow: "POST, GET, OPTIONS", ...RESPONSE_HEADERS }
  });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST" && request.method !== "GET") {
    return new Response(null, {
      status: 405,
      headers: { Allow: "POST, GET, OPTIONS", ...RESPONSE_HEADERS }
    });
  }

  if (!hasAllowedOrigin(request)) {
    return jsonResponse(403, "FORBIDDEN_ORIGIN", "Cross-origin requests are not allowed");
  }

  if (!env.RATE_LIMIT_KV) {
    return jsonResponse(503, "SECURITY_NOT_CONFIGURED", "Share service is not configured");
  }

  return request.method === "GET" ? handleGet(context) : handlePost(context);
}
