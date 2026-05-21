/**
 * coord-cache.js 单元测试
 *
 * 测试坐标缓存逻辑：
 * - 模块导入不报错
 * - 导出函数存在
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';

// 导入被测模块
import {
  getCachedCoord,
  setCachedCoord,
  clearExpiredCoords,
  getCoordCacheStats,
  clearAllCoords,
  batchGetCachedCoords,
  batchSetCachedCoords,
} from '../coord-cache.js';

// ─── 测试 ─────────────────────────────────────────────

describe('coord-cache.js', () => {
  describe('模块导入', () => {
    it('getCachedCoord 应为函数', () => {
      expect(typeof getCachedCoord).toBe('function');
    });

    it('setCachedCoord 应为函数', () => {
      expect(typeof setCachedCoord).toBe('function');
    });

    it('clearExpiredCoords 应为函数', () => {
      expect(typeof clearExpiredCoords).toBe('function');
    });

    it('getCoordCacheStats 应为函数', () => {
      expect(typeof getCoordCacheStats).toBe('function');
    });

    it('clearAllCoords 应为函数', () => {
      expect(typeof clearAllCoords).toBe('function');
    });

    it('batchGetCachedCoords 应为函数', () => {
      expect(typeof batchGetCachedCoords).toBe('function');
    });

    it('batchSetCachedCoords 应为函数', () => {
      expect(typeof batchSetCachedCoords).toBe('function');
    });
  });

  describe('函数调用', () => {
    it('getCachedCoord 应返回 Promise', () => {
      const result = getCachedCoord('杭州', '西湖');
      expect(result).toBeInstanceOf(Promise);
    });

    it('setCachedCoord 应返回 Promise', () => {
      const result = setCachedCoord('杭州', '西湖', { latitude: 30, longitude: 120 });
      expect(result).toBeInstanceOf(Promise);
    });

    it('clearExpiredCoords 应返回 Promise', () => {
      const result = clearExpiredCoords();
      expect(result).toBeInstanceOf(Promise);
    });

    it('getCoordCacheStats 应返回 Promise', () => {
      const result = getCoordCacheStats();
      expect(result).toBeInstanceOf(Promise);
    });

    it('clearAllCoords 应返回 Promise', () => {
      const result = clearAllCoords();
      expect(result).toBeInstanceOf(Promise);
    });
  });
});
