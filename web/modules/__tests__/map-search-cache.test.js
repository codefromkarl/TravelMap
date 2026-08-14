/**
 * map.js searchLocation() 单元测试 — 外部 API TTL 缓存
 *
 * 覆盖：
 *   - 高德 POI 搜索：首次请求写入缓存，二次命中不重复请求（fetch 只调用一次）
 *   - Nominatim 搜索：首次请求写入缓存，二次命中不重复请求
 *   - 无结果时不写入缓存，重复查询仍穿透请求（fetch 调用两次）
 *   - 不同查询词使用不同缓存键，互不干扰
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock context.js（ui/map.js 实际 import ./infra/context.js，需同时 mock）
vi.mock('../context.js', () => ({
  showToast: vi.fn(),
  getAmapGeoKey: vi.fn(() => 'test-geo-key'),
  CITY_CENTERS: {},
}));

vi.mock('../infra/context.js', () => ({
  showToast: vi.fn(),
  getAmapGeoKey: vi.fn(() => 'test-geo-key'),
  CITY_CENTERS: {},
}));

vi.mock('../i18n.js', () => ({
  I18N: {},
}));

vi.mock('../db.js', () => ({
  loadSupplyPointsFromCache: vi.fn(),
  saveSupplyPointsToCache: vi.fn(),
}));

// 导入被测模块（searchLocation 经 ../map.js 兼容重导出）
import { searchLocation } from '../map.js';

describe('searchLocation TTL 缓存', () => {
  let mockFetch;

  beforeEach(() => {
    localStorage.clear();
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('高德 POI 搜索：首次请求写入缓存，二次命中不重复请求', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({
        status: '1',
        pois: [
          {
            name: '西湖',
            location: '120.1484,30.2458',
            type: '风景名胜',
            address: '杭州市西湖区',
          },
        ],
      }),
    });

    const first = await searchLocation('西湖', 'test-geo-key');
    const second = await searchLocation('西湖', 'test-geo-key');

    expect(first).toMatchObject({ source: 'amap', name: '西湖', lat: 30.2458, lng: 120.1484 });
    expect(second).toEqual(first);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('Nominatim 搜索：首次请求写入缓存，二次命中不重复请求', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve([
        { lat: '30.2458', lon: '120.1484', display_name: 'West Lake, Hangzhou' },
      ]),
    });

    const first = await searchLocation('west lake', '');
    const second = await searchLocation('west lake', '');

    expect(first).toMatchObject({ source: 'nominatim', lat: 30.2458, lng: 120.1484 });
    expect(second).toEqual(first);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('无结果时不写入缓存，重复查询仍穿透请求', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ status: '0', pois: [] }),
    });

    const first = await searchLocation('不存在的景点', 'test-geo-key');
    const second = await searchLocation('不存在的景点', 'test-geo-key');

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('不同查询词使用不同缓存键，互不干扰', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({
        status: '1',
        pois: [
          { name: '西湖', location: '120.1484,30.2458', type: '风景名胜', address: '' },
        ],
      }),
    });

    await searchLocation('西湖', 'test-geo-key');
    await searchLocation('灵隐寺', 'test-geo-key');

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
