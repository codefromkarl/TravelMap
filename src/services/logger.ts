/**
 * 轻量结构化日志系统
 *
 * 特性:
 *   - 零外部依赖
 *   - 开发环境 pretty-print，生产环境 JSON
 *   - 子 logger (child)
 *   - 敏感字段自动脱敏 (redact)
 *   - 与 trace-context 集成
 *   - 日志级别控制 (DEBUG/INFO/WARN/ERROR)
 */

import { getTrace } from "./trace-context.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** 敏感字段 — 日志中会被脱敏 */
const SENSITIVE_KEYS = new Set([
  "key",
  "appid",
  "token",
  "api_key",
  "apikey",
  "secret",
  "password",
  "auth",
  "client_secret",
  "Authorization",
]);

/** 日志配置 */
export interface LoggerConfig {
  /** 最低输出级别，低于此级别的日志被忽略 */
  level?: LogLevel;
  /** 基础上下文字段（如 component） */
  base?: Record<string, unknown>;
  /** 是否启用 pretty-print（开发环境） */
  pretty?: boolean;
}

interface LogEntry {
  level: LogLevel;
  time: string;
  msg: string;
  [key: string]: unknown;
}

function getLevelFromEnv(): LogLevel {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  if (env === "debug" || env === "info" || env === "warn" || env === "error") {
    return env;
  }
  // 生产环境默认 info，开发/测试环境默认 debug
  if (process.env.NODE_ENV === "production") return "info";
  return "debug";
}

function shouldRedact(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEYS.has(key) || SENSITIVE_KEYS.has(lower);
}

/** 递归脱敏对象中的敏感字段 */
export function redact(obj: unknown): Record<string, unknown> | unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redact);

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (shouldRedact(k)) {
      result[k] = typeof v === "string" && v.length > 0 ? "***" : v;
    } else if (typeof v === "object" && v !== null) {
      result[k] = redact(v);
    } else {
      result[k] = v;
    }
  }
  return result;
}

function formatPretty(entry: LogEntry): string {
  const levelColor: Record<LogLevel, string> = {
    debug: "\x1b[36m", // cyan
    info: "\x1b[32m", // green
    warn: "\x1b[33m", // yellow
    error: "\x1b[31m", // red
  };
  const reset = "\x1b[0m";
  const color = levelColor[entry.level] ?? "";
  const { level, time, msg, ...rest } = entry;
  const extra = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : "";
  return `${time} ${color}[${level.toUpperCase()}]${reset} ${msg}${extra}`;
}

function formatJson(entry: LogEntry): string {
  return JSON.stringify(entry);
}

class LoggerImpl {
  private level: LogLevel;
  private base: Record<string, unknown>;
  private pretty: boolean;

  constructor(config: LoggerConfig = {}) {
    this.level = config.level ?? getLevelFromEnv();
    this.base = config.base ? { ...config.base } : {};
    this.pretty = config.pretty ?? process.env.NODE_ENV !== "production";
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.level];
  }

  private log(level: LogLevel, msg: string, extra?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    const trace = getTrace();
    const entry: LogEntry = {
      level,
      time: new Date().toISOString(),
      msg,
      ...(redact(this.base) as Record<string, unknown>),
      ...(redact(extra) as Record<string, unknown>),
    };

    if (trace?.traceId) entry.traceId = trace.traceId;
    if (trace?.operation) entry.operation = trace.operation;

    const output = this.pretty ? formatPretty(entry) : formatJson(entry);

    if (level === "error") {
      console.error(output);
    } else if (level === "warn") {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  debug(msg: string, extra?: Record<string, unknown>): void {
    this.log("debug", msg, extra);
  }

  info(msg: string, extra?: Record<string, unknown>): void {
    this.log("info", msg, extra);
  }

  warn(msg: string, extra?: Record<string, unknown>): void {
    this.log("warn", msg, extra);
  }

  error(msg: string, extra?: Record<string, unknown>): void {
    this.log("error", msg, extra);
  }

  /** 创建子 logger，继承当前配置并合并额外字段 */
  child(base: Record<string, unknown>): Logger {
    return new LoggerImpl({
      level: this.level,
      base: { ...this.base, ...base },
      pretty: this.pretty,
    });
  }
}

export interface Logger {
  debug(msg: string, extra?: Record<string, unknown>): void;
  info(msg: string, extra?: Record<string, unknown>): void;
  warn(msg: string, extra?: Record<string, unknown>): void;
  error(msg: string, extra?: Record<string, unknown>): void;
  child(base: Record<string, unknown>): Logger;
}

/** 全局 root logger */
let rootLogger: Logger | null = null;

export function getLogger(): Logger {
  if (!rootLogger) {
    rootLogger = new LoggerImpl();
  }
  return rootLogger;
}

/** 重置 logger（测试用） */
export function resetLogger(): void {
  rootLogger = null;
}

/** 设置自定义 logger（测试用） */
export function setLogger(logger: Logger): void {
  rootLogger = logger;
}
