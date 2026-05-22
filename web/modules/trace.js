/**
 * 前端 Trace Context — 生成和管理 traceId/sessionId
 *
 * 功能：
 *   - 生成 traceId（每次 API 请求唯一）
 *   - 生成 sessionId（同一会话内唯一，存储在 localStorage）
 *   - 提供 header 辅助函数
 *   - 集成 perf-trace 追踪 span 耗时
 */

import { createLogger } from './logger.js?v=6';
import { startSpan, endSpan, cleanupOldTraces } from './perf-trace.js?v=6';

const traceLogger = createLogger('trace');

// ─── Session ID（持久化）────────────────────────────────

const SESSION_ID_KEY = 'travel-agent-session-id';

/** 获取或创建会话 ID */
export function getSessionId() {
  let sessionId = localStorage.getItem(SESSION_ID_KEY);
  if (!sessionId) {
    sessionId = `ses_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(SESSION_ID_KEY, sessionId);
  }
  return sessionId;
}

// ─── Trace ID（每次请求唯一）─────────────────────────────

/** 生成 traceId */
export function generateTraceId() {
  return `trace_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── 当前 traceId（用于 UI 展示）────────────────────────

let currentTraceId = null;

/** 设置当前 traceId */
export function setCurrentTraceId(traceId) {
  currentTraceId = traceId;

  // 更新 UI 显示
  const display = document.getElementById('trace-id-display');
  if (display) {
    display.textContent = traceId.slice(-12); // 只显示后 12 位
    display.title = `追踪 ID: ${traceId}\n点击复制完整 ID`;
  }
}

/** 获取当前 traceId */
export function getCurrentTraceId() {
  return currentTraceId;
}

// ─── Header 辅助函数 ─────────────────────────────────────

/**
 * 为 fetch 请求添加 trace headers
 *
 * @param {HeadersInit} [headers] 原始 headers
 * @returns {Headers} 包含 trace headers 的新 headers
 */
export function addTraceHeaders(headers = {}) {
  const traceId = generateTraceId();
  const sessionId = getSessionId();

  // 更新当前 traceId
  setCurrentTraceId(traceId);

  // 开始 span 追踪
  const span = startSpan('api-request', {
    traceId,
    metadata: { sessionId },
  });
  window._currentRequestSpan = span;

  // 清理旧数据
  cleanupOldTraces();

  traceLogger.info('trace 创建', { traceId, sessionId });

  const newHeaders = new Headers(headers);
  newHeaders.set('x-trace-id', traceId);
  newHeaders.set('x-session-id', sessionId);

  return newHeaders;
}

// 暴露给全局 fetch 拦截器使用
if (typeof window !== 'undefined') {
  window.__traceAddHeaders = addTraceHeaders;
}

/**
 * 从响应中提取 traceId 并结束 span
 *
 * @param {Response} response fetch Response
 * @returns {string|null} traceId 或 null
 */
export function extractTraceId(response) {
  const responseTraceId = response.headers.get('x-trace-id');

  // 结束 span
  const span = window._currentRequestSpan;
  if (span) {
    endSpan(span.spanId, {
      status: 'completed',
      metadata: { responseTraceId: responseTraceId || undefined },
    });
    window._currentRequestSpan = null;
  }

  return responseTraceId;
}
