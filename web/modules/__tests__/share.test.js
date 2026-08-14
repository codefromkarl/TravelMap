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
import { generateShareLink, loadSharedTripFromHash, downloadImage, createServerShareId, decodeSharedTripContent } from '../share.js';

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

  describe('createServerShareId', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('POST 到 /api/share 并返回 id', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'share-abc' }),
      });

      const id = await createServerShareId(MOCK_TRIP_PLAN);
      expect(id).toBe('share-abc');
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const [url, init] = globalThis.fetch.mock.calls[0];
      expect(url).toBe('/api/share');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body);
      expect(typeof body.content).toBe('string');
      expect(body.content.length).toBeGreaterThan(0);
    });

    it('服务端返回错误时抛错', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: 'Too many requests', code: 'RATE_LIMITED' }),
      });

      await expect(createServerShareId(MOCK_TRIP_PLAN)).rejects.toThrow('Too many requests');
    });

    it('网络错误时抛错', async () => {
      globalThis.fetch.mockRejectedValue(new Error('network'));

      await expect(createServerShareId(MOCK_TRIP_PLAN)).rejects.toThrow('network');
    });
  });

  describe('decodeSharedTripContent', () => {
    it('还原压缩内容为结构化数据', () => {
      const shareData = {
        c: '杭州',
        s: '2025-06-01',
        e: '2025-06-03',
        d: [{ i: 1, a: [{ n: '西湖' }] }],
      };
      const compressed = btoa(encodeURIComponent(JSON.stringify(shareData)));
      const data = decodeSharedTripContent(compressed);
      expect(data).toBeTruthy();
      expect(data.c).toBe('杭州');
      expect(data.d).toHaveLength(1);
    });

    it('无效内容返回 null', () => {
      expect(decodeSharedTripContent('')).toBeNull();
      expect(decodeSharedTripContent(null)).toBeNull();
      expect(decodeSharedTripContent('not-valid-base64!!!')).toBeNull();
    });
  });
});
