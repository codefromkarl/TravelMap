/**
 * 性能 Span 追踪器 — 记录调用链耗时 + 生成瀑布图数据
 *
 * 功能：
 *   - 记录每个 span 的开始/结束时间、耗时
 *   - 维护 span 树（parent → children）
 *   - 生成瀑布图渲染数据
 *   - 与 trace.js 集成，自动关联 traceId
 *
 * 用法（前端）：
 *   import { startSpan, endSpan, getWaterfallData } from './perf-trace.js?v=6';
 *   const span = startSpan('api-request', { parentSpanId: null });
 *   // ... 异步操作 ...
 *   endSpan(span.spanId);
 *   const waterfall = getWaterfallData();
 */

import { getCurrentTraceId } from './trace.js?v=6';
import { createLogger } from './logger.js?v=6';

const perfLogger = createLogger('perf-trace');

// ─── Span 定义 ───────────────────────────────────────────

/**
 * @typedef {object} SpanRecord
 * @property {string} spanId
 * @property {string} [parentSpanId]
 * @property {string} operation
 * @property {string} traceId
 * @property {number} startTime - performance.now()
 * @property {number} startTimestamp - Date.now() (ISO 时间戳)
 * @property {number} [endTime]
 * @property {number} [duration] - ms
 * @property {'running'|'completed'|'error'} status
 * @property {Record<string, unknown>} [metadata]
 */

// ─── Span 存储 ───────────────────────────────────────────

const MAX_SPANS = 500;
const spansByTrace = new Map(); // traceId → SpanRecord[]

/**
 * 获取当前 trace 的 span 列表
 * @param {string} [traceId]
 * @returns {SpanRecord[]}
 */
function getTraceSpans(traceId) {
  const tid = traceId || getCurrentTraceId();
  if (!tid) return [];
  if (!spansByTrace.has(tid)) spansByTrace.set(tid, []);
  return spansByTrace.get(tid);
}

// ─── 核心 API ────────────────────────────────────────────

/**
 * 开始一个 span
 * @param {string} operation 操作名
 * @param {object} [options]
 * @param {string} [options.parentSpanId] 父 span ID
 * @param {string} [options.traceId] 关联的 traceId（默认当前）
 * @param {Record<string, unknown>} [options.metadata] 额外元数据
 * @returns {SpanRecord}
 */
