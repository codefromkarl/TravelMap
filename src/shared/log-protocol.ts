/**
 * 共享日志协议 — 前后端统一日志格式
 *
 * 确保 traceId 能跨前后端传递，
 * 前端 warn/error 日志可上报到后端。
 */

/** 日志级别 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** 统一日志条目格式 (前后端共用) */
export interface LogEntry {
  /** 日志级别 */
  level: LogLevel;
  /** ISO 时间戳 */
  time: string;
  /** 日志消息 */
  msg: string;
  /** 来源: backend | frontend */
  source: "backend" | "frontend";
  /** 组件名 */
  component: string;
  /** 追踪 ID (跨层传递) */
  traceId?: string;
  /** 会话 ID */
  sessionId?: string;
  /** Span ID */
  spanId?: string;
  /** 额外数据 */
  data?: Record<string, unknown>;
}

/** HTTP 请求中的 trace header 名 */
export const TRACE_HEADERS = {
  TRACE_ID: "x-trace-id",
  SESSION_ID: "x-session-id",
  SPAN_ID: "x-span-id",
} as const;

/** 日志上报请求体 */
export interface LogReportRequest {
  entries: LogEntry[];
  /** 上报时的 traceId (用于关联) */
  traceId?: string;
}

/** 日志上报响应 */
export interface LogReportResponse {
  accepted: number;
  rejected: number;
}
