/**
 * location.js 单元测试
 *
 * 测试位置服务逻辑：
 * - getUserLocation - 获取用户位置
 * - 位置缓存机制
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock 依赖
vi.mock('../context.js', () => ({
  getAmapGeoKey: vi.fn(() => 'test-geo-key'),
}));

// Mock navigator.geolocation
const mockGetCurrentPosition = vi.fn();
Object.defineProperty(navigator, 'geolocation', {
  value: {
    getCurrentPosition: mockGetCurrentPosition,
  },
  writable: true,
});

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// 导入被测模块
import { getUserLocation } from '../location.js';

// ─── 测试 ─────────────────────────────────────────────

describe('location.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockFetch.mockReset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  // === getUserLocation ===
  describe('getUserLocation', () => {
    it('浏览器不支持定位时抛出错误', async () => {
      const originalGeolocation = navigator.geolocation;
      Object.defineProperty(navigator, 'geolocation', {
        value: undefined,
        writable: true,
      });

      await expect(getUserLocation()).rejects.toThrow('浏览器不支持定位功能');

      Object.defineProperty(navigator, 'geolocation', {
        value: originalGeolocation,
        writable: true,
      });
    });

    it('用户拒绝定位权限时抛出错误', async () => {
      mockGetCurrentPosition.mockImplementation((success, error) => {
        error({ code: 1, message: 'User denied Geolocation' });
      });

      await expect(getUserLocation()).rejects.toThrow();
    });

    it('成功获取位置', async () => {
      mockGetCurrentPosition.mockImplementation((success) => {
        success({
          coords: { latitude: 30.2458, longitude: 120.1484 },
        });
      });

      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({
          status: '1',
          regeocode: { addressComponent: { city: '杭州市' } },
        }),
      });

      const result = await getUserLocation();
      expect(result.latitude).toBe(30.2458);
      expect(result.longitude).toBe(120.1484);
    });

    it('反向解析失败时不报错', async () => {
      mockGetCurrentPosition.mockImplementation((success) => {
        success({
          coords: { latitude: 30.2458, longitude: 120.1484 },
        });
      });

      mockFetch.mockRejectedValue(new Error('Geocoding failed'));

      const result = await getUserLocation();
      expect(result.latitude).toBe(30.2458);
      expect(result.city).toBeNull();
    });

    it('无高德 API Key 时不调用反向解析', async () => {
      const context = await import('../context.js');
      context.getAmapGeoKey.mockReturnValue('');

      mockGetCurrentPosition.mockImplementation((success) => {
        success({
          coords: { latitude: 30.2458, longitude: 120.1484 },
        });
      });

      const result = await getUserLocation();
      expect(result.latitude).toBe(30.2458);
      expect(result.city).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // === localStorage 缓存 ===
  describe('localStorage 缓存', () => {
    it('localStorage 数据格式错误时不报错', async () => {
      localStorage.setItem('travel-agent-location', 'invalid json');

      mockGetCurrentPosition.mockImplementation((success) => {
        success({
          coords: { latitude: 30.2458, longitude: 120.1484 },
        });
      });

      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({
          status: '1',
          regeocode: { addressComponent: { city: '杭州市' } },
        }),
      });

      const result = await getUserLocation();
      expect(result.latitude).toBe(30.2458);
    });
  });
});
