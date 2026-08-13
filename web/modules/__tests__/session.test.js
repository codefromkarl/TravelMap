/**
 * session.js 单元测试
 *
 * 测试会话恢复逻辑：
 * - tryRestoreSession - 恢复会话（带确认提示）
 * - 确认提示交互
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock 依赖
const contextMocks = vi.hoisted(() => ({
  agent: { state: { messages: [] } },
  setCurrentTripId: vi.fn(),
}));

vi.mock('../infra/context.js', () => ({
  agent: contextMocks.agent,
  currentTripId: null,
  setCurrentTripId: contextMocks.setCurrentTripId,
  currentLang: 'zh',
}));

vi.mock('../feedback.js', () => ({
  feedback: {
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
  showToast: vi.fn(),
}));

vi.mock('../db.js', () => ({
  listTrips: vi.fn(() => Promise.resolve([])),
}));

vi.mock('../tools/validate-trip.js', () => ({
  validateAndWarn: vi.fn(() => ({ hasIssues: false, missingCoords: [] })),
}));

vi.mock('../app-state.js', () => ({
  appState: { transition: vi.fn() },
}));

// 导入被测模块
import { tryRestoreSession } from '../session.js';

// ─── 测试 ─────────────────────────────────────────────

describe('session.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    contextMocks.agent.state.messages = [];
    window._lastTripPlan = null;
    window._renderTripAnimated = vi.fn();
    window._initPageMap = vi.fn();

    // 设置 DOM
    document.body.innerHTML = `
      <div id="map-chat-welcome"></div>
      <div id="export-toolbar"></div>
      <button id="btn-export-md" class="disabled-ghost"></button>
      <button id="btn-map" class="disabled-ghost"></button>
    `;
  });

  afterEach(() => {
    vi.useRealTimers();
    window._lastTripPlan = null;
    window._renderTripAnimated = undefined;
    window._initPageMap = undefined;
    // 清理可能残留的提示条
    document.getElementById('session-restore-prompt')?.remove();
  });

  describe('tryRestoreSession', () => {
    it('无历史行程时不恢复', async () => {
      const { listTrips } = await import('../db.js');
      listTrips.mockResolvedValue([]);

      const result = await tryRestoreSession();

      expect(result).toBe(false);
      expect(window._lastTripPlan).toBeNull();
    });

    it('URL 有 trip 参数时不自动恢复', async () => {
      const { listTrips } = await import('../db.js');
      listTrips.mockResolvedValue([
        {
          id: '1',
          title: '测试行程',
          updatedAt: new Date().toISOString(),
          tripPlan: { city: '杭州', days: [] },
        },
      ]);

      // 设置 URL 参数
      Object.defineProperty(window, 'location', {
        value: { search: '?trip=123' },
        writable: true,
      });

      const result = await tryRestoreSession();

      expect(result).toBe(false);
      expect(window._lastTripPlan).toBeNull();
    });

    it('行程超过 24 小时不恢复', async () => {
      const now = new Date('2025-06-01T12:00:00');
      vi.setSystemTime(now);

      const { listTrips } = await import('../db.js');
      listTrips.mockResolvedValue([
        {
          id: '1',
          title: '旧行程',
          updatedAt: '2025-05-31T11:00:00', // 超过 24 小时
          tripPlan: { city: '杭州', days: [] },
        },
      ]);

      Object.defineProperty(window, 'location', {
        value: { search: '' },
        writable: true,
      });

      const result = await tryRestoreSession();

      expect(result).toBe(false);
      expect(window._lastTripPlan).toBeNull();
    });

    it('24 小时内的行程应显示确认提示', async () => {
      const now = new Date('2025-06-01T12:00:00');
      vi.setSystemTime(now);

      const tripPlan = {
        city: '杭州',
        days: [
          {
            day: 1,
            city: '杭州',
            attractions: [
              {
                name: '西湖',
                location: { latitude: 30.2458, longitude: 120.1484 },
              },
            ],
          },
        ],
      };

      const { listTrips } = await import('../db.js');
      listTrips.mockResolvedValue([
        {
          id: '1',
          title: '杭州三日游',
          updatedAt: '2025-06-01T11:00:00', // 1 小时前
          tripPlan,
          messages: [
            { role: 'user', content: '规划杭州游', timestamp: Date.now() },
          ],
        },
      ]);

      Object.defineProperty(window, 'location', {
        value: { search: '' },
        writable: true,
      });

      // 启动恢复（不 await，因为会等待用户确认）
      const restorePromise = tryRestoreSession();

      // 等待 DOM 更新
      await vi.advanceTimersByTimeAsync(100);

      // 验证确认提示出现
      const prompt = document.getElementById('session-restore-prompt');
      expect(prompt).not.toBeNull();
      expect(prompt.textContent).toContain('杭州三日游');

      // 点击"恢复"按钮
      const restoreBtn = prompt.querySelector('button');
      restoreBtn.click();

      // 等待恢复完成
      await vi.advanceTimersByTimeAsync(100);
      const result = await restorePromise;

      expect(result).toBe(true);
      expect(window._lastTripPlan).toEqual(tripPlan);
    });

    it('点击"不用了"应跳过恢复', async () => {
      const now = new Date('2025-06-01T12:00:00');
      vi.setSystemTime(now);

      const { listTrips } = await import('../db.js');
      listTrips.mockResolvedValue([
        {
          id: '1',
          title: '杭州三日游',
          updatedAt: '2025-06-01T11:00:00',
          tripPlan: { city: '杭州', days: [] },
        },
      ]);

      Object.defineProperty(window, 'location', {
        value: { search: '' },
        writable: true,
      });

      const restorePromise = tryRestoreSession();
      await vi.advanceTimersByTimeAsync(100);

      const prompt = document.getElementById('session-restore-prompt');
      expect(prompt).not.toBeNull();

      // 点击"不用了"按钮（第二个按钮）
      const buttons = prompt.querySelectorAll('button');
      buttons[1].click();

      await vi.advanceTimersByTimeAsync(100);
      const result = await restorePromise;

      expect(result).toBe(false);
      expect(window._lastTripPlan).toBeNull();
    });

    it('确认恢复后应隐藏欢迎页', async () => {
      const now = new Date('2025-06-01T12:00:00');
      vi.setSystemTime(now);

      const { listTrips } = await import('../db.js');
      listTrips.mockResolvedValue([
        {
          id: '1',
          title: '杭州三日游',
          updatedAt: '2025-06-01T11:00:00',
          tripPlan: { city: '杭州', days: [] },
        },
      ]);

      Object.defineProperty(window, 'location', {
        value: { search: '' },
        writable: true,
      });

      const restorePromise = tryRestoreSession();
      await vi.advanceTimersByTimeAsync(100);

      const prompt = document.getElementById('session-restore-prompt');
      prompt.querySelector('button').click();

      await vi.advanceTimersByTimeAsync(100);
      await restorePromise;

      expect(document.getElementById('map-chat-welcome').style.display).toBe('none');
    });

    it('确认恢复后应显示导出工具栏', async () => {
      const now = new Date('2025-06-01T12:00:00');
      vi.setSystemTime(now);

      const { listTrips } = await import('../db.js');
      listTrips.mockResolvedValue([
        {
          id: '1',
          title: '杭州三日游',
          updatedAt: '2025-06-01T11:00:00',
          tripPlan: { city: '杭州', days: [] },
        },
      ]);

      Object.defineProperty(window, 'location', {
        value: { search: '' },
        writable: true,
      });

      const restorePromise = tryRestoreSession();
      await vi.advanceTimersByTimeAsync(100);

      const prompt = document.getElementById('session-restore-prompt');
      prompt.querySelector('button').click();

      await vi.advanceTimersByTimeAsync(100);
      await restorePromise;

      expect(document.getElementById('export-toolbar').classList.contains('visible')).toBe(true);
    });

    it('确认提示应显示时间信息', async () => {
      const now = new Date('2025-06-01T12:00:00');
      vi.setSystemTime(now);

      const { listTrips } = await import('../db.js');
      listTrips.mockResolvedValue([
        {
          id: '1',
          title: '上海一日游',
          updatedAt: '2025-06-01T10:30:00', // 1.5 小时前
          tripPlan: { city: '上海', days: [] },
        },
      ]);

      Object.defineProperty(window, 'location', {
        value: { search: '' },
        writable: true,
      });

      const restorePromise = tryRestoreSession();
      await vi.advanceTimersByTimeAsync(100);

      const prompt = document.getElementById('session-restore-prompt');
      expect(prompt).not.toBeNull();
      expect(prompt.textContent).toContain('上海一日游');
      expect(prompt.textContent).toContain('1小时前');

      // 清理：点击跳过
      prompt.querySelectorAll('button')[1].click();
      await vi.advanceTimersByTimeAsync(100);
      await restorePromise;
    });
  });
});
