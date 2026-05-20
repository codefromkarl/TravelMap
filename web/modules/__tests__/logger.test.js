/**
 * logger.js 测试 — 结构化日志、环形缓冲区、级别控制
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock trace.js（logger 依赖 getCurrentTraceId/getSessionId）
vi.mock('../trace.js', () => ({
  getCurrentTraceId: vi.fn(() => 'trace_test'),
  getSessionId: vi.fn(() => 'ses_test'),
}));

beforeEach(() => {
  localStorage.clear();
});

describe('logger.js', () => {
  // ─── Logger 基本功能 ────────────────────────────────

  describe('getLogger', () => {
    it('应返回单例 logger', async () => {
      const { getLogger } = await import('../logger.js');
      const l1 = getLogger();
      const l2 = getLogger();
      expect(l1).toBe(l2);
    });
  });

  describe('createLogger', () => {
    it('应创建子 logger 并附加 component', async () => {
      const { createLogger, resetLogger, getLogEntries } = await import('../logger.js');
      resetLogger();
      const modLog = createLogger('test-module');
      modLog.info('hello');
      const entries = getLogEntries();
      expect(entries.length).toBeGreaterThanOrEqual(1);
      const last = entries[entries.length - 1];
      expect(last.msg).toBe('hello');
      expect(last.component).toBe('test-module');
    });
  });

  // ─── 环形缓冲区 ────────────────────────────────────

  describe('getLogEntries', () => {
    it('应返回按时间排序的日志', async () => {
      const { getLogger, resetLogger, getLogEntries } = await import('../logger.js');
      resetLogger();
      const log = getLogger();
      log.info('first');
      log.info('second');
      const entries = getLogEntries();
      expect(entries.length).toBeGreaterThanOrEqual(2);
      // 最后两条应该是我们刚写的
      const recent = entries.slice(-2);
      expect(recent[0].msg).toBe('first');
      expect(recent[1].msg).toBe('second');
    });

    it('应支持按 level 过滤', async () => {
      const { getLogger, resetLogger, getLogEntries } = await import('../logger.js');
      resetLogger();
      const log = getLogger();
      log.debug('debug-msg');
      log.info('info-msg');
      log.warn('warn-msg');
      const warns = getLogEntries({ level: 'warn' });
      expect(warns.every(e => e.level === 'warn' || e.level === 'error')).toBe(true);
    });

    it('应支持按 traceId 过滤', async () => {
      const { getLogger, resetLogger, getLogEntries } = await import('../logger.js');
      resetLogger();
      const log = getLogger();
      log.info('filtered-test');
      const filtered = getLogEntries({ traceId: 'trace_test' });
      expect(filtered.length).toBeGreaterThanOrEqual(1);
      expect(filtered.every(e => e.traceId === 'trace_test')).toBe(true);
    });

    it('应支持 limit 参数', async () => {
      const { getLogger, resetLogger, getLogEntries } = await import('../logger.js');
      resetLogger();
      const log = getLogger();
      for (let i = 0; i < 10; i++) log.info(`msg-${i}`);
      const limited = getLogEntries({ limit: 3 });
      expect(limited.length).toBe(3);
    });
  });

  // ─── 日志级别 ───────────────────────────────────────

  describe('setLogLevel', () => {
    it('应修改最低输出级别', async () => {
      const { getLogger, resetLogger, setLogLevel, getLogEntries } = await import('../logger.js');
      resetLogger();
      setLogLevel('warn');
      const log = getLogger();
      log.debug('should-be-hidden');
      log.info('also-hidden');
      log.warn('should-be-visible');
      const entries = getLogEntries({ limit: 10 });
      const msgs = entries.map(e => e.msg);
      expect(msgs).not.toContain('should-be-hidden');
      expect(msgs).not.toContain('also-hidden');
      expect(msgs).toContain('should-be-visible');
    });
  });

  // ─── child logger ──────────────────────────────────

  describe('child logger', () => {
    it('子 logger 应继承并合并字段', async () => {
      const { getLogger, resetLogger, getLogEntries } = await import('../logger.js');
      resetLogger();
      const parent = getLogger();
      const child = parent.child({ component: 'child-mod', extraField: 'value' });
      child.info('child-msg');
      const entries = getLogEntries();
      const last = entries[entries.length - 1];
      expect(last.component).toBe('child-mod');
      expect(last.extraField).toBe('value');
    });
  });

  // ─── exportLogsAsJson ───────────────────────────────

  describe('exportLogsAsJson', () => {
    it('应返回合法 JSON', async () => {
      const { getLogger, resetLogger, exportLogsAsJson } = await import('../logger.js');
      resetLogger();
      const log = getLogger();
      log.info('export-test');
      const json = exportLogsAsJson();
      expect(() => JSON.parse(json)).not.toThrow();
      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed)).toBe(true);
    });
  });
});
