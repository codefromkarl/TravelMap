/** Authenticated, same-origin map lookup. Credentials and routes are server-owned. */
import { extractToken, verifyJwt } from "../_lib/jwt.js";

const MAX_BODY_BYTES = 8192;
const MAX_RESPONSE_BYTES = 512 * 1024;
const UPSTREAM_TIMEOUT_MS = 8000;
const HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'",
  "X-Content-Type-Options": "nosniff",
  Vary: "Origin",
};
const PARAMS = {
  "place/text": new Set(["city", "citylimit", "types", "keywords", "offset", "extensions"]),
  "place/around": new Set(["location", "types", "radius", "sortrule", "offset", "page", "extensions", "keywords"]),
};

function jsonResponse(status, data, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...HEADERS, ...extraHeaders },
  });
}
function error(status, code) {
  return jsonResponse(status, { code, error: "Map request unavailable" }, status === 429 ? { "Retry-After": "60" } : {});
}
function sameOrigin(request) {
  return request.headers.get("Origin") === new URL(request.url).origin && request.headers.get("Sec-Fetch-Site") !== "cross-site";
}
function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function boundedText(value, max) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
}
function integer(value, min, max) {
  return /^(?:0|[1-9]\d*)$/.test(String(value)) && Number(value) >= min && Number(value) <= max;
}
function validBody(body) {
  if (!plainObject(body) || Object.keys(body).some(key => !["endpoint", "params"].includes(key))) return false;
  if (typeof body.endpoint !== "string") return false;
  const allowed = Object.hasOwn(PARAMS, body.endpoint) ? PARAMS[body.endpoint] : null;
  if (!allowed || !plainObject(body.params)) return false;
  const p = body.params;
  if (Object.keys(p).some(key => !allowed.has(key))) return false;
  for (const [key, value] of Object.entries(p)) {
    if (typeof value !== "string" && typeof value !== "number") return false;
    if (key === "city" && !boundedText(value, 100)) return false;
    if (key === "keywords" && !boundedText(value, 200)) return false;
    if (key === "citylimit" && !["true", "false"].includes(value)) return false;
    if (key === "types" && !["110000", "10", "100000"].includes(value)) return false;
    if (key === "extensions" && !["all", "base"].includes(value)) return false;
    if (key === "offset" && !integer(value, 1, 20)) return false;
    if (key === "page" && !integer(value, 1, 10)) return false;
    if (key === "radius" && !integer(value, 1, 50000)) return false;
    if (key === "sortrule" && !["distance", "weight"].includes(value)) return false;
    if (key === "location") {
      if (typeof value !== "string" || !/^-?\d{1,3}(?:\.\d{1,8})?,-?\d{1,2}(?:\.\d{1,8})?$/.test(value)) return false;
      const [lng, lat] = value.split(",").map(Number);
      if (Math.abs(lng) > 180 || Math.abs(lat) > 90) return false;
    }
  }
  return body.endpoint === "place/text" ? boundedText(p.city, 100) : typeof p.location === "string";
}

/** Read streams with a hard byte bound, including requests without Content-Length. */
async function boundedBody(message, limit) {
  if (Number(message.headers.get("Content-Length")) > limit) throw new RangeError("size");
  const reader = message.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new RangeError("size");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

/** KV minute buckets are eventual-consistency abuse controls, not strict accounting. */
async function rateLimit(kv, key, limit) {
  const bucket = Math.floor(Date.now() / 60000);
  const storageKey = `amap-rate:${bucket}:${key}`;
  const raw = await kv.get(storageKey);
  const current = raw === null ? 0 : Number(raw);
  if (!Number.isInteger(current) || current < 0) throw new Error("counter");
  if (current >= limit) return false;
  await kv.put(storageKey, String(current + 1), { expirationTtl: 120 });
  return true;
}

export function onRequestOptions(context) {
  if (!context?.request || !sameOrigin(context.request)) return error(403, "FORBIDDEN_ORIGIN");
  return new Response(null, { status: 204, headers: { Allow: "POST, OPTIONS", ...HEADERS } });
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return onRequestOptions({ request });
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST, OPTIONS", ...HEADERS } });
  if (!sameOrigin(request)) return error(403, "FORBIDDEN_ORIGIN");
  if (!env.JWT_SECRET || !env.RATE_LIMIT_KV?.get || !env.RATE_LIMIT_KV?.put) return error(503, "SECURITY_NOT_CONFIGURED");
  const apiKey = env.AMAP_WEB_KEY || env.AMAP_GEO_KEY;
  if (typeof apiKey !== "string" || !apiKey.trim()) return error(503, "PROVIDER_NOT_CONFIGURED");
  const payload = await verifyJwt(extractToken(request), env.JWT_SECRET);
  if (!boundedText(payload?.sub, 200)) return error(401, "AUTH_REQUIRED");
  try {
    const user = await env.RATE_LIMIT_KV.get(`user:${payload.sub}`, { type: "json" });
    if (!plainObject(user) || user.id !== payload.sub) return error(401, "AUTH_REQUIRED");
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (!await rateLimit(env.RATE_LIMIT_KV, `user:${payload.sub}`, 30) || !await rateLimit(env.RATE_LIMIT_KV, `ip:${ip}`, 120)) return error(429, "RATE_LIMITED");
  } catch {
    return error(503, "RATE_LIMIT_UNAVAILABLE");
  }
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") || "")) return error(400, "INVALID_REQUEST");
  let body;
  try {
    body = JSON.parse(await boundedBody(request, MAX_BODY_BYTES));
  } catch (cause) {
    return error(cause instanceof RangeError ? 413 : 400, cause instanceof RangeError ? "REQUEST_TOO_LARGE" : "INVALID_JSON");
  }
  if (!validBody(body)) return error(400, "INVALID_REQUEST");
  const url = new URL(`https://restapi.amap.com/v3/${body.endpoint}`);
  for (const [key, value] of Object.entries(body.params)) url.searchParams.set(key, String(value));
  url.searchParams.set("key", apiKey);
  url.searchParams.set("output", "json");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(url, { redirect: "manual", signal: controller.signal, headers: { Accept: "application/json" } });
    if (!upstream.ok || !/^application\/json(?:\s*;|$)/i.test(upstream.headers.get("Content-Type") || "")) return error(502, "UPSTREAM_ERROR");
    const data = JSON.parse(await boundedBody(upstream, MAX_RESPONSE_BYTES));
    if (!plainObject(data) || data.status !== "1" || !Array.isArray(data.pois)) return error(502, "UPSTREAM_ERROR");
    // Only the successful POI contract is forwarded; provider diagnostics are never returned.
    return jsonResponse(200, { status: "1", info: "OK", count: String(data.count ?? data.pois.length), pois: data.pois.slice(0, 20) });
  } catch {
    return error(502, "UPSTREAM_ERROR");
  } finally {
    clearTimeout(timer);
  }
}
