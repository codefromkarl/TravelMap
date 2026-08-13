/** Authenticated, same-origin and redacted frontend log ingestion. */
import type { LogReportRequest, LogReportResponse } from "../../shared/log-protocol.js";
import { extractToken, verifyJwt } from "../_lib/jwt.js";
import { getUser } from "../_lib/quota.js";

const MAX_BODY_BYTES = 32 * 1024;
const MAX_ENTRIES = 20;
const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  Vary: "Origin",
};

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  return (!origin || origin === new URL(request.url).origin)
    && request.headers.get("Sec-Fetch-Site") !== "cross-site";
}

function safeToken(value: unknown, max = 120): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, max);
}

function redactMessage(value: unknown): string {
  if (typeof value !== "string") return "invalid client log";
  return value
    .replace(/(?:Bearer\s+)?(?:sk|ghp|github_pat|AIza)[-_a-zA-Z0-9]{12,}/g, "[REDACTED]")
    .replace(/(?:api[_-]?key|authorization|cookie|token)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
    .slice(0, 500);
}

export function onRequestOptions(context?: { request?: Request }): Response {
  if (context?.request && !sameOrigin(context.request)) {
    return response(403, { error: "Cross-origin requests are not allowed" });
  }
  return new Response(null, { status: 204, headers: { Allow: "POST, OPTIONS", ...HEADERS } });
}

export async function onRequestPost(context: {
  request: Request;
  env: {
    JWT_SECRET?: string;
    RATE_LIMIT_KV?: {
      get(key: string, options?: { type?: string }): Promise<unknown>;
    };
  };
}): Promise<Response> {
  const { request, env } = context;
  if (!sameOrigin(request)) return response(403, { error: "Cross-origin requests are not allowed" });
  if (!env.JWT_SECRET || !env.RATE_LIMIT_KV) {
    return response(503, { error: "Log ingestion is not configured" });
  }

  const payload = await verifyJwt(extractToken(request), env.JWT_SECRET);
  if (!payload?.sub || !(await getUser(env.RATE_LIMIT_KV, payload.sub))) {
    return response(401, { error: "Authentication required" });
  }

  let body: LogReportRequest;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return response(413, { error: "Request too large" });
    }
    body = JSON.parse(raw) as LogReportRequest;
  } catch {
    return response(400, { error: "Invalid JSON" });
  }

  if (!Array.isArray(body.entries) || body.entries.length > MAX_ENTRIES) {
    return response(400, { error: "Invalid request: entries array required" });
  }

  const headerTraceId = safeToken(request.headers.get("x-trace-id") || body.traceId);
  let accepted = 0;
  let rejected = 0;

  for (const entry of body.entries) {
    if (!entry || !entry.level || !entry.msg || !entry.time
      || (entry.level !== "warn" && entry.level !== "error")) {
      rejected++;
      continue;
    }

    const logEntry = {
      level: entry.level,
      time: safeToken(entry.time, 40),
      msg: `[frontend] ${redactMessage(entry.msg)}`,
      source: "frontend",
      component: safeToken(entry.component) || "unknown",
      traceId: safeToken(entry.traceId) || headerTraceId,
      sessionId: safeToken(entry.sessionId),
      spanId: safeToken(entry.spanId),
    };

    if (entry.level === "error") console.error(JSON.stringify(logEntry));
    else console.warn(JSON.stringify(logEntry));
    accepted++;
  }

  const result: LogReportResponse = { accepted, rejected };
  return response(200, result);
}
