import { Type } from '@earendil-works/pi-ai';
import { CITY_CENTERS } from '../context.js?v=4';

const MAX_FORECAST_DAYS = 16;
const WMO_CODES = {
  0: '晴',
  1: '大部晴',
  2: '多云',
  3: '阴',
  45: '雾',
  48: '冻雾',
  51: '小毛毛雨',
  53: '毛毛雨',
  55: '大毛毛雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  80: '阵雨',
  81: '中阵雨',
  82: '大阵雨',
  95: '雷暴',
  96: '雷暴伴小冰雹',
  99: '雷暴伴大冰雹',
};

function _isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function _todayInShanghai() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function _addUtcDays(date, days) {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function _finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function _windDirection(degrees) {
  const value = _finiteNumber(degrees);
  if (value === null) return '';
  const labels = ['北风', '东北风', '东风', '东南风', '南风', '西南风', '西风', '西北风'];
  return labels[Math.round((((value % 360) + 360) % 360) / 45) % labels.length];
}

function _windPower(speedKmh) {
  const speed = _finiteNumber(speedKmh);
  if (speed === null || speed < 0) return '';
  const thresholds = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];
  const force = thresholds.findIndex((threshold) => speed < threshold);
  return `${force === -1 ? 12 : force}级`;
}

function _weatherIcon(condition) {
  if (/雷暴|冰雹/.test(condition)) return '⛈️';
  if (/雪/.test(condition)) return '🌨️';
  if (/雨/.test(condition)) return '🌧️';
  if (/雾/.test(condition)) return '🌫️';
  if (condition === '晴') return '☀️';
  if (/云|阴/.test(condition)) return '⛅';
  return '🌤️';
}

function _formatWeatherLine(weather) {
  const parts = [`${weather.date}: ${_weatherIcon(weather.dayWeather)} ${weather.dayWeather}`];
  if (weather.nightTemp !== null && weather.dayTemp !== null) {
    parts.push(`${weather.nightTemp}°C ~ ${weather.dayTemp}°C`);
  }
  if (weather.precipitationProbability !== null && weather.precipitationProbability > 0) {
    parts.push(`降雨概率${weather.precipitationProbability}%`);
  }
  const wind = `${weather.windDirection} ${weather.windPower}`.trim();
  if (wind) parts.push(wind);
  return parts.join(' · ');
}

function _coverage(requestedStartDate, requestedDays, weatherInfo) {
  const dates = weatherInfo.map((weather) => weather.date).filter(_isIsoDate).sort();
  const expectedDates = Array.from({ length: requestedDays }, (_, index) =>
    _addUtcDays(requestedStartDate, index),
  );
  return {
    requestedStartDate,
    requestedDays,
    availableStartDate: dates[0] ?? null,
    availableEndDate: dates.at(-1) ?? null,
    complete: expectedDates.every((date) => dates.includes(date)),
  };
}

function _details(city, requestedStartDate, requestedDays, overrides = {}) {
  const weatherInfo = Array.isArray(overrides.weatherInfo) ? overrides.weatherInfo : [];
  return {
    city,
    weatherInfo,
    source: overrides.source ?? 'none',
    fetchedAt: overrides.fetchedAt ?? new Date().toISOString(),
    isSynthetic: false,
    coverage: _coverage(requestedStartDate, requestedDays, weatherInfo),
    ...(overrides.error ? { error: overrides.error } : {}),
  };
}

function _errorMessage(error) {
  return error instanceof Error ? error.message : String(error ?? '未知错误');
}

