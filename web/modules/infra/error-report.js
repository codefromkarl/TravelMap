/**
 * 前端错误上报 — window error / unhandledrejection → POST /api/logs
 *
 * 仅上报 warn/error 级别，消息在服务端二次脱敏。
 * 使用 same-origin cookie 认证；未登录（游客）时静默跳过，避免 401 噪音。
 * 客户端做基础限流与去重，避免异常循环打爆接口。
 */

import { createLogger } from '../logger.js';

const logger = createLogger('error-report');
const MAX_PENDING = 20;
const FLUSH_INTERVAL_MS = 8000;
const MAX_PER_MINUTE = 10;

let pending = [];
let lastFlush = 0;
let reportedThisMinute = 0;
let windowStart = Date.now();
let enabled = true;

function redact(message) {
  return String(message)
    .replace(/(?:Bearer\s+)?(?:sk|ghp|github_pat|AIza)[-_a-zA-Z0-9]{12,}/g, '[REDACTED]')
    .replace(/(?:api[_-]?key|authorization|cookie|token)\s*[:=]\s*\S+/gi, '$1=[REDACTED]')
    .slice(0, 500);
}

function rateLimit() {
  const now = Date.now();
  if (now - windowStart > 60_000) {
    windowStart = now;
    reportedThisMinute = 0;
  }
  if (reportedThisMinute >= MAX_PER_MINUTE) return false;
  reportedThisMinute += 1;
  return true;
}

async function flush() {
  if (pending.length === 0) return;
  const entries = pending.splice(0, MAX_PENDING);
  if (!rateLimit()) return;
  try {
    const response = await fetch('/api/logs', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entries: entries.map((entry) => ({
          level: entry.level,
          time: entry.time,
          msg: redact(entry.msg),
          component: 'frontend-error',
          traceId: entry.traceId || undefined,
        })),
      }),
    });
    if (response.status === 401) {
      // 游客或会话过期：本会话内停止上报
      enabled = false;
      logger.debug('log ingestion 未授权，停止错误上报');
    }
  } catch {
    // 网络失败静默忽略，下次 flush 重试
  }
}

function queue(level, msg, traceId) {
  if (!enabled) return;
  pending.push({ level, msg, time: new Date().toISOString(), traceId });
  const now = Date.now();
  if (now - lastFlush > FLUSH_INTERVAL_MS) {
    lastFlush = now;
    void flush();
  }
}

export function initErrorReporting() {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (event) => {
    const message = event.message || 'Unknown script error';
    const where = [event.filename, event.lineno, event.colno].filter(Boolean).join(':');
    queue('error', `${message} @ ${where}`);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error
      ? `${reason.name}: ${reason.message}`
      : typeof reason === 'string' ? reason : 'Unhandled promise rejection';
    queue('error', message);
  });
  // 页面隐藏前尽力冲刷
  window.addEventListener('pagehide', () => { void flush(); });
  logger.debug('前端错误上报已启用');
}
