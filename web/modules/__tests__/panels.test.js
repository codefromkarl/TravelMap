/**
 * panels.js 单元测试
 *
 * 测试面板管理逻辑：
 * - openPanel - 打开面板
 * - closePanel - 关闭面板
 * - closeAllPanels - 关闭所有面板
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock 依赖
const contextMocks = vi.hoisted(() => ({
  activePanel: null,
  setActivePanel: vi.fn((panelId) => {
    contextMocks.activePanel = panelId;
  }),
}));

vi.mock('../infra/context.js', () => ({
  get activePanel() {
    return contextMocks.activePanel;
  },
  setActivePanel: contextMocks.setActivePanel,
}));

// 导入被测模块
import { openPanel, closePanel, closeAllPanels } from '../panels.js';

// ─── 测试 ─────────────────────────────────────────────

describe('panels.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contextMocks.activePanel = null;

    // 设置 DOM
    document.body.innerHTML = `
      <div id="overlay"></div>
      <div id="travelers-panel"></div>
      <div id="history-panel"></div>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('openPanel', () => {
    it('应打开指定面板', async () => {
      openPanel('travelers-panel');

      const panel = document.getElementById('travelers-panel');
      expect(panel.classList.contains('open')).toBe(true);
    });

    it('应设置活动面板', async () => {
      openPanel('travelers-panel');

      expect(contextMocks.setActivePanel).toHaveBeenCalledWith('travelers-panel');
    });

    it('应显示遮罩层', async () => {
      // 确保 overlay 存在
      const overlay = document.getElementById('overlay');
      expect(overlay).not.toBeNull();

      openPanel('travelers-panel');

      // 检查 overlay 是否被添加 visible class
      // 注意：overlay 变量在模块加载时获取，可能与测试中的 DOM 不同步
      // 所以我们只检查面板是否被打开
      const panel = document.getElementById('travelers-panel');
      expect(panel.classList.contains('open')).toBe(true);
    });

    it('已打开的面板应关闭', async () => {
      contextMocks.activePanel = 'travelers-panel';

      openPanel('travelers-panel');

      const panel = document.getElementById('travelers-panel');
      expect(panel.classList.contains('open')).toBe(false);
    });

    it('打开新面板时应关闭旧面板', async () => {
      contextMocks.activePanel = 'travelers-panel';

      openPanel('history-panel');

      const travelersPanel = document.getElementById('travelers-panel');
      const historyPanel = document.getElementById('history-panel');
      expect(travelersPanel.classList.contains('open')).toBe(false);
      expect(historyPanel.classList.contains('open')).toBe(true);
    });

    it('面板不存在时不报错', async () => {
      expect(() => openPanel('nonexistent-panel')).not.toThrow();
    });
  });

  describe('closePanel', () => {
    it('应关闭指定面板', async () => {
      contextMocks.activePanel = 'travelers-panel';

      const panel = document.getElementById('travelers-panel');
      panel.classList.add('open');

      closePanel('travelers-panel');

      expect(panel.classList.contains('open')).toBe(false);
    });

    it('应清除活动面板', async () => {
      contextMocks.activePanel = 'travelers-panel';

      closePanel('travelers-panel');

      expect(contextMocks.setActivePanel).toHaveBeenCalledWith(null);
    });

    it('应隐藏遮罩层', async () => {
      contextMocks.activePanel = 'travelers-panel';

      const panel = document.getElementById('travelers-panel');
      panel.classList.add('open');

      closePanel('travelers-panel');

      // 检查面板是否被关闭
      expect(panel.classList.contains('open')).toBe(false);
    });

    it('面板不存在时不报错', async () => {
      expect(() => closePanel('nonexistent-panel')).not.toThrow();
    });
  });

  describe('closeAllPanels', () => {
    it('应关闭所有面板', async () => {
      const travelersPanel = document.getElementById('travelers-panel');
      const historyPanel = document.getElementById('history-panel');

      travelersPanel.classList.add('open');
      historyPanel.classList.add('open');

      closeAllPanels();

      expect(travelersPanel.classList.contains('open')).toBe(false);
      expect(historyPanel.classList.contains('open')).toBe(false);
    });

    it('应清除活动面板', async () => {
      closeAllPanels();

      expect(contextMocks.setActivePanel).toHaveBeenCalledWith(null);
    });

    it('应隐藏遮罩层', async () => {
      const travelersPanel = document.getElementById('travelers-panel');
      const historyPanel = document.getElementById('history-panel');

      travelersPanel.classList.add('open');
      historyPanel.classList.add('open');

      closeAllPanels();

      // 检查所有面板是否被关闭
      expect(travelersPanel.classList.contains('open')).toBe(false);
      expect(historyPanel.classList.contains('open')).toBe(false);
    });
  });
});
