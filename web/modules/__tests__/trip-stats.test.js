/**
 * trip-stats.js 单元测试
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { computeTripStats, renderTripStats, clearTripStats } from '../trip/trip-stats.js';

const sampleTrip = {
  city: '杭州',
  cities: [{ city: '杭州', days: 3 }],
  days: [
    { city: '杭州', attractions: [{ name: '西湖' }, { name: '断桥' }] },
    { city: '杭州', attractions: [{ name: '灵隐寺' }] },
    { city: '绍兴', attractions: [{ name: '鲁迅故里' }] },
  ],
  budget: { total: 3200 },
  weatherInfo: [{ date: '2026-06-15', city: '杭州', dayWeather: '多云', dayTemp: 28 }],
};

describe('computeTripStats', () => {
  it('extracts days, attractions, cities, budget and weather', () => {
    const stats = computeTripStats(sampleTrip);
    expect(stats).toEqual({
      days: 3,
      attractions: 4,
      cities: 2,
      budgetTotal: 3200,
      weather: '多云 28°',
    });
  });

  it('handles string cities and missing optional fields', () => {
    const stats = computeTripStats({
      city: '上海',
      cities: ['上海', '苏州'],
      days: [{ attractions: [] }],
    });
    expect(stats).toEqual({
      days: 1,
      attractions: 0,
      cities: 2,
      budgetTotal: null,
      weather: null,
    });
  });

  it('returns null for invalid input', () => {
    expect(computeTripStats(null)).toBeNull();
    expect(computeTripStats({})).toBeNull();
    expect(computeTripStats({ days: 'nope' })).toBeNull();
  });
});

describe('renderTripStats', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="trip-stats-bar" class="trip-stats-bar" hidden></div>';
  });

  it('fills the stats bar with chips and shows it', () => {
    renderTripStats(sampleTrip);
    const bar = document.getElementById('trip-stats-bar');
    expect(bar.hidden).toBe(false);
    expect(bar.querySelectorAll('.trip-stats-chip').length).toBeGreaterThanOrEqual(4);
    expect(bar.textContent).toContain('3');
    expect(bar.textContent).toContain('¥3,200');
    expect(bar.textContent).toContain('多云');
  });

  it('close button hides the bar', () => {
    renderTripStats(sampleTrip);
    const bar = document.getElementById('trip-stats-bar');
    bar.querySelector('.trip-stats-close').click();
    expect(bar.hidden).toBe(true);
  });

  it('is a no-op without the bar element', () => {
    document.body.innerHTML = '';
    expect(() => renderTripStats(sampleTrip)).not.toThrow();
  });

  it('clearTripStats hides the bar', () => {
    renderTripStats(sampleTrip);
    clearTripStats();
    expect(document.getElementById('trip-stats-bar').hidden).toBe(true);
  });
});
