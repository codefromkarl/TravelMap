/**
 * waterfall.js 单元测试
 *
 * 测试瀑布图功能：
 * - showPanel - 显示面板
 * - hidePanel - 隐藏面板
 * - togglePanel - 切换面板
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock perf-trace.js
vi.mock('../perf-trace.js', () => ({
  getWaterfallData: vi.fn(() => []),
  getTraceSummary: vi.fn(() => ({ completedSpans: 0, totalDuration: 0 })),
  getRecentTraceIds: vi.fn(() => []),
  exportTraceData: vi.fn(() => '{}'),
}));

vi.mock('../logger.js', () => ({
  getLogEntries: vi.fn(() => []),
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('../trace.js', () => ({
  getCurrentTraceId: vi.fn(() => null),
}));

let showPanel;
let hidePanel;
let togglePanel;

// ─── 测试 ─────────────────────────────────────────────

describe('waterfall.js', () => {
  beforeEach(async () => {
    vi.resetModules();
    document.body.innerHTML = '';
    ({ showPanel, hidePanel, togglePanel } = await import('../waterfall.js'));
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('showPanel', () => {
    it('应显示面板', () => {
      showPanel();

      const panel = document.getElementById('trace-waterfall-panel');
      expect(panel?.classList.contains('visible')).toBe(true);
    });

    it('重复显示时应复用面板', () => {
      showPanel();
      showPanel();

      expect(document.querySelectorAll('#trace-waterfall-panel')).toHaveLength(1);
      expect(document.getElementById('trace-waterfall-panel')?.classList.contains('visible')).toBe(true);
    });
  });

  describe('hidePanel', () => {
    it('应隐藏面板', () => {
      showPanel();
      const panel = document.getElementById('trace-waterfall-panel');

      hidePanel();

      expect(panel?.classList.contains('visible')).toBe(false);
    });

    it('无面板元素时不报错', () => {
      hidePanel();

      expect(document.getElementById('trace-waterfall-panel')).toBeNull();
    });
  });

  describe('togglePanel', () => {
    it('隐藏时应显示面板', () => {
      togglePanel();

      const panel = document.getElementById('trace-waterfall-panel');
      expect(panel?.classList.contains('visible')).toBe(true);
    });

    it('显示时应隐藏面板', () => {
      showPanel();
      const panel = document.getElementById('trace-waterfall-panel');

      togglePanel();

      expect(panel?.classList.contains('visible')).toBe(false);
    });
  });
});
