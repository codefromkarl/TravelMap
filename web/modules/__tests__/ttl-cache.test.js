/**
 * ttl-cache.js 单元测试
 *
 * 覆盖：
 *   - set/get 往返（含 null / false / 0 / "" 等 falsy 值）
 *   - TTL 过期自动失效
 *   - 容量上限清理（先过期、后先进先出）
 *   - 容错（localStorage 满 / 隐私模式 / 损坏数据）
 *   - 不可序列化值拒绝写入
 *   - ttlDelete
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ttlGet, ttlSet, ttlDelete, TTL_CACHE_MAX } from '../infra/ttl-cache.js';

const STORAGE_KEY = 'travel-map-ttl-cache';

describe('ttl-cache.js', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('set / get 往返', () => {
    it('字符串值', () => {
      expect(ttlSet('a', 'hello', 1000)).toBe(true);
      expect(ttlGet('a')).toBe('hello');
    });

    it('对象值', () => {
      const value = { lat: 30.2458, lng: 120.1484, name: '西湖' };
      expect(ttlSet('a', value, 1000)).toBe(true);
      expect(ttlGet('a')).toEqual(value);
    });

    it('数组值', () => {
      expect(ttlSet('a', [1, 2, 3], 1000)).toBe(true);
      expect(ttlGet('a')).toEqual([1, 2, 3]);
    });

    it('falsy 值（null / false / 0 / ""）正确往返', () => {
      expect(ttlSet('n', null, 1000)).toBe(true);
      expect(ttlGet('n')).toBeNull();
      expect(ttlSet('f', false, 1000)).toBe(true);
      expect(ttlGet('f')).toBe(false);
      expect(ttlSet('z', 0, 1000)).toBe(true);
      expect(ttlGet('z')).toBe(0);
      expect(ttlSet('e', '', 1000)).toBe(true);
      expect(ttlGet('e')).toBe('');
    });

    it('未命中返回 null', () => {
      expect(ttlGet('missing')).toBeNull();
    });
  });

  describe('TTL 过期', () => {
    it('TTL 内命中，过期后返回 null', () => {
      ttlSet('k', 'v', 1000);
      expect(ttlGet('k')).toBe('v');
      vi.advanceTimersByTime(1001);
      expect(ttlGet('k')).toBeNull();
    });

    it('过期条目在读取时被惰性清理', () => {
      ttlSet('k', 'v', 1000);
      vi.advanceTimersByTime(1001);
      ttlGet('k');
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
      expect(raw).toEqual({});
    });

    it('非法 ttl（<=0 / 非数字）拒绝写入', () => {
      expect(ttlSet('a', 'v', 0)).toBe(false);
      expect(ttlSet('a', 'v', -1)).toBe(false);
      expect(ttlSet('a', 'v', NaN)).toBe(false);
      expect(ttlSet('a', 'v', undefined)).toBe(false);
      expect(ttlGet('a')).toBeNull();
    });
  });

  describe('容量上限清理', () => {
    it('超出容量时先清过期、再按先进先出淘汰最旧条目', () => {
      // 填满到上限
      for (let i = 0; i < TTL_CACHE_MAX; i++) {
        ttlSet('k' + i, 'v' + i, 60_000);
      }
      // 再写入一条，触发淘汰：最旧的 k0 被清除
      expect(ttlSet('newest', 'v', 60_000)).toBe(true);
      expect(ttlGet('k0')).toBeNull();
      expect(ttlGet('newest')).toBe('v');
      expect(ttlGet('k' + (TTL_CACHE_MAX - 1))).toBe('v' + (TTL_CACHE_MAX - 1));

      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
      expect(Object.keys(raw).length).toBe(TTL_CACHE_MAX);
    });

    it('写入时优先清理已过期条目而非淘汰有效条目', () => {
      // 190 条长期有效 + 10 条即将过期 = 刚好填满
      for (let i = 0; i < 190; i++) {
        ttlSet('k' + i, 'v' + i, 60_000);
      }
      for (let i = 0; i < 10; i++) {
        ttlSet('exp' + i, 'v', 1000);
      }
      // 让 exp 条目过期（k 条目仍有效）
      vi.advanceTimersByTime(1001);
      expect(ttlSet('fresh', 'v', 60_000)).toBe(true);

      // 过期条目被清理，最旧的有效条目 k0 未被淘汰
      for (let i = 0; i < 10; i++) {
        expect(ttlGet('exp' + i)).toBeNull();
      }
      expect(ttlGet('k0')).toBe('v0');
      expect(ttlGet('k189')).toBe('v189');
      expect(ttlGet('fresh')).toBe('v');

      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
      expect(Object.keys(raw).length).toBe(191);
    });
  });

  describe('容错', () => {
    it('localStorage 满（setItem 抛异常）时 ttlSet 返回 false 不抛错', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      expect(() => ttlSet('a', 'v', 1000)).not.toThrow();
      expect(ttlSet('a', 'v', 1000)).toBe(false);
    });

    it('隐私模式（getItem 抛异常）时 ttlGet 返回 null 不抛错', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      expect(() => ttlGet('a')).not.toThrow();
      expect(ttlGet('a')).toBeNull();
    });

    it('损坏的 JSON 数据返回 null 不抛错', () => {
      localStorage.setItem(STORAGE_KEY, '{not valid json');
      expect(() => ttlGet('a')).not.toThrow();
      expect(ttlGet('a')).toBeNull();
    });

    it('存储键被非对象值污染时返回 null 不抛错', () => {
      localStorage.setItem(STORAGE_KEY, '"just-a-string"');
      expect(() => ttlGet('a')).not.toThrow();
      expect(ttlGet('a')).toBeNull();
    });
  });

  describe('不可序列化值', () => {
    it('循环引用拒绝写入并返回 null', () => {
      const circular = {};
      circular.self = circular;
      expect(ttlSet('c', circular, 1000)).toBe(false);
      expect(ttlGet('c')).toBeNull();
    });

    it('函数 / Symbol / undefined / BigInt 拒绝写入', () => {
      expect(ttlSet('f', () => {}, 1000)).toBe(false);
      expect(ttlGet('f')).toBeNull();
      expect(ttlSet('s', Symbol('x'), 1000)).toBe(false);
      expect(ttlGet('s')).toBeNull();
      expect(ttlSet('u', undefined, 1000)).toBe(false);
      expect(ttlGet('u')).toBeNull();
      expect(ttlSet('b', 123n, 1000)).toBe(false);
      expect(ttlGet('b')).toBeNull();
    });
  });

  describe('ttlDelete', () => {
    it('删除存在的条目返回 true，删除后读取为 null', () => {
      ttlSet('a', 'v', 1000);
      expect(ttlDelete('a')).toBe(true);
      expect(ttlGet('a')).toBeNull();
    });

    it('删除不存在的条目返回 false', () => {
      expect(ttlDelete('missing')).toBe(false);
    });

    it('空键 / 非字符串键不产生副作用', () => {
      expect(ttlDelete('')).toBe(false);
      expect(ttlGet('')).toBeNull();
      expect(ttlSet('', 'v', 1000)).toBe(false);
    });
  });
});
