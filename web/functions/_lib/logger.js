/**
 * 轻量结构化日志 — Cloudflare Workers 兼容版
 *
 * 与 src/services/logger.ts 接口一致，但使用显式 context（无 AsyncLocalStorage）
 */

/** @typedef {"debug"|"info"|"warn"|"error"} LogLevel */

const LEVEL_PRIORITY = { debug: 0, info: 1, warn: 2, error: 3 };

const SENSITIVE_KEYS = new Set([
  "key", "appid", "token", "api_key", "apikey", "secret", "password", "auth", "client_secret", "Authorization",
]);

function shouldRedact(key) {
  return SENSITIVE_KEYS.has(key) || SENSITIVE_KEYS.has(key.toLowerCase());
}

/** 递归脱敏 */
export function redact(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
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

function formatJson(entry) {
  return JSON.stringify(entry);
}

class LoggerImpl {
  constructor(config = {}) {
    this.level = config.level ?? "info";
    this.base = config.base ? { ...config.base } : {};
  }

  _shouldLog(level) {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.level];
  }

  _log(level, msg, extra = {}, traceContext) {
    if (!this._shouldLog(level)) return;
    const entry = {
      level,
      time: new Date().toISOString(),
      msg,
      ...redact(this.base),
      ...redact(extra),
    };
    if (traceContext?.traceId) entry.traceId = traceContext.traceId;
    if (traceContext?.operation) entry.operation = traceContext.operation;
    const output = formatJson(entry);
    if (level === "error") console.error(output);
    else if (level === "warn") console.warn(output);
    else console.log(output);
  }

  debug(msg, extra, traceContext) { this._log("debug", msg, extra, traceContext); }
  info(msg, extra, traceContext) { this._log("info", msg, extra, traceContext); }
  warn(msg, extra, traceContext) { this._log("warn", msg, extra, traceContext); }
  error(msg, extra, traceContext) { this._log("error", msg, extra, traceContext); }

  child(base) {
    return new LoggerImpl({ level: this.level, base: { ...this.base, ...base } });
  }
}

let rootLogger = null;

export function getLogger(config) {
  if (!rootLogger) rootLogger = new LoggerImpl(config);
  return rootLogger;
}

export function resetLogger() {
  rootLogger = null;
}
