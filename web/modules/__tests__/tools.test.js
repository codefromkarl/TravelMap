import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock pi-ai Type system
vi.mock('@earendil-works/pi-ai', () => ({
  Type: {
    Object: (props) => ({ type: 'object', properties: props }),
    String: (opts = {}) => ({ type: 'string', ...opts }),
    Number: (opts = {}) => ({ type: 'number', ...opts }),
    Boolean: (opts = {}) => ({ type: 'boolean', ...opts }),
    Array: (items) => ({ type: 'array', items }),
    Optional: (schema) => ({ ...schema, optional: true }),
  },
}));

// Mock context.js
vi.mock('../context.js', () => ({
  currentTravelers: null,
  CITY_CENTERS: { '西安': [34.3416, 108.9398], '北京': [39.9042, 116.4074], '上海': [31.2304, 121.4737] },
}));

// Mock window/document for action-links tool
globalThis.window = { _lastTripPlan: null, currentPage: 'page-chat' };
globalThis.document = { getElementById: vi.fn().mockReturnValue(null) };

const tools = await import('../tools/index.js');

describe('Tool index exports', () => {
  it('ALL_TOOLS is an array', () => {
    expect(Array.isArray(tools.ALL_TOOLS)).toBe(true);
  });

  it('ALL_TOOLS has 8 tools', () => {
    expect(tools.ALL_TOOLS).toHaveLength(8);
  });

  it('each tool has required fields', () => {
    for (const tool of tools.ALL_TOOLS) {
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('parameters');
      expect(tool).toHaveProperty('execute');
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(typeof tool.execute).toBe('function');
    }
  });
});

describe('search_attractions tool', () => {
  it('has correct name', () => {
    expect(tools.searchAttractionsTool.name).toBe('search_attractions');
  });

  it('parameters has city property', () => {
    expect(tools.searchAttractionsTool.parameters.properties).toHaveProperty('city');
  });

  it('execute returns structured result', async () => {
    const result = await tools.searchAttractionsTool.execute('id', { city: '北京' });
    expect(result).toHaveProperty('content');
    expect(result).toHaveProperty('details');
    expect(result.content[0].type).toBe('text');
    expect(result.details.attractions.length).toBeGreaterThan(0);
  });

  it('execute handles unknown city with fallback', async () => {
    const result = await tools.searchAttractionsTool.execute('id', { city: '未知城市' });
    expect(result.details.attractions.length).toBeGreaterThan(0);
  });
});

describe('search_weather tool', () => {
  it('has correct name', () => {
    expect(tools.searchWeatherTool.name).toBe('search_weather');
  });

  it('parameters has city and days', () => {
    const props = tools.searchWeatherTool.parameters.properties;
    expect(props).toHaveProperty('city');
    expect(props).toHaveProperty('days');
  });

  it('execute returns weather data', async () => {
    const result = await tools.searchWeatherTool.execute('id', { city: '北京', days: 3 });
    expect(result.content[0].text).toContain('北京');
    expect(result.content[0].text).toContain('天气预报');
    expect(result.details.weather.length).toBe(3);
  });

  it('execute uses default 7 days', async () => {
    const result = await tools.searchWeatherTool.execute('id', { city: '上海' });
    expect(result.details.weather.length).toBe(7);
  });
});

describe('search_hotels tool', () => {
  it('has correct name', () => {
    expect(tools.searchHotelsTool.name).toBe('search_hotels');
  });

  it('execute returns hotel recommendations', async () => {
    const result = await tools.searchHotelsTool.execute('id', { city: '杭州' });
    expect(result.content[0].text).toContain('杭州');
    expect(result.content[0].text).toContain('酒店');
  });
});

describe('calculate_budget tool', () => {
  it('has correct name', () => {
    expect(tools.calculateBudgetTool.name).toBe('calculate_budget');
  });

  it('parameters has cost fields', () => {
    const props = tools.calculateBudgetTool.parameters.properties;
    expect(props).toHaveProperty('totalAttractions');
    expect(props).toHaveProperty('totalHotels');
    expect(props).toHaveProperty('totalMeals');
    expect(props).toHaveProperty('totalTransportation');
    expect(props).toHaveProperty('budgetLimit');
  });

  it('execute calculates total correctly', async () => {
    const result = await tools.calculateBudgetTool.execute('id', {
      totalAttractions: 100,
      totalHotels: 500,
      totalMeals: 200,
      totalTransportation: 150,
    });
    expect(result.details.total).toBe(950);
    expect(result.content[0].text).toContain('950');
  });

  it('execute warns when over budget', async () => {
    const result = await tools.calculateBudgetTool.execute('id', {
      totalAttractions: 100,
      totalHotels: 500,
      totalMeals: 200,
      totalTransportation: 150,
      budgetLimit: 800,
    });
    expect(result.content[0].text).toContain('超出预算');
  });

  it('execute shows remaining when under budget', async () => {
    const result = await tools.calculateBudgetTool.execute('id', {
      totalAttractions: 100,
      totalHotels: 200,
      totalMeals: 100,
      totalTransportation: 50,
      budgetLimit: 1000,
    });
    expect(result.content[0].text).toContain('在预算');
    expect(result.content[0].text).toContain('550');
  });
});

