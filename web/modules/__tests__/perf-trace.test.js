/**
 * perf-trace.js 测试 — span CRUD、瀑布图数据生成、统计
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock trace.js
vi.mock('../trace.js', () => ({
  getCurrentTraceId: vi.fn(() => 'trace_test'),
}));

// Mock logger
vi.mock('../logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('perf-trace.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── startSpan / endSpan ────────────────────────────

  describe('startSpan', () => {
    it('应创建包含必要字段的 span', async () => {
      const { startSpan } = await import('../perf-trace.js');
      const span = startSpan('test-op');
      expect(span.spanId).toMatch(/^span_/);
      expect(span.operation).toBe('test-op');
      expect(span.traceId).toBe('trace_test');
      expect(span.status).toBe('running');
      expect(span.startTime).toBeTypeOf('number');
    });

    it('应支持自定义 metadata', async () => {
      const { startSpan } = await import('../perf-trace.js');
      const span = startSpan('test-op', { metadata: { city: '北京' } });
      expect(span.metadata.city).toBe('北京');
    });
  });

  describe('endSpan', () => {
    it('应计算 duration 并标记 completed', async () => {
      const { startSpan, endSpan } = await import('../perf-trace.js');
      const span = startSpan('test-op');
      const result = endSpan(span.spanId);
      expect(result.status).toBe('completed');
      expect(result.duration).toBeTypeOf('number');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('未找到 span 时返回 null', async () => {
      const { endSpan } = await import('../perf-trace.js');
      const result = endSpan('nonexistent');
      expect(result).toBeNull();
    });
  });

  // ─── traceAsync ─────────────────────────────────────

  describe('traceAsync', () => {
    it('成功时应返回结果', async () => {
      const { traceAsync } = await import('../perf-trace.js');
      const result = await traceAsync('async-op', async () => 42);
      expect(result).toBe(42);
    });

    it('失败时应重新抛出错误', async () => {
      const { traceAsync } = await import('../perf-trace.js');
      await expect(
        traceAsync('failing-op', async () => { throw new Error('boom'); }),
      ).rejects.toThrow('boom');
    });
  });

  // ─── getWaterfallData ───────────────────────────────

  describe('getWaterfallData', () => {
    it('无 span 时返回空数组', async () => {
      const { getWaterfallData } = await import('../perf-trace.js');
      const data = getWaterfallData('trace_nonexistent');
      expect(data).toEqual([]);
    });

    it('应构建 span 树', async () => {
      const { startSpan, endSpan, getWaterfallData } = await import('../perf-trace.js');
      const parent = startSpan('parent');
      const child = startSpan('child', { parentSpanId: parent.spanId });
      endSpan(child.spanId);
      endSpan(parent.spanId);

      const data = getWaterfallData();
      // 应有根节点
      expect(data.length).toBeGreaterThanOrEqual(1);
      // 根节点应该有 children
      const root = data.find(n => n.span.operation === 'parent');
      expect(root).toBeDefined();
      expect(root.children.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── getTraceSummary ────────────────────────────────

  describe('getTraceSummary', () => {
    it('无 span 时返回空统计', async () => {
      const { getTraceSummary } = await import('../perf-trace.js');
      const summary = getTraceSummary('trace_nonexistent');
      expect(summary.totalSpans).toBe(0);
      expect(summary.completedSpans).toBe(0);
    });

    it('应按操作统计耗时', async () => {
      const { startSpan, endSpan, getTraceSummary } = await import('../perf-trace.js');
      const s1 = startSpan('search');
      endSpan(s1.spanId);
      const s2 = startSpan('search');
      endSpan(s2.spanId);
      const s3 = startSpan('enrich');
      endSpan(s3.spanId);

      const summary = getTraceSummary();
      expect(summary.operations.search).toBeDefined();
      expect(summary.operations.search.count).toBeGreaterThanOrEqual(2);
      expect(summary.operations.enrich.count).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── exportTraceData ────────────────────────────────

  describe('exportTraceData', () => {
    it('应返回合法 JSON', async () => {
      const { exportTraceData } = await import('../perf-trace.js');
      const json = exportTraceData('trace_test');
      expect(() => JSON.parse(json)).not.toThrow();
      const parsed = JSON.parse(json);
      expect(parsed.summary).toBeDefined();
      expect(parsed.spans).toBeDefined();
    });
  });
});
