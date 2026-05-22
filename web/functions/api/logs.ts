/**
 * 前端日志上报 API — Cloudflare Pages Function
 *
 * 接收前端 warn/error 日志，写入后端日志系统。
 * 用于跨层 traceId 关联和错误追踪。
 */
import type { LogEntry, LogReportRequest, LogReportResponse } from "../../shared/log-protocol.js";

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

  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  try {
    // 解析请求体
    const body = (await request.json()) as LogReportRequest;

    if (!body.entries || !Array.isArray(body.entries)) {
      return new Response(
        JSON.stringify({ error: "Invalid request: entries array required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // 从 header 提取 traceId
    const headerTraceId =
      request.headers.get("x-trace-id") || body.traceId;

    // 处理日志条目
    let accepted = 0;
    let rejected = 0;

    for (const entry of body.entries) {
      // 验证必填字段
      if (!entry.level || !entry.msg || !entry.time) {
        rejected++;
        continue;
      }

      // 只接受 warn 和 error (避免前端 debug 日志淹没后端)
      if (entry.level !== "warn" && entry.level !== "error") {
        rejected++;
        continue;
      }

      // 合并 traceId
      const traceId = entry.traceId || headerTraceId;

      // 输出到后端日志 (结构化 JSON)
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

      // 使用 console 输出 (与后端 logger 一致)
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
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
}
