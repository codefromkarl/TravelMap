/**
 * session.js 单元测试
 *
 * 测试会话恢复逻辑：
 * - tryRestoreSession - 恢复会话
 * - countMissingLocations - 统计缺失坐标
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock 依赖
vi.mock('../context.js', () => ({
  agent: { state: { messages: [] } },
  currentTripId: null,
  setCurrentTripId: vi.fn(),
}));

vi.mock('../feedback.js', () => ({
  feedback: {
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../db.js', () => ({
  listTrips: vi.fn(() => Promise.resolve([])),
}));

vi.mock('../tools/validate-trip.js', () => ({
  validateAndWarn: vi.fn(() => ({ hasIssues: false, missingCoords: [] })),
}));

// 导入被测模块
import { tryRestoreSession } from '../session.js';

// ─── 测试 ─────────────────────────────────────────────

describe('session.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    window._lastTripPlan = null;
    window._renderTripAnimated = vi.fn();
    window._initPageMap = vi.fn();

    // 设置 DOM
    document.body.innerHTML = `
      <div id="welcome"></div>
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
  });

  describe('tryRestoreSession', () => {
    it('无历史行程时不恢复', async () => {
      const { listTrips } = await import('../db.js');
      listTrips.mockResolvedValue([]);

      await tryRestoreSession();

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

      await tryRestoreSession();

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

      await tryRestoreSession();

      expect(window._lastTripPlan).toBeNull();
    });

    it('24 小时内的行程应恢复', async () => {
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

      await tryRestoreSession();

      expect(window._lastTripPlan).toEqual(tripPlan);
    });

    it('恢复时应显示提示', async () => {
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

      const { feedback } = await import('../feedback.js');

      await tryRestoreSession();

      expect(feedback.success).toHaveBeenCalledWith(
        expect.stringContaining('已恢复'),
        expect.any(Number),
      );
    });

    it('恢复时应隐藏欢迎页', async () => {
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

      await tryRestoreSession();

      expect(document.getElementById('welcome').classList.contains('hidden')).toBe(true);
    });

    it('恢复时应显示导出工具栏', async () => {
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

      await tryRestoreSession();

      expect(document.getElementById('export-toolbar').classList.contains('visible')).toBe(true);
    });
  });
});
