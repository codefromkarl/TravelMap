/**
 * trace.js 测试 — traceId/sessionId 生成、header 管理
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock perf-trace 模块
vi.mock('../perf-trace.js', () => ({
  startSpan: vi.fn(() => ({ spanId: 'span_mock1' })),
  endSpan: vi.fn(),
  cleanupOldTraces: vi.fn(),
  getWaterfallData: vi.fn(() => []),
  getTraceSummary: vi.fn(() => ({ completedSpans: 0 })),
  getRecentTraceIds: vi.fn(() => []),
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

// Mock DOM
beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<span id="trace-id-display"></span>';
  window._currentRequestSpan = null;
});

describe('trace.js', () => {
  // ─── Session ID ─────────────────────────────────────

  describe('getSessionId', () => {
    it('应生成并持久化 sessionId', async () => {
      const { getSessionId } = await import('../trace.js');
      const sid = getSessionId();
      expect(sid).toMatch(/^ses_/);
      expect(localStorage.getItem('travel-agent-session-id')).toBe(sid);
    });

    it('同一会话内应返回相同 sessionId', async () => {
      const { getSessionId } = await import('../trace.js');
      const sid1 = getSessionId();
      const sid2 = getSessionId();
      expect(sid1).toBe(sid2);
    });
  });

  // ─── Trace ID ───────────────────────────────────────

  describe('generateTraceId', () => {
    it('应生成 trace_ 前缀的 ID', async () => {
      const { generateTraceId } = await import('../trace.js');
      const tid = generateTraceId();
      expect(tid).toMatch(/^trace_/);
    });

    it('每次生成的 ID 应不同', async () => {
      const { generateTraceId } = await import('../trace.js');
      const tid1 = generateTraceId();
      const tid2 = generateTraceId();
      expect(tid1).not.toBe(tid2);
    });
  });

  // ─── setCurrentTraceId / getCurrentTraceId ──────────

  describe('setCurrentTraceId', () => {
    it('应更新 UI 显示（后 12 位）', async () => {
      const { setCurrentTraceId } = await import('../trace.js');
      setCurrentTraceId('trace_m5abc123_xyz789abcdef');
      const display = document.getElementById('trace-id-display');
      expect(display.textContent).toBe('xyz789abcdef');
    });
  });

  describe('getCurrentTraceId', () => {
    it('设置后应返回当前 traceId', async () => {
      const { setCurrentTraceId, getCurrentTraceId } = await import('../trace.js');
      setCurrentTraceId('trace_test456');
      expect(getCurrentTraceId()).toBe('trace_test456');
    });
  });

  // ─── addTraceHeaders ────────────────────────────────

  describe('addTraceHeaders', () => {
    it('应添加 x-trace-id 和 x-session-id', async () => {
      const { addTraceHeaders } = await import('../trace.js');
      const headers = addTraceHeaders({ 'Content-Type': 'application/json' });
      expect(headers.get('x-trace-id')).toMatch(/^trace_/);
      expect(headers.get('x-session-id')).toMatch(/^ses_/);
      expect(headers.get('Content-Type')).toBe('application/json');
    });

    it('应开始 span 追踪', async () => {
      const { addTraceHeaders } = await import('../trace.js');
      const { startSpan } = await import('../perf-trace.js');
      addTraceHeaders();
      expect(startSpan).toHaveBeenCalledWith('api-request', expect.any(Object));
    });
  });

  // ─── extractTraceId ─────────────────────────────────

  describe('extractTraceId', () => {
    it('应从响应中提取 x-trace-id 并结束 span', async () => {
      const { addTraceHeaders, extractTraceId } = await import('../trace.js');
      const { endSpan } = await import('../perf-trace.js');
      // 先调用 addTraceHeaders 设置 _currentRequestSpan
      addTraceHeaders();
      const resp = new Response(null, { headers: { 'x-trace-id': 'trace_test123' } });
      const tid = extractTraceId(resp);
      expect(tid).toBe('trace_test123');
      expect(endSpan).toHaveBeenCalled();
    });

    it('无 x-trace-id 时返回 null', async () => {
      const { extractTraceId } = await import('../trace.js');
      const resp = new Response(null);
      const tid = extractTraceId(resp);
      expect(tid).toBeNull();
    });
  });
});
