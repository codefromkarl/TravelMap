/**
 * share.js 单元测试
 *
 * 测试分享功能逻辑：
 * - generateShareLink - 生成分享链接
 * - loadSharedTripFromHash - 从 URL hash 加载分享数据
 * - downloadImage - 下载图片
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock LZ_STRING
vi.mock('lz-string', () => ({
  compressToBase64: vi.fn((str) => btoa(str)),
  decompressFromBase64: vi.fn((str) => atob(str)),
}));

// 导入被测模块
import { generateShareLink, loadSharedTripFromHash, downloadImage } from '../share.js';

// ─── 测试数据 ─────────────────────────────────────────

const MOCK_TRIP_PLAN = {
  city: '杭州',
  startDate: '2025-06-01',
  endDate: '2025-06-03',
  days: [
    {
      dayIndex: 1,
      date: '2025-06-01',
      city: '杭州',
      attractions: [
        {
          name: '西湖',
          nameZh: '西湖',
          description: '杭州最著名的景点',
        },
        {
          name: '灵隐寺',
          nameZh: '灵隐寺',
          description: '千年古刹',
        },
      ],
    },
  ],
};

// ─── 测试 ─────────────────────────────────────────────

describe('share.js', () => {
  describe('generateShareLink', () => {
    it('null 数据返回空字符串', () => {
      expect(generateShareLink(null)).toBe('');
      expect(generateShareLink(undefined)).toBe('');
    });

    it('有效数据返回 URL', () => {
      const url = generateShareLink(MOCK_TRIP_PLAN);
      expect(url).toContain('https://travel.codefromkarl.xyz');
      expect(url).toContain('#share=');
    });

    it('URL 包含编码后的数据', () => {
      const url = generateShareLink(MOCK_TRIP_PLAN);
      expect(url.length).toBeGreaterThan(50);
    });

    it('URL 长度应小于 2000', () => {
      const url = generateShareLink(MOCK_TRIP_PLAN);
      expect(url.length).toBeLessThanOrEqual(2000);
    });

    it('空 days 数组仍返回有效 URL', () => {
      const tripPlan = { city: '杭州', startDate: '2025-06-01', endDate: '2025-06-03', days: [] };
      const url = generateShareLink(tripPlan);
      expect(url).toContain('https://travel.codefromkarl.xyz');
    });
  });

  describe('loadSharedTripFromHash', () => {
    it('无 hash 时返回 null', () => {
      // jsdom 中 location.hash 默认为空
      expect(loadSharedTripFromHash()).toBeNull();
    });

    it('非 share hash 返回 null', () => {
      Object.defineProperty(window, 'location', {
        value: { ...window.location, hash: '#other=test' },
        writable: true,
      });

      expect(loadSharedTripFromHash()).toBeNull();
    });
  });

  describe('downloadImage', () => {
    it('应创建下载链接', () => {
      // downloadImage 使用 document.createElement('a')
      // 在 jsdom 中这会正常工作
      expect(() => downloadImage('data:image/png;base64,test', 'test.png')).not.toThrow();
    });

    it('无文件名时使用默认名', () => {
      expect(() => downloadImage('data:image/png;base64,test')).not.toThrow();
    });
  });
});
