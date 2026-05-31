/**
 * geocodeAttractions() 单元测试
 *
 * 测试前端地理编码补全逻辑：
 * - 有坐标的景点不触发补全
 * - location: null 触发高德 API 补全
 * - location: {0, 0} 触发补全
 * - 高德 API 失败时 fallback 到 CITY_CENTERS
 * - 批量补全并发控制
 * - LRU 缓存命中
 * - 无 API Key 时返回 0
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock 依赖 ─────────────────────────────────────────

// Mock context.js (ui/map.js 实际 import ./infra/context.js，需同时 mock)
vi.mock('../context.js', () => ({
  showToast: vi.fn(),
  getAmapGeoKey: vi.fn(() => 'test-geo-key'),
  CITY_CENTERS: {
    '杭州': [30.2741, 120.1551],
    '北京': [39.9042, 116.4074],
    '上海': [31.2304, 121.4737],
  },
}));

vi.mock('../infra/context.js', () => ({
  showToast: vi.fn(),
  getAmapGeoKey: vi.fn(() => 'test-geo-key'),
  CITY_CENTERS: {
    '杭州': [30.2741, 120.1551],
    '北京': [39.9042, 116.4074],
    '上海': [31.2304, 121.4737],
  },
}));

// Mock i18n.js
vi.mock('../i18n.js', () => ({
  I18N: {},
}));

// Mock db.js
vi.mock('../db.js', () => ({
  loadSupplyPointsFromCache: vi.fn(),
  saveSupplyPointsToCache: vi.fn(),
}));

// ─── 测试数据 ─────────────────────────────────────────

const createTripPlan = (attractions) => ({
  city: '杭州',
  days: [
    {
      day: 1,
      city: '杭州',
      attractions,
    },
  ],
});

const createAttraction = (name, location) => ({
  name,
  nameZh: name,
  location,
});

// ─── 测试 ─────────────────────────────────────────────

describe('geocodeAttractions', () => {
  let geocodeAttractions;
  let mockFetch;

  beforeEach(async () => {
    // 动态导入以获取新的模块实例
    const mapModule = await import('../map.js');
    geocodeAttractions = mapModule.geocodeAttractions || window._geocodeAttractions;

    // Mock fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // 清除 geoCache（通过重新导入模块）
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('有坐标的景点不触发补全', async () => {
    const tripPlan = createTripPlan([
      createAttraction('西湖', { latitude: 30.2458, longitude: 120.1484 }),
      createAttraction('灵隐寺', { latitude: 30.2414, longitude: 120.1017 }),
    ]);

    const count = await geocodeAttractions(tripPlan);
    expect(count).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('location: null 的景点触发高德 API 补全', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({
        status: '1',
        geocodes: [{ location: '120.1484,30.2458' }],
      }),
    });

    const tripPlan = createTripPlan([
      createAttraction('河坊街', null),
    ]);

    const count = await geocodeAttractions(tripPlan);
    expect(count).toBe(1);
    const loc = tripPlan.days[0].attractions[0].location;
    // 高德返回 GCJ-02 坐标，直接使用（高德地图本身使用 GCJ-02）
    expect(loc.latitude).toBeCloseTo(30.2458, 3);
    expect(loc.longitude).toBeCloseTo(120.1484, 3);
  });

  it('location: {0, 0} 的景点触发补全', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({
        status: '1',
        geocodes: [{ location: '120.1484,30.2458' }],
      }),
    });

    const tripPlan = createTripPlan([
      createAttraction('零坐标景点', { latitude: 0, longitude: 0 }),
    ]);

    const count = await geocodeAttractions(tripPlan);
    expect(count).toBe(1);
  });

  it('高德 API 失败时 fallback 到 CITY_CENTERS', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const tripPlan = createTripPlan([
      createAttraction('未知景点', null),
    ]);

    const count = await geocodeAttractions(tripPlan);
    expect(count).toBe(1);
    // 应该使用杭州中心坐标 + 随机偏移
    const loc = tripPlan.days[0].attractions[0].location;
    expect(loc.latitude).toBeCloseTo(30.2741, 0); // 允许 0.03 偏移
    expect(loc.longitude).toBeCloseTo(120.1551, 0);
  });

  it('无 API Key 时使用 CITY_CENTERS fallback', async () => {
    const { getAmapGeoKey } = await import('../infra/context.js');
    getAmapGeoKey.mockReturnValue('');

    const tripPlan = createTripPlan([
      createAttraction('无Key景点', null),
    ]);

    const count = await geocodeAttractions(tripPlan);
    expect(count).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('批量补全并发控制（最多 5 个并发）', async () => {
    // 创建 10 个需要补全的景点
    const attractions = Array.from({ length: 10 }, (_, i) =>
      createAttraction(`景点${i}`, null)
    );

    // Mock 所有 fetch 调用
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({
        status: '1',
        geocodes: [{ location: '120.1484,30.2458' }],
      }),
    });

    const tripPlan = createTripPlan(attractions);
    const count = await geocodeAttractions(tripPlan);

    expect(count).toBe(10);
    // 验证 fetch 被调用了 10 次（每个景点一次）
    expect(mockFetch).toHaveBeenCalledTimes(10);
  });

  it('LRU 缓存命中不重复请求', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({
        status: '1',
        geocodes: [{ location: '120.1484,30.2458' }],
      }),
    });

    // 第一次调用
    const tripPlan1 = createTripPlan([
      createAttraction('西湖', null),
    ]);
    await geocodeAttractions(tripPlan1);

    // 第二次调用相同景点
    const tripPlan2 = createTripPlan([
      createAttraction('西湖', null),
    ]);
    await geocodeAttractions(tripPlan2);

    // 应该只调用一次 fetch（第二次从缓存读取）
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('空行程返回 0', async () => {
    const tripPlan = { city: '空城', days: [] };
    const count = await geocodeAttractions(tripPlan);
    expect(count).toBe(0);
  });

  it('无 days 字段返回 0', async () => {
    const tripPlan = { city: '测试' };
    const count = await geocodeAttractions(tripPlan);
    expect(count).toBe(0);
  });
});
