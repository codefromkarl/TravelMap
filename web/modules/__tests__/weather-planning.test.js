import { describe, expect, it } from 'vitest';
import {
  buildWindyRadarUrl,
  classifyWeatherRisk,
  matchWeatherToDay,
  shouldShowRadar,
} from '../weather-planning.js';

describe('matchWeatherToDay', () => {
  const weatherInfo = [
    { date: '2026-08-13', city: '杭州', dayWeather: '晴' },
    { date: '2026-08-14', city: '杭州', dayWeather: '小雨' },
    { date: '2026-08-14', city: '苏州', dayWeather: '多云' },
  ];

  it('matches exact date and city', () => {
    expect(matchWeatherToDay({ date: '2026-08-14', city: '杭州' }, { city: '杭州' }, weatherInfo)?.dayWeather).toBe('小雨');
  });

  it('uses the main city when the day omits city', () => {
    expect(matchWeatherToDay({ date: '2026-08-13' }, { city: '杭州' }, weatherInfo)).toBe(weatherInfo[0]);
  });

  it('rejects another city forecast in a multi-city trip', () => {
    const trip = { city: '杭州', cities: ['杭州', '苏州'], days: [{ city: '杭州' }, { city: '苏州' }] };
    expect(matchWeatherToDay({ date: '2026-08-15', city: '杭州' }, trip, [{ date: '2026-08-15', city: '苏州' }])).toBeNull();
  });

  it('rejects an explicit city mismatch even when restored trip metadata is incomplete', () => {
    expect(
      matchWeatherToDay(
        { date: '2026-08-15', city: '杭州' },
        { city: '杭州' },
        [{ date: '2026-08-15', city: '苏州', dayWeather: '小雨' }],
      ),
    ).toBeNull();
  });

  it('allows an unambiguous date fallback for a single-city trip', () => {
    const weather = { date: '2026-08-15', dayWeather: '阴' };
    expect(matchWeatherToDay({ date: '2026-08-15' }, { city: '杭州' }, [weather])).toBe(weather);
  });

  it('derives date from startDate and dayIndex', () => {
    expect(matchWeatherToDay({ dayIndex: 2, city: '杭州' }, { city: '杭州', startDate: '2026-08-13' }, weatherInfo)?.date).toBe('2026-08-14');
  });
});

describe('classifyWeatherRisk', () => {
  it.each(['雷暴', '冰雹', '大雨', '大雪'])('classifies %s as high risk', (dayWeather) => {
    expect(classifyWeatherRisk({ dayWeather }).level).toBe('high');
  });

  it('uses precipitation boundaries', () => {
    expect(classifyWeatherRisk({ dayWeather: '多云', precipitationProbability: 70 }).level).toBe('high');
    expect(classifyWeatherRisk({ dayWeather: '多云', precipitationProbability: 40 }).level).toBe('medium');
    expect(classifyWeatherRisk({ dayWeather: '多云', precipitationProbability: 39 }).level).toBe('low');
  });

  it('parses wind force ranges conservatively', () => {
    expect(classifyWeatherRisk({ dayWeather: '晴', windPower: '4-5级' }).level).toBe('medium');
    expect(classifyWeatherRisk({ dayWeather: '晴', windPower: '6级' }).level).toBe('high');
  });

  it('uses temperature boundaries', () => {
    expect(classifyWeatherRisk({ dayTemp: 35, nightTemp: 20 }).level).toBe('high');
    expect(classifyWeatherRisk({ dayTemp: 32, nightTemp: 20 }).level).toBe('medium');
    expect(classifyWeatherRisk({ dayTemp: 20, nightTemp: 0 }).level).toBe('high');
    expect(classifyWeatherRisk({ dayTemp: 20, nightTemp: 5 }).level).toBe('medium');
  });

  it('treats missing and synthetic data as unknown', () => {
    expect(classifyWeatherRisk(null).level).toBe('unknown');
    expect(classifyWeatherRisk({ date: '2026-08-13' }).level).toBe('unknown');
    expect(classifyWeatherRisk({ dayTemp: 24, nightTemp: 18, precipitationProbability: 10 }).level).toBe('unknown');
    expect(classifyWeatherRisk({ dayWeather: '天气代码999', dayTemp: 24, nightTemp: 18 }).level).toBe('unknown');
    expect(classifyWeatherRisk({ dayWeather: '晴', isSynthetic: true }).level).toBe('unknown');
  });

  it('returns stable reason and actionable advice keys', () => {
    const impact = classifyWeatherRisk({ dayWeather: '雷暴', precipitationProbability: 80 });
    expect(impact.reasons).toContain('weatherReasonThunderstorm');
    expect(impact.advice).toContain('weatherAdvicePreferIndoor');
    expect(impact.needsIndoorFallback).toBe(true);
  });
});

describe('shouldShowRadar', () => {
  it('shows short-term rain radar today and tomorrow', () => {
    const today = { date: '2026-08-13', dayWeather: '小雨' };
    const tomorrow = { ...today, date: '2026-08-14' };
    expect(shouldShowRadar(today, classifyWeatherRisk(today), '2026-08-13')).toBe(true);
    expect(shouldShowRadar(tomorrow, classifyWeatherRisk(tomorrow), '2026-08-13')).toBe(true);
  });

  it('keeps high precipitation actionable beyond tomorrow', () => {
    const weather = { date: '2026-08-20', dayWeather: '大雨', precipitationProbability: 80 };
    expect(shouldShowRadar(weather, classifyWeatherRisk(weather), '2026-08-13')).toBe(true);
  });

  it('hides radar for clear or synthetic weather', () => {
    const clear = { date: '2026-08-13', dayWeather: '晴' };
    expect(shouldShowRadar(clear, classifyWeatherRisk(clear), '2026-08-13')).toBe(false);
    expect(shouldShowRadar({ ...clear, dayWeather: '小雨', isSynthetic: true }, null, '2026-08-13')).toBe(false);
  });
});

describe('buildWindyRadarUrl', () => {
  it('converts domestic GCJ-02 coordinates and uses stable precision', () => {
    expect(buildWindyRadarUrl({ latitude: 30.2741, longitude: 120.1551 }, 11)).toBe(
      'https://www.windy.com/30.27643/120.15041?radar,30.27643,120.15041,11',
    );
  });

  it('keeps coordinates outside China unchanged and bounds zoom', () => {
    expect(buildWindyRadarUrl([35.6762, 139.6503], 99)).toBe(
      'https://www.windy.com/35.67620/139.65030?radar,35.67620,139.65030,18',
    );
  });

  it('rejects missing, out-of-range, and zero coordinates', () => {
    expect(buildWindyRadarUrl(null)).toBeNull();
    expect(buildWindyRadarUrl({ latitude: 91, longitude: 120 })).toBeNull();
    expect(buildWindyRadarUrl([0, 0])).toBeNull();
  });
});
