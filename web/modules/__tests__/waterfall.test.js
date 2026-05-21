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
  getCurrentTraceId: vi.fn(() => null),
  exportTraceData: vi.fn(() => '{}'),
}));

// 导入被测模块
import { showPanel, hidePanel, togglePanel } from '../waterfall.js';

// ─── 测试 ─────────────────────────────────────────────

describe('waterfall.js', () => {
  beforeEach(() => {
    // 设置 DOM
    document.body.innerHTML = `
      <div id="waterfall-panel"></div>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('showPanel', () => {
    it('应显示面板', () => {
      showPanel();

      const panel = document.getElementById('waterfall-panel');
      if (panel) {
        expect(panel.classList.contains('visible')).toBe(true);
      }
    });

    it('无面板元素时不报错', () => {
      document.body.innerHTML = '';

      expect(() => showPanel()).not.toThrow();
    });
  });

  describe('hidePanel', () => {
    it('应隐藏面板', () => {
      const panel = document.getElementById('waterfall-panel');
      if (panel) {
        panel.classList.add('visible');
      }

      hidePanel();

      if (panel) {
        expect(panel.classList.contains('visible')).toBe(false);
      }
    });

    it('无面板元素时不报错', () => {
      document.body.innerHTML = '';

      expect(() => hidePanel()).not.toThrow();
    });
  });

  describe('togglePanel', () => {
    it('隐藏时应显示面板', () => {
      const panel = document.getElementById('waterfall-panel');
      if (panel) {
        panel.classList.remove('visible');
      }

      togglePanel();

      if (panel) {
        expect(panel.classList.contains('visible')).toBe(true);
      }
    });

    it('显示时应隐藏面板', () => {
      const panel = document.getElementById('waterfall-panel');
      if (panel) {
        panel.classList.add('visible');
      }

      togglePanel();

      if (panel) {
        expect(panel.classList.contains('visible')).toBe(false);
      }
    });
  });
});