describe('generate_action_links tool', () => {
  it('has correct name', () => {
    expect(tools.generateActionLinksTool.name).toBe('generate_action_links');
  });

  it('execute generates links for trip plan', async () => {
    const result = await tools.generateActionLinksTool.execute('id', {
      tripPlan: {
        city: '北京',
        cities: ['北京', '上海'],
        startDate: '2025-01-01',
        endDate: '2025-01-03',
        days: [
          {
            date: '2025-01-01',
            dayIndex: 1,
            city: '北京',
            attractions: [{ name: '故宫', nameZh: '故宫', reservationRequired: true }],
            hotel: { name: '北京饭店' },
          },
        ],
      },
    });
    expect(result.content[0].text).toContain('行动链接');
    expect(result.details.linkCount).toBeGreaterThan(0);
  });
});

describe('query_trip_data tool', () => {
  it('has correct name', () => {
    expect(tools.companionQATool.name).toBe('query_trip_data');
  });

  it('execute answers attraction questions', async () => {
    const result = await tools.companionQATool.execute('id', {
      question: '故宫门票多少钱',
      tripPlan: {
        city: '北京',
        cities: ['北京'],
        startDate: '2025-01-01',
        endDate: '2025-01-03',
        days: [{
          date: '2025-01-01', dayIndex: 1, city: '北京', transportation: '地铁',
          attractions: [{ name: '故宫', nameZh: '故宫', nameEn: 'Forbidden City', address: '东城区', visitDuration: 180, description: '皇家宫殿', category: '历史', ticketPrice: 60, reservationRequired: true }],
        }],
        weatherInfo: [],
        budget: null,
      },
    });
    expect(result.content[0].text).toContain('故宫');
  });

  it('execute answers budget questions', async () => {
    const result = await tools.companionQATool.execute('id', {
      question: '预算多少',
      tripPlan: {
        city: '北京', cities: ['北京'], startDate: '2025-01-01', endDate: '2025-01-03',
        days: [],
        weatherInfo: [],
        budget: { totalAttractions: 100, totalHotels: 500, totalMeals: 200, totalTransportation: 100, totalInterCityTransport: 0, total: 900 },
      },
    });
    expect(result.content[0].text).toContain('900');
  });
});

describe('plan_multi_city tool', () => {
  it('has correct name', () => {
    expect(tools.planMultiCityTool.name).toBe('plan_multi_city');
  });

  it('execute returns error for empty cities', async () => {
    const result = await tools.planMultiCityTool.execute('id', { cities: [], startDate: '2025-01-01' });
    expect(result.content[0].text).toContain('至少');
  });

  it('execute generates multi-city plan', async () => {
    const result = await tools.planMultiCityTool.execute('id', {
      cities: [{ city: '北京', days: 2 }, { city: '上海', days: 3 }],
      startDate: '2025-01-01',
    });
    expect(result.content[0].text).toContain('多城市');
    expect(result.content[0].text).toContain('城际');
    expect(result.details.totalDays).toBeGreaterThan(5);
  });
});

describe('enrich_supply_details tool', () => {
  it('has correct name', () => {
    expect(tools.enrichSupplyDetailsTool.name).toBe('enrich_supply_details');
  });

  it('execute processes trip plan', async () => {
    const result = await tools.enrichSupplyDetailsTool.execute('id', {
      tripPlan: {
        city: '杭州',
        days: [{
          date: '2025-01-01',
          city: '杭州',
          attractions: [{
            name: 'West Lake', nameZh: '西湖',
            location: { latitude: 30.25, longitude: 120.15 },
            routes: [{
              id: 'r1', name: 'Route A',
              waypoints: [{
                name: 'Break Area',
                location: { latitude: 30.25, longitude: 120.15 },
                supplyPoints: [
                  { name: 'Restaurant A', type: 'restaurant', description: 'Noodles', estimatedCost: 50, isRecommended: true },
                ],
              }],
            }],
          }],
        }],
      },
    });
    expect(result.content[0].text).toContain('补给详情');
    expect(result.details.totalSupplyPoints).toBe(1);
  });
});