export const searchWeatherTool = {
  name: 'search_weather',
  label: '天气查询',
  description: '查询城市目标日期范围的真实天气预报',
  parameters: Type.Object({
    city: Type.String({ description: '城市名称' }),
    startDate: Type.Optional(Type.String({ description: '行程开始日期，YYYY-MM-DD；默认今天' })),
    days: Type.Optional(Type.Number({ description: '预报天数，1-16，默认7', default: 7 })),
  }),
  execute: async (_id, params = {}) => {
    const city = typeof params.city === 'string' ? params.city.trim() : '';
    const startDate = params.startDate ?? _todayInShanghai();
    const requestedDays = Number(params.days ?? 7);
    const safeDays = Number.isFinite(requestedDays)
      ? Math.min(MAX_FORECAST_DAYS, Math.trunc(requestedDays))
      : 0;

    if (!city || !_isIsoDate(startDate) || safeDays < 1) {
      const details = _details(city, _isIsoDate(startDate) ? startDate : _todayInShanghai(), Math.max(safeDays, 0), {
        error: { code: 'INVALID_REQUEST', message: '城市、日期或预报天数无效' },
      });
      return {
        content: [{ type: 'text', text: `## ${city || '未知城市'}天气\n\n> ⚠️ 请提供有效城市、日期和预报天数` }],
        details,
      };
    }

    const coords = CITY_CENTERS[city];
    if (!coords) {
      return {
        content: [{ type: 'text', text: `## ${city}天气\n\n> ⚠️ 未知城市坐标: ${city}` }],
        details: _details(city, startDate, safeDays, {
          error: { code: 'UNKNOWN_CITY', message: `未知城市坐标: ${city}` },
        }),
      };
    }

    const [latitude, longitude] = coords;
    const endDate = _addUtcDays(startDate, safeDays - 1);
    const query = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      daily:
        'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_direction_10m_dominant,wind_speed_10m_max',
      timezone: 'Asia/Shanghai',
      start_date: startDate,
      end_date: endDate,
    });

    try {
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const daily = data?.daily;
      if (!Array.isArray(daily?.time) || daily.time.length === 0) {
        return {
          content: [{ type: 'text', text: `## ${city}天气\n\n> 未获取到目标日期的天气数据，请在临行前复查` }],
          details: _details(city, startDate, safeDays, {
            source: 'open-meteo',
            error: { code: 'NO_DATA', message: '供应商未返回目标日期数据' },
          }),
        };
      }

      const fetchedAt = new Date().toISOString();
      const requestedDates = new Set(
        Array.from({ length: safeDays }, (_, index) => _addUtcDays(startDate, index)),
      );
      const weatherInfo = daily.time.flatMap((date, index) => {
        if (!_isIsoDate(date) || !requestedDates.has(date)) return [];
        const weatherCode = _finiteNumber(daily.weather_code?.[index]);
        const dayTemp = _finiteNumber(daily.temperature_2m_max?.[index]);
        const nightTemp = _finiteNumber(daily.temperature_2m_min?.[index]);
        const precipitation = _finiteNumber(daily.precipitation_probability_max?.[index]);
        const condition = WMO_CODES[weatherCode] ?? (weatherCode === null ? '' : `天气代码${weatherCode}`);
        return [
          {
            date,
            city,
            dayWeather: condition,
            nightWeather: condition,
            dayTemp: dayTemp === null ? null : Math.round(dayTemp),
            nightTemp: nightTemp === null ? null : Math.round(nightTemp),
            precipitationProbability:
              precipitation === null ? null : Math.min(100, Math.max(0, Math.round(precipitation))),
            windDirection: _windDirection(daily.wind_direction_10m_dominant?.[index]),
            windPower: _windPower(daily.wind_speed_10m_max?.[index]),
            source: 'open-meteo',
            fetchedAt,
            isSynthetic: false,
          },
        ];
      });
      const lines = weatherInfo.map(_formatWeatherLine);
      const details = _details(city, startDate, safeDays, {
        weatherInfo,
        source: 'open-meteo',
        fetchedAt,
      });
      const coverageNote = details.coverage.complete
        ? ''
        : '\n\n> ⚠️ 预报未完整覆盖行程日期，请在临行前复查。';
      return {
        content: [
          {
            type: 'text',
            text: `## ${city} ${safeDays}天天气预报（真实数据）\n\n数据源: Open-Meteo\n\n${lines.join('\n')}${coverageNote}`,
          },
        ],
        details,
      };
    } catch (error) {
      const message = _errorMessage(error);
      return {
        content: [{ type: 'text', text: `## ${city}天气\n\n> ⚠️ 获取失败: ${message}` }],
        details: _details(city, startDate, safeDays, {
          source: 'open-meteo',
          error: { code: message.startsWith('HTTP ') ? 'HTTP_ERROR' : 'FETCH_ERROR', message },
        }),
      };
    }
  },
};
