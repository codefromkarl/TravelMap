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

/** 敏感字段的快速检测 — 小写 Set 用于快速查找 */
const SENSITIVE_KEYS_LOWER = new Set(Array.from(SENSITIVE_KEYS).map((k) => k.toLowerCase()));

/** 最大递归深度 — 防止深层嵌套对象的性能问题 */
const MAX_REDACT_DEPTH = 3;

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
  // 快速路径：精确匹配（避免 toLowerCase）
  if (SENSITIVE_KEYS.has(key)) return true;
  // 慢路径：大小写不敏感匹配
  return SENSITIVE_KEYS_LOWER.has(key.toLowerCase());
}

/**
 * 递归脱敏对象中的敏感字段
 *
 * 优化策略：
 * 1. 限制递归深度（MAX_REDACT_DEPTH = 3）
 * 2. 快速路径：如果没有需要脱敏的字段，直接返回原对象
 * 3. 避免不必要的对象创建
 */
export function redact(obj: unknown, depth = 0): Record<string, unknown> | unknown {
  if (obj === null || typeof obj !== "object") return obj;

  // 超过最大深度，返回占位符避免无限递归
  if (depth >= MAX_REDACT_DEPTH) {
    return Array.isArray(obj) ? "[Array]" : "[Object]";
  }

  if (Array.isArray(obj)) {
    // 快速路径：检查数组是否包含需要脱敏的对象
    let needsRedact = false;
    for (const item of obj) {
      if (typeof item === "object" && item !== null) {
        needsRedact = true;
        break;
      }
    }
    if (!needsRedact) return obj;
    return obj.map((item) => redact(item, depth + 1));
  }

  const record = obj as Record<string, unknown>;
  const keys = Object.keys(record);

  // 快速路径：检查是否包含敏感字段或嵌套对象
  let hasSensitive = false;
  let hasNested = false;
  for (const k of keys) {
    if (shouldRedact(k)) {
      hasSensitive = true;
      break;
    }
    if (typeof record[k] === "object" && record[k] !== null) {
      hasNested = true;
    }
  }

  // 如果没有敏感字段且没有嵌套对象，直接返回原对象
  if (!hasSensitive && !hasNested) return obj;

  // 需要创建新对象进行脱敏
  const result: Record<string, unknown> = {};
  for (const k of keys) {
    const v = record[k];
    if (shouldRedact(k)) {
      result[k] = typeof v === "string" && v.length > 0 ? "***" : v;
    } else if (typeof v === "object" && v !== null) {
      result[k] = redact(v, depth + 1);
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