// ─── 骨架数据场景测试（坐标缺失）─────────────────────────

describe('骨架数据防护：坐标缺失检测', () => {
  const skeletonTripPlan = {
    city: '西安',
    cities: ['西安'],
    startDate: '2025-06-01',
    endDate: '2025-06-03',
    days: [
      {
        date: '2025-06-01', dayIndex: 1, city: '西安',
        attractions: [
          { name: '西安城墙', nameZh: '西安城墙' },  // 无 location
          { name: '钟楼', nameZh: '钟楼', location: { latitude: 0, longitude: 0 } },  // 坐标为 0
        ],
      },
      {
        date: '2025-06-02', dayIndex: 2, city: '西安',
        attractions: [
          { name: '秦始皇兵马俑博物馆', nameZh: '秦始皇兵马俑博物馆' },  // 无 location
        ],
      },
    ],
  };

  it('generate_action_links 应检测到坐标缺失并注入警告', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await tools.generateActionLinksTool.execute('id', { tripPlan: skeletonTripPlan });
    expect(result.content[0].text).toContain('缺少坐标');
    expect(result.content[0].text).toContain('3');  // 3 个景点缺坐标
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][0]).toContain('坐标缺失');
    warnSpy.mockRestore();
  });

  it('generate_action_links 仍应正常生成链接（不因缺坐标而崩溃）', async () => {
    const result = await tools.generateActionLinksTool.execute('id', { tripPlan: skeletonTripPlan });
    expect(result.content[0].text).toContain('行动链接');
    expect(result.details.linkCount).toBeGreaterThan(0);
    expect(result.details.tripPlan).toBe(skeletonTripPlan);
  });

  it('enrich_supply_details 应检测到坐标缺失', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await tools.enrichSupplyDetailsTool.execute('id', { tripPlan: skeletonTripPlan });
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls.some(c => String(c[0]).includes('坐标缺失'))).toBe(true);
    warnSpy.mockRestore();
  });

  it('query_trip_data 应检测到坐标缺失', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await tools.companionQATool.execute('id', {
      question: '西安城墙门票多少钱',
      tripPlan: skeletonTripPlan,
    });
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls.some(c => String(c[0]).includes('坐标缺失'))).toBe(true);
    warnSpy.mockRestore();
  });

  it('完整坐标的 tripPlan 不应触发警告', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const completeTripPlan = {
      ...skeletonTripPlan,
      days: skeletonTripPlan.days.map(d => ({
        ...d,
        attractions: d.attractions.map(a => ({
          ...a,
          location: { latitude: 34.26, longitude: 108.94 },
        })),
      })),
    };
    await tools.generateActionLinksTool.execute('id', { tripPlan: completeTripPlan });
    const coordWarnings = warnSpy.mock.calls.filter(c => String(c[0]).includes('坐标缺失'));
    expect(coordWarnings.length).toBe(0);
    warnSpy.mockRestore();
  });
});

// ─── TripPlan 结构校验测试 ───────────────────────────────

describe('TripPlan 结构校验 (validateTripPlanSchema)', () => {
  // 动态导入校验函数
  let validateTripPlanSchema;

  beforeAll(async () => {
    const mod = await import('../tools/validate-trip.js');
    validateTripPlanSchema = mod.validateTripPlanSchema;
  });

  it('合法 tripPlan 应通过校验', () => {
    const result = validateTripPlanSchema({
      city: '北京',
      days: [{ date: '2025-06-01', attractions: [{ name: '故宫' }] }],
    });
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('null tripPlan 应校验失败', () => {
    const result = validateTripPlanSchema(null);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('为空');
  });

  it('缺少 city 应校验失败', () => {
    const result = validateTripPlanSchema({ days: [] });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('city');
  });

  it('缺少 days 数组应校验失败', () => {
    const result = validateTripPlanSchema({ city: '北京' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('days');
  });

  it('景点缺少 name 应校验失败', () => {
    const result = validateTripPlanSchema({
      city: '北京',
      days: [{ date: '2025-06-01', attractions: [{ visitDuration: 120 }] }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('name');
  });

  it('空 attractions 数组应通过校验', () => {
    const result = validateTripPlanSchema({
      city: '北京',
      days: [{ date: '2025-06-01', attractions: [] }],
    });
    expect(result.valid).toBe(true);
  });
});
