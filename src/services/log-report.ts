import type { LogReportRequest, LogReportResponse } from "../shared/log-protocol.js";

/** 处理 OPTIONS 请求 (CORS preflight) */
export function onRequestOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-trace-id, x-session-id",
    },
  });
}

/** 处理 POST 请求 — 接收前端日志 */
export async function onRequestPost(context: {
  request: Request;
  env: Record<string, string>;
}): Promise<Response> {
  const { request } = context;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  try {
    const body = (await request.json()) as LogReportRequest;

    if (!body.entries || !Array.isArray(body.entries)) {
      return new Response(JSON.stringify({ error: "Invalid request: entries array required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const headerTraceId = request.headers.get("x-trace-id") || body.traceId;
    let accepted = 0;
    let rejected = 0;

    for (const entry of body.entries) {
      if (!entry.level || !entry.msg || !entry.time) {
        rejected++;
        continue;
      }

      if (entry.level !== "warn" && entry.level !== "error") {
        rejected++;
        continue;
      }

      const traceId = entry.traceId || headerTraceId;
      const logEntry = {
        level: entry.level,
        time: entry.time,
        msg: `[frontend] ${entry.msg}`,
        source: "frontend",
        component: entry.component || "unknown",
        traceId,
        sessionId: entry.sessionId,
        spanId: entry.spanId,
        ...(entry.data || {}),
      };

      if (entry.level === "error") {
        console.error(JSON.stringify(logEntry));
      } else {
        console.warn(JSON.stringify(logEntry));
      }

      accepted++;
    }

    const response: LogReportResponse = { accepted, rejected };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    console.error("[log-report] Failed to process request:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}
