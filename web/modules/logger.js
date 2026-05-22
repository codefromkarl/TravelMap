/**
 * 前端结构化日志系统
 *
 * 特性:
 *   - 零外部依赖
 *   - 自动附加 traceId / sessionId / timestamp
 *   - 控制台 pretty-print（带颜色）
 *   - 环形缓冲区（保留最近 200 条，供追溯和导出）
 *   - 子 logger (child)
 *   - 日志级别控制
 */

import { getCurrentTraceId, getSessionId } from './trace.js?v=10';

// ─── 类型定义 ─────────────────────────────────────────────

/** @typedef {'debug'|'info'|'warn'|'error'} LogLevel */

const LEVEL_PRIORITY = { debug: 0, info: 1, warn: 2, error: 3 };

const LEVEL_COLORS = {
  debug: '#888',
  info: '#4f8ef7',
  warn: '#f5a623',
  error: '#e74c3c',
};

// ─── 环形缓冲区 ──────────────────────────────────────────

const BUFFER_SIZE = 200;
const logBuffer = [];
let bufferIndex = 0;

function pushToBuffer(entry) {
  logBuffer[bufferIndex % BUFFER_SIZE] = entry;
  bufferIndex++;
}

/**
 * 获取缓冲区中的日志（按时间排序）
 * @param {object} [filter]
 * @param {LogLevel} [filter.level] 最低级别
 * @param {string} [filter.traceId] 按 traceId 过滤
 * @param {number} [filter.limit] 最多返回条数
 * @returns {object[]}
 */
export function getLogEntries(filter = {}) {
  let entries;
  if (bufferIndex <= BUFFER_SIZE) {
    entries = logBuffer.slice(0, bufferIndex);
  } else {
    const start = bufferIndex % BUFFER_SIZE;
    entries = [...logBuffer.slice(start), ...logBuffer.slice(0, start)];
  }

  if (filter.level) {
    const min = LEVEL_PRIORITY[filter.level] || 0;
    entries = entries.filter(e => LEVEL_PRIORITY[e.level] >= min);
  }
  if (filter.traceId) {
    entries = entries.filter(e => e.traceId === filter.traceId);
  }
  if (filter.limit && entries.length > filter.limit) {
    entries = entries.slice(-filter.limit);
  }
  return entries;
}

/**
 * 导出日志为 JSON 字符串
 * @param {object} [filter]
 * @returns {string}
 */
export function exportLogsAsJson(filter = {}) {
  return JSON.stringify(getLogEntries(filter), null, 2);
}

// ─── Logger 实现 ─────────────────────────────────────────

class FrontendLogger {
  /** @type {LogLevel} */
  level;
  /** @type {Record<string, unknown>} */
  base;
  /** @type {string} */
  component;

  /**
   * @param {object} [config]
   * @param {LogLevel} [config.level]
   * @param {string} [config.component]
   * @param {Record<string, unknown>} [config.base]
   */
  constructor(config = {}) {
    this.level = config.level || getLevelFromStorage();
    this.component = config.component || 'app';
    this.base = config.base || {};
  }

  /**
   * @param {LogLevel} level
   * @param {string} msg
   * @param {Record<string, unknown>} [extra]
   */
  _log(level, msg, extra) {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.level]) return;

    const entry = {
      level,
      time: new Date().toISOString(),
      msg,
      component: this.component,
      traceId: getCurrentTraceId() || undefined,
      sessionId: getSessionId(),
      ...this.base,
      ...(extra || {}),
    };

    // 存入缓冲区
    pushToBuffer(entry);

    // 控制台输出（带样式）
    const color = LEVEL_COLORS[level] || '#888';
    const tag = `%c[${level.toUpperCase()}]%c [${this.component}]`;
    const styleTag = `color:${color};font-weight:bold`;
    const styleReset = 'color:inherit';

    const extraStr = extra ? ` ${JSON.stringify(extra)}` : '';

    if (level === 'error') {
      console.error(tag + styleReset, styleTag, styleReset, msg, extra || '');
    } else if (level === 'warn') {
      console.warn(tag + styleReset, styleTag, styleReset, msg, extra || '');
    } else {
      console.log(tag + ' %c%s' + extraStr, styleTag, styleReset, 'color:#666', msg);
    }
  }

  debug(msg, extra) { this._log('debug', msg, extra); }
  info(msg, extra) { this._log('info', msg, extra); }
  warn(msg, extra) { this._log('warn', msg, extra); }
  error(msg, extra) { this._log('error', msg, extra); }

  /**
   * 创建子 logger
   * @param {Record<string, unknown>} base
   * @returns {FrontendLogger}
   */
  child(base) {
    return new FrontendLogger({
      level: this.level,
      component: base.component || this.component,
      base: { ...this.base, ...base },
    });
  }
}

// ─── 日志级别持久化 ──────────────────────────────────────

const LOG_LEVEL_KEY = 'travel-agent-log-level';

function getLevelFromStorage() {
  const stored = localStorage.getItem(LOG_LEVEL_KEY);
  if (stored && LEVEL_PRIORITY[stored] !== undefined) return stored;
  return 'info';
}

/**
 * 设置全局日志级别
 * @param {LogLevel} level
 */
export function setLogLevel(level) {
  localStorage.setItem(LOG_LEVEL_KEY, level);
  if (rootLogger) rootLogger.level = level;
}

// ─── Root logger ─────────────────────────────────────────

let rootLogger = null;

/**
 * 获取根 logger
 * @returns {FrontendLogger}
 */
export function getLogger() {
  if (!rootLogger) rootLogger = new FrontendLogger();
  return rootLogger;
}

/**
 * 创建模块 logger
 * @param {string} component 模块名
 * @returns {FrontendLogger}
 */
export function createLogger(component) {
  return getLogger().child({ component });
}

/** 重置 logger（测试用） */
export function resetLogger() {
  rootLogger = null;
  logBuffer.length = 0;
  bufferIndex = 0;
}