export function startSpan(operation, options = {}) {
  const traceId = options.traceId || getCurrentTraceId() || `trace_${Date.now().toString(36)}`;
  const spanId = `span_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  const span = {
    spanId,
    parentSpanId: options.parentSpanId || null,
    operation,
    traceId,
    startTime: performance.now(),
    startTimestamp: Date.now(),
    status: 'running',
    metadata: options.metadata || {},
  };

  const spans = getTraceSpans(traceId);
  spans.push(span);

  // 防止内存泄漏
  if (spans.length > MAX_SPANS) {
    spans.splice(0, spans.length - MAX_SPANS);
  }

  perfLogger.debug(`span 开始: ${operation}`, { spanId, traceId });

  return span;
}

/**
 * 结束一个 span
 * @param {string} spanId
 * @param {object} [options]
 * @param {'completed'|'error'} [options.status]
 * @param {Record<string, unknown>} [options.metadata]
 * @returns {SpanRecord|null}
 */
export function endSpan(spanId, options = {}) {
  const traceId = getCurrentTraceId();
  const spans = traceId ? getTraceSpans(traceId) : [];

  // 也搜索其他 trace（兜底）
  let span = spans.find(s => s.spanId === spanId);
  if (!span) {
    for (const [, sList] of spansByTrace) {
      span = sList.find(s => s.spanId === spanId);
      if (span) break;
    }
  }

  if (!span) {
    perfLogger.warn(`span 未找到: ${spanId}`);
    return null;
  }

  span.endTime = performance.now();
  span.duration = Math.round((span.endTime - span.startTime) * 100) / 100; // 保留 2 位小数
  span.status = options.status || 'completed';
  if (options.metadata) {
    span.metadata = { ...span.metadata, ...options.metadata };
  }

  perfLogger.debug(`span 结束: ${span.operation}`, {
    spanId,
    duration: span.duration,
    status: span.status,
  });

  return span;
}

/**
 * 包装异步操作为 span
 * @param {string} operation
 * @param {() => Promise<T>} fn
 * @param {object} [options]
 * @returns {Promise<T>}
 * @template T
 */
export async function traceAsync(operation, fn, options = {}) {
  const span = startSpan(operation, options);
  try {
    const result = await fn();
    endSpan(span.spanId, { status: 'completed' });
    return result;
  } catch (err) {
    endSpan(span.spanId, { status: 'error', metadata: { error: err.message } });
    throw err;
  }
}

// ─── 瀑布图数据生成 ─────────────────────────────────────

/**
 * @typedef {object} WaterfallNode
 * @property {SpanRecord} span
 * @property {WaterfallNode[]} children
 * @property {number} offset - 相对于 trace 开始的偏移 (ms)
 * @property {number} depth - 嵌套深度
 */

/**
 * 获取瀑布图数据
 * @param {string} [traceId]
 * @returns {WaterfallNode[]}
 */
export function getWaterfallData(traceId) {
  const spans = getTraceSpans(traceId);
  if (spans.length === 0) return [];

  const completed = spans.filter(s => s.endTime !== undefined);
  if (completed.length === 0) return [];

  // trace 开始时间基准
  const baseTime = Math.min(...completed.map(s => s.startTime));

  // 构建 span 索引
  const spanMap = new Map();
  for (const s of completed) {
    spanMap.set(s.spanId, {
      span: s,
      children: [],
      offset: Math.round((s.startTime - baseTime) * 100) / 100,
      depth: 0,
    });
  }

  // 构建树 + 计算深度
  const roots = [];
  for (const node of spanMap.values()) {
    if (node.span.parentSpanId && spanMap.has(node.span.parentSpanId)) {
      spanMap.get(node.span.parentSpanId).children.push(node);
      node.depth = spanMap.get(node.span.parentSpanId).depth + 1;
    } else {
      roots.push(node);
    }
  }

  // 按开始时间排序
  const sortNodes = (nodes) => {
    nodes.sort((a, b) => a.span.startTime - b.span.startTime);
    for (const n of nodes) sortNodes(n.children);
  };
  sortNodes(roots);

  return roots;
}

/**
 * 获取当前 trace 的摘要统计
 * @param {string} [traceId]
 * @returns {object}
 */
export function getTraceSummary(traceId) {
  const spans = getTraceSpans(traceId);
  const completed = spans.filter(s => s.duration !== undefined);

  if (completed.length === 0) {
    return { totalSpans: spans.length, completedSpans: 0, totalDuration: 0, operations: {} };
  }

  const totalDuration = Math.round(
    (Math.max(...completed.map(s => s.endTime)) - Math.min(...completed.map(s => s.startTime))) * 100
  ) / 100;

  // 按操作统计
  const operations = {};
  for (const s of completed) {
    if (!operations[s.operation]) {
      operations[s.operation] = { count: 0, totalDuration: 0, avgDuration: 0, minDuration: Infinity, maxDuration: 0 };
    }
    const op = operations[s.operation];
    op.count++;
    op.totalDuration += s.duration;
    op.minDuration = Math.min(op.minDuration, s.duration);
    op.maxDuration = Math.max(op.maxDuration, s.duration);
    op.avgDuration = Math.round((op.totalDuration / op.count) * 100) / 100;
  }

  return {
    traceId: traceId || getCurrentTraceId(),
    totalSpans: spans.length,
    completedSpans: completed.length,
    totalDuration,
    operations,
  };
}

/**
 * 获取所有 traceId 列表（按最近使用排序）
 * @returns {string[]}
 */
export function getRecentTraceIds() {
  const ids = [];
  for (const [traceId, spans] of spansByTrace) {
    if (spans.length > 0) {
      ids.push({ traceId, lastActivity: Math.max(...spans.map(s => s.startTime)) });
    }
  }
  ids.sort((a, b) => b.lastActivity - a.lastActivity);
  return ids.map(i => i.traceId);
}

/**
 * 清理旧 trace 数据
 * @param {number} [maxTraces=20] 保留最近 N 个 trace
 */
export function cleanupOldTraces(maxTraces = 20) {
  const ids = getRecentTraceIds();
  if (ids.length <= maxTraces) return;
  const toRemove = ids.slice(maxTraces);
  for (const id of toRemove) {
    spansByTrace.delete(id);
  }
  perfLogger.debug(`清理旧 trace: ${toRemove.length} 个`);
}

/**
 * 导出当前 trace 数据为 JSON
 * @param {string} [traceId]
 * @returns {string}
 */
export function exportTraceData(traceId) {
  const spans = getTraceSpans(traceId);
  const waterfall = getWaterfallData(traceId);
  const summary = getTraceSummary(traceId);
  return JSON.stringify({ summary, spans, waterfall }, null, 2);
}
