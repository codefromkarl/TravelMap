/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest';
import { getCurrentTripPlan, getCurrentTripMarkdown, setCurrentTripPlan } from '../trip/trip-state.js';
import { latestValidTripPlan } from '../trip/trip-results.js';
import { normalizeEditedTrip } from '../trip/trip-edit-normalize.js';

function plan(name, cost = 50) {
  return { city: '杭州', startDate: '2026-06-01', endDate: '2026-06-01', days: [{ date: '2026-06-01', city: '杭州', attractions: [{ name, ticketPrice: cost }] }], weatherInfo: [], budget: { totalAttractions: cost, total: cost } };
}

beforeEach(() => {
  window._lastTripPlan = null;
  document.body.innerHTML = '<div id="trip-stats-bar" hidden></div>';
});

describe('active itinerary data', () => {
  it('serializes the current plan and reflects legacy guest/history replacements', () => {
    setCurrentTripPlan(plan('西湖'));
    expect(getCurrentTripMarkdown()).toContain('西湖');
    window._lastTripPlan = plan('灵隐寺');
    expect(getCurrentTripPlan().days[0].attractions[0].name).toBe('灵隐寺');
    expect(getCurrentTripMarkdown()).toContain('灵隐寺');
    expect(getCurrentTripMarkdown()).not.toContain('西湖');
    setCurrentTripPlan(null);
    expect(getCurrentTripMarkdown()).toBeNull();
    expect(document.getElementById('trip-stats-bar').hidden).toBe(true);
  });

  it('unknown prices remain unknown instead of free', () => {
    setCurrentTripPlan(plan('待核实景点', null));
    expect(getCurrentTripMarkdown()).toContain('待核实');
    expect(getCurrentTripMarkdown()).not.toContain('¥0');
  });

  it('retains route, reservation, source and safe travel links without unsafe URLs', () => {
    const current = plan('西湖');
    Object.assign(current.days[0].attractions[0], {
      reservationRequired: true, bookingUrl: 'https://example.com/book',
      source: 'amap', coordinateSystem: 'gcj02', fetchedAt: '2026-06-01T00:00:00Z',
      location: { latitude: 30, longitude: 120 },
      routes: [{ id: 'west', name: '西线路线', waypoints: [{ name: '途经点', supplyPoints: [{ name: '饮水站', description: '免费饮水', estimatedCost: 0 }] }] }],
      actionLinks: [{ label: '攻击', url: 'javascript:alert(1)' }],
    });
    setCurrentTripPlan(current);
    const markdown = getCurrentTripMarkdown();
    expect(markdown).toContain('西线路线');
    expect(markdown).toContain('途经点');
    expect(markdown).toContain('饮水站');
    expect(markdown).toContain('https://example.com/book');
    expect(markdown).toContain('amap');
    expect(markdown).toContain('gcj02');
    expect(markdown).not.toContain('javascript:');
  });

  it('ignores malformed optional collections and null entries before publishing/exporting', () => {
    const current = plan('西湖');
    Object.assign(current.days[0].attractions[0], {
      routes: {}, actionLinks: {}, reservationTimeline: { altChannels: {} },
    });
    current.days[0].hotel = { name: '酒店', comparisonLinks: {} };
    current.days[0].meals = {};
    current.flightLinks = {};
    current.actionLinks = {};
    expect(() => setCurrentTripPlan(current)).not.toThrow();
    expect(getCurrentTripMarkdown()).toContain('西湖');
    current.days[0].attractions[0].routes = [null, { name: '有效路线', waypoints: [null, { name: '有效途经点', supplyPoints: {} }], supplyStrategy: { warnings: {} }, riskFactors: {} }];
    current.days[0].attractions[0].actionLinks = [null, { label: '有效链接', url: 'https://example.com/' }];
    current.weatherInfo = [null, { city: '杭州', date: '2026-06-01', dayWeather: '晴' }];
    expect(() => setCurrentTripPlan(current)).not.toThrow();
    expect(getCurrentTripMarkdown()).toContain('有效路线');
    expect(getCurrentTripMarkdown()).toContain('有效途经点');
    expect(getCurrentTripMarkdown()).toContain('https://example.com/');
  });

  it('preserves a guest disclaimer in serialized output', () => {
    setCurrentTripPlan({ ...plan('西湖'), demoNotice: '演示数据，并非实时旅行建议' });
    expect(getCurrentTripMarkdown()).toContain('演示数据，并非实时旅行建议');
  });
});

describe('latest valid result in one generation', () => {
  it('selects the newest valid result and skips later errors or malformed plans', () => {
    const first = plan('西湖');
    const latest = plan('灵隐寺');
    expect(latestValidTripPlan([
      { role: 'toolResult', details: { tripPlan: first } },
      { role: 'toolResult', details: { tripPlan: latest } },
      { role: 'toolResult', isError: true, details: { tripPlan: plan('失败') } },
      { role: 'toolResult', details: { tripPlan: { city: '杭州', days: [] } } },
    ])).toBe(latest);
  });

  it('returns no candidate for a no-plan turn rather than historical state', () => {
    setCurrentTripPlan(plan('西湖'));
    expect(latestValidTripPlan([{ role: 'assistant', content: '暂时无法生成' }])).toBeNull();
    expect(getCurrentTripMarkdown()).toContain('西湖');
  });
});

describe('edited schedule normalization', () => {
  it('compacts dates and drops weather mismatching the remaining city/date', () => {
    const original = plan('西湖');
    original.days.push({ date: '2026-06-02', city: '苏州', attractions: [{ name: '拙政园', ticketPrice: 100 }] });
    const edited = structuredClone(original);
    edited.days.shift();
    edited.weatherInfo = [{ date: '2026-06-02', city: '苏州' }, { date: '2026-06-01', city: '杭州' }];
    normalizeEditedTrip(edited, original);
    expect(edited.days[0].date).toBe('2026-06-01');
    expect(edited.days[0].dayIndex).toBe(1);
    expect(edited.endDate).toBe('2026-06-01');
    expect(edited.weatherInfo).toEqual([]);
    expect(edited.cities).toEqual(['苏州']);
  });

  it('marks affected unknown budget categories and total unknown', () => {
    const original = plan('西湖', null);
    original.budget = { totalAttractions: 300, total: 300 };
    original.days[0].attractions.push({ name: '灵隐寺', ticketPrice: 50 });
    const edited = structuredClone(original);
    edited.days[0].attractions.shift();
    normalizeEditedTrip(edited, original);
    expect(edited.budget.totalAttractions).toBeNull();
    expect(edited.budget.total).toBeNull();
  });
});
