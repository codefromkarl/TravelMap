/** Versioned itinerary sync. KV guards detect known conflicts; they are not atomic CAS. */
import { extractToken, verifyJwt } from "../_lib/jwt.js";
import { getUser } from "../_lib/quota.js";

const MAX_TRIP_BYTES = 256 * 1024;
const MAX_BODY_BYTES = MAX_TRIP_BYTES + 1024;
const TRIP_TTL_SECONDS = 90 * 24 * 60 * 60;
const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'",
  "X-Content-Type-Options": "nosniff",
  Vary: "Origin",
};
const ALLOW = "GET, PUT, DELETE, OPTIONS";

function response(status, data, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: {
    "Content-Type": "application/json; charset=utf-8", ...RESPONSE_HEADERS, ...extraHeaders,
  } });
}
function error(status, code, extra = {}, headers = {}) {
  return response(status, { error: "Trip synchronization unavailable", code, ...extra }, headers);
}
function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function validId(id) {
  return typeof id === "string" && id.length > 0 && id.length <= 160 && id !== "index" && !/[\x00-\x20\x7f/:?#]/.test(id);
}
function validVersion(value) {
  return value == null || (typeof value === "string" && value.length > 0 && value.length <= 128);
}
function validDate(value) {
  return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
}
function allowedOrigin(request) {
  const origin = request.headers.get("Origin");
  return (!origin || origin === new URL(request.url).origin) && request.headers.get("Sec-Fetch-Site") !== "cross-site";
}
function tripSummary(trip) {
  const metadata = { id: trip.id, version: trip.version, updatedAt: trip.updatedAt, deleted: trip.deleted === true };
  if (metadata.deleted) return metadata;
  return { ...metadata, title: trip.title, city: typeof trip.city === "string" ? trip.city : "",
    days: Array.isArray(trip.days) ? trip.days.length : (Number.isFinite(trip.days) ? trip.days : 0) };
}
function parseTripId(request) {
  try {
    const parts = new URL(request.url).pathname.split("/").filter(Boolean);
    if (parts[0] !== "api" || parts[1] !== "trips") return undefined;
    if (parts.length === 2) return null;
    const id = parts.length === 3 ? decodeURIComponent(parts[2]) : undefined;
    return validId(id) ? id : undefined;
  } catch { return undefined; }
}
async function readJson(request, allowEmpty = false) {
  if (Number(request.headers.get("Content-Length")) > MAX_BODY_BYTES) throw new RangeError("size");
  const reader = request.body?.getReader();
  let text = "";
  let size = 0;
  if (reader) {
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new RangeError("size"); }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } finally { reader.releaseLock(); }
  }
  return allowEmpty && !text.trim() ? {} : JSON.parse(text);
}
async function rateLimit(kv, key, limit) {
  const storageKey = `trips-rate:${Math.floor(Date.now() / 60000)}:${key}`;
  const raw = await kv.get(storageKey);
  const count = raw == null ? 0 : Number(raw);
  if (!Number.isInteger(count) || count < 0) throw new Error("counter");
  if (count >= limit) return false;
  await kv.put(storageKey, String(count + 1), { expirationTtl: 120 });
  return true;
}
async function readIndex(kv, userId) {
  const raw = await kv.get(`trips:${userId}:index`, { type: "json" });
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new Error("index");
  return raw.filter(item => object(item) && validId(item.id));
}
async function writeIndex(kv, userId, trip) {
  // A failed read must never replace the existing index with an empty list.
  const cutoff = Date.now() - TRIP_TTL_SECONDS * 1000;
  const list = (await readIndex(kv, userId)).filter(item => item.id !== trip.id
    && (!item.deleted || (validDate(item.updatedAt) && Date.parse(item.updatedAt) >= cutoff)));
  list.push(tripSummary(trip));
  list.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  await kv.put(`trips:${userId}:index`, JSON.stringify(list), { expirationTtl: TRIP_TTL_SECONDS });
}
function conflict(userId, current) {
  return error(409, "SYNC_CONFLICT", { userId, remote: current ? tripSummary(current) : null });
}
function mutationAck(userId, trip) {
  const metadata = tripSummary(trip);
  return response(200, { ok: true, id: trip.id, userId, version: trip.version,
    updatedAt: trip.updatedAt, deleted: trip.deleted === true,
    ...(trip.deleted ? { tombstone: metadata } : {}) });
}
function versionConflict(current, baseVersion, trip) {
  if (!current) return baseVersion != null;
  if (current.deleted) return true;
  if (current.version) return baseVersion !== current.version;
  // Only legacy adoption uses client timestamps; versioned records never rely on clocks.
  return baseVersion != null || (trip && Date.parse(trip.updatedAt) < Date.parse(current.updatedAt));
}
async function putTrip(kv, userId, tripId, body) {
  if (!object(body) || !object(body.trip) || !validVersion(body.baseVersion)) return error(400, "INVALID_REQUEST");
  const trip = body.trip;
  if (trip.syncOwnerId != null && trip.syncOwnerId !== userId) return error(403, "SYNC_OWNER_MISMATCH");
  if (!validId(trip.id) || trip.id !== tripId || typeof trip.title !== "string" || !trip.title.trim()
    || !validDate(trip.updatedAt) || trip.deleted === true || trip.status === "deleted") return error(400, "INVALID_REQUEST");
  if (new TextEncoder().encode(JSON.stringify(trip)).byteLength > MAX_TRIP_BYTES) return error(413, "TRIP_TOO_LARGE");
  const key = `trips:${userId}:${tripId}`;
  const current = await kv.get(key, { type: "json" });
  if (current != null && (!object(current) || current.id !== tripId)) throw new Error("record");
  if (versionConflict(current, body.baseVersion, trip)) return conflict(userId, current);
  const stored = { ...trip, version: crypto.randomUUID(), deleted: false };
  // Sync bookkeeping belongs to the device, never to a different account's cloud record.
  for (const field of ["syncOwnerId", "syncState", "localRevision", "syncConflict", "syncedUpdatedAt"]) delete stored[field];
  await readIndex(kv, userId);
  await kv.put(key, JSON.stringify(stored), { expirationTtl: TRIP_TTL_SECONDS });
  await writeIndex(kv, userId, stored);
  return mutationAck(userId, stored);
}
async function deleteTrip(kv, userId, tripId, body) {
  if (!object(body) || !validVersion(body.baseVersion) || (body.updatedAt != null && !validDate(body.updatedAt))) return error(400, "INVALID_REQUEST");
  const key = `trips:${userId}:${tripId}`;
  const current = await kv.get(key, { type: "json" });
  if (current != null && (!object(current) || current.id !== tripId)) throw new Error("record");
  if (current?.deleted) return mutationAck(userId, current);
  if (current?.version && current.version !== body.baseVersion) return conflict(userId, current);
  const tombstone = { id: tripId, version: crypto.randomUUID(), updatedAt: new Date().toISOString(), deleted: true };
  await readIndex(kv, userId);
  await kv.put(key, JSON.stringify(tombstone), { expirationTtl: TRIP_TTL_SECONDS });
  await writeIndex(kv, userId, tombstone);
  return mutationAck(userId, tombstone);
}
export function onRequestOptions(context) {
  if (context?.request && !allowedOrigin(context.request)) return error(403, "FORBIDDEN_ORIGIN");
  return new Response(null, { status: 204, headers: { Allow: ALLOW, ...RESPONSE_HEADERS } });
}
export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return onRequestOptions({ request });
  if (!["GET", "PUT", "DELETE"].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: ALLOW, ...RESPONSE_HEADERS } });
  if (!allowedOrigin(request)) return error(403, "FORBIDDEN_ORIGIN");
  if (!env.JWT_SECRET || !env.RATE_LIMIT_KV?.get || !env.RATE_LIMIT_KV?.put) return error(503, "SECURITY_NOT_CONFIGURED");
  const payload = await verifyJwt(extractToken(request), env.JWT_SECRET);
  if (!payload?.sub) return error(401, "AUTH_REQUIRED");
  const user = await getUser(env.RATE_LIMIT_KV, payload.sub);
  if (!user || user.id !== payload.sub) return error(401, "AUTH_REQUIRED");
  const userId = payload.sub;
  const syncUser = request.headers.get("X-Sync-User");
  if (syncUser && syncUser !== userId) return error(403, "SYNC_OWNER_MISMATCH");
  const tripId = parseTripId(request);
  if (tripId === undefined) return error(404, "NOT_FOUND");
  const kv = env.RATE_LIMIT_KV;
  if (request.method === "GET") {
    try {
      if (tripId === null) return response(200, { userId, trips: await readIndex(kv, userId) });
      const trip = await kv.get(`trips:${userId}:${tripId}`, { type: "json" });
      if (!trip) return error(404, "NOT_FOUND");
      if (trip.deleted) return error(410, "TRIP_DELETED", { userId, tombstone: tripSummary(trip) });
      return response(200, { userId, trip });
    } catch { return error(503, "STORAGE_UNAVAILABLE"); }
  }
  if (tripId === null) return error(400, "INVALID_REQUEST");
  try {
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (!await rateLimit(kv, `user:${userId}`, 30) || !await rateLimit(kv, `ip:${ip}`, 30)) return error(429, "RATE_LIMITED", {}, { "Retry-After": "60" });
  } catch { return error(503, "RATE_LIMIT_UNAVAILABLE"); }
  let body;
  try { body = await readJson(request, request.method === "DELETE"); }
  catch (cause) { return error(cause instanceof RangeError ? 413 : 400, cause instanceof RangeError ? "REQUEST_TOO_LARGE" : "INVALID_JSON"); }
  try {
    return request.method === "PUT" ? await putTrip(kv, userId, tripId, body) : await deleteTrip(kv, userId, tripId, body);
  } catch { return error(503, "STORAGE_UNAVAILABLE"); }
}
