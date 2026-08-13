const HIGH_CONDITION_RULES = [
  { pattern: /雷暴|雷阵雨|thunder(?:storm)?|lightning/i, reason: 'weatherReasonThunderstorm' },
  { pattern: /冰雹|hail/i, reason: 'weatherReasonThunderstorm' },
  { pattern: /暴雨|大雨|大阵雨|heavy rain|torrential rain|rainstorm/i, reason: 'weatherReasonHeavyPrecipitation' },
  { pattern: /暴雪|大雪|heavy snow|blizzard/i, reason: 'weatherReasonHeavyPrecipitation' },
];

const MEDIUM_CONDITION_RULES = [
  { pattern: /雨|阵雨|毛毛雨|rain|shower|drizzle/i, reason: 'weatherReasonPrecipitation' },
  { pattern: /雪|snow|sleet/i, reason: 'weatherReasonPrecipitation' },
  { pattern: /雾|霾|fog|mist|haze/i, reason: 'weatherReasonFog' },
];

const RADAR_CONDITION_PATTERN = /雨|阵雨|毛毛雨|雷暴|冰雹|rain|shower|drizzle|thunder|hail/i;
const HIGH_RADAR_REASONS = new Set([
  'weatherReasonThunderstorm',
  'weatherReasonHeavyPrecipitation',
  'weatherReasonPrecipitationProbability',
]);

const _PI = 3.14159265358979324;
const _A = 6378245.0;
const _EE = 0.00669342162296594323;

function _normalizeCity(city) {
  return typeof city === 'string' ? city.trim().toLocaleLowerCase() : '';
}

function _isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function _addUtcDays(date, days) {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function _resolveDayDate(day, tripPlan) {
  if (_isIsoDate(day?.date)) return day.date;
  if (!_isIsoDate(tripPlan?.startDate)) return null;
  const dayIndex = Number(day?.dayIndex ?? day?.day);
  if (!Number.isInteger(dayIndex) || dayIndex < 1) return null;
  return _addUtcDays(tripPlan.startDate, dayIndex - 1);
}

function _finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function _precipitationProbability(weather) {
  const value = _finiteNumber(
    weather?.precipitationProbability ??
      weather?.precipitation_probability ??
      weather?.precipitationProbabilityMax,
  );
  if (value === null || value < 0 || value > 100) return null;
  return value;
}

function _windForce(weather) {
  const direct = _finiteNumber(weather?.windForce);
  if (direct !== null && direct >= 0) return direct;

  const value = weather?.windPower;
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== 'string') return null;
  const matches = value.match(/\d+(?:\.\d+)?/g);
  if (!matches?.length) return null;
  return Math.max(...matches.map(Number).filter(Number.isFinite));
}

function _conditionText(weather) {
  return [weather?.dayWeather, weather?.nightWeather, weather?.condition]
    .filter((value) => typeof value === 'string' && value.trim())
    .join(' ');
}

function _pushUnique(values, value) {
  if (!values.includes(value)) values.push(value);
}

function _impactAdvice(reasons, level) {
  const advice = [];
  const hasReason = (...keys) => keys.some((key) => reasons.includes(key));

  if (
    hasReason(
      'weatherReasonThunderstorm',
      'weatherReasonHeavyPrecipitation',
      'weatherReasonPrecipitationProbability',
    )
  ) {
    _pushUnique(advice, 'weatherAdvicePreferIndoor');
  }
  if (hasReason('weatherReasonPrecipitation', 'weatherReasonPrecipitationProbability')) {
    _pushUnique(advice, 'weatherAdviceAdjustOutdoorTiming');
    _pushUnique(advice, 'weatherAdvicePrepareRainGear');
  }
  if (hasReason('weatherReasonHeavyPrecipitation', 'weatherReasonCold')) {
    _pushUnique(advice, 'weatherAdvicePrepareWarmLayers');
  }
  if (hasReason('weatherReasonThunderstorm', 'weatherReasonStrongWind')) {
    _pushUnique(advice, 'weatherAdviceAvoidExposedActivities');
  } else if (hasReason('weatherReasonStrongWind')) {
    _pushUnique(advice, 'weatherAdviceAdjustOutdoorTiming');
  }
  if (hasReason('weatherReasonWarm', 'weatherReasonExtremeHeat')) {
    _pushUnique(advice, 'weatherAdvicePrepareSunProtection');
  }
  if (hasReason('weatherReasonFog')) {
    _pushUnique(advice, 'weatherAdviceAdjustOutdoorTiming');
  }
  if (level === 'high' && advice.length === 0) {
    advice.push('weatherAdvicePreferIndoor');
  }
  return advice;
}

/**
 * Match a forecast to an itinerary day without leaking another city's weather.
 * Exact date and city wins. A date-only match is allowed only when unambiguous,
 * and never for an explicit city mismatch in a multi-city trip.
 *
 * @param {object} day
 * @param {object} tripPlan
 * @param {object[]} weatherInfo
 * @returns {object|null}
 */
export function matchWeatherToDay(day, tripPlan, weatherInfo) {
  if (!day || !Array.isArray(weatherInfo) || weatherInfo.length === 0) return null;
  const date = _resolveDayDate(day, tripPlan);
  if (!date) return null;

  const explicitDayCity = _normalizeCity(day.city);
  const targetCity = explicitDayCity || _normalizeCity(tripPlan?.city);
  const dateMatches = weatherInfo.filter((weather) => weather?.date === date);
  if (dateMatches.length === 0) return null;

  if (targetCity) {
    const exactMatch = dateMatches.find((weather) => _normalizeCity(weather?.city) === targetCity);
    if (exactMatch) return exactMatch;
  }

  if (dateMatches.length !== 1) return null;
  const onlyMatch = dateMatches[0];
  const weatherCity = _normalizeCity(onlyMatch?.city);
  // A unique date can only be used as a fallback when it does not contradict
  // the target city. This also protects partially restored multi-city trips
  // whose `cities`/`days` metadata is incomplete.
  if (targetCity && weatherCity && weatherCity !== targetCity) return null;
  return onlyMatch;
}

/**
 * Classify normalized weather facts using deterministic planning thresholds.
 * Returned reason and advice strings are stable i18n keys, not display copy.
 *
 * @param {object|null|undefined} weather
 * @returns {{level:'low'|'medium'|'high'|'unknown', reasons:string[], advice:string[], needsIndoorFallback:boolean, hasPrecipitationRisk:boolean}}
 */
export function classifyWeatherRisk(weather) {
  const unknown = {
    level: 'unknown',
    reasons: [],
    advice: ['weatherAdviceCheckBeforeDeparture'],
    needsIndoorFallback: false,
    hasPrecipitationRisk: false,
  };
  if (!weather || typeof weather !== 'object') return unknown;
  if (weather.isSynthetic === true || weather.trusted === false || weather.source === 'mock') return unknown;

  const condition = _conditionText(weather);
  const precipitation = _precipitationProbability(weather);
  const windForce = _windForce(weather);
  const maxTemp = _finiteNumber(weather.dayTemp ?? weather.maxTemp);
  const minTemp = _finiteNumber(weather.nightTemp ?? weather.minTemp);
  const hasKnownCondition = Boolean(condition) && !/天气代码\s*\d+|weather\s*code\s*\d+/i.test(condition);
  const hasUsableFact = hasKnownCondition || precipitation !== null || windForce !== null || maxTemp !== null || minTemp !== null;
  if (!hasUsableFact) return unknown;

  const highReasons = [];
  const mediumReasons = [];
  for (const rule of HIGH_CONDITION_RULES) {
    if (rule.pattern.test(condition)) _pushUnique(highReasons, rule.reason);
  }
  for (const rule of MEDIUM_CONDITION_RULES) {
    if (rule.pattern.test(condition)) _pushUnique(mediumReasons, rule.reason);
  }

  if (precipitation !== null && precipitation >= 70) {
    _pushUnique(highReasons, 'weatherReasonPrecipitationProbability');
  } else if (precipitation !== null && precipitation >= 40) {
    _pushUnique(mediumReasons, 'weatherReasonPrecipitationProbability');
  }
  if (windForce !== null && windForce >= 6) {
    _pushUnique(highReasons, 'weatherReasonStrongWind');
  } else if (windForce !== null && windForce >= 4) {
    _pushUnique(mediumReasons, 'weatherReasonStrongWind');
  }
  if (maxTemp !== null && maxTemp >= 35) {
    _pushUnique(highReasons, 'weatherReasonExtremeHeat');
  } else if (maxTemp !== null && maxTemp >= 32) {
    _pushUnique(mediumReasons, 'weatherReasonWarm');
  }
  if (minTemp !== null && minTemp <= 0) {
    _pushUnique(highReasons, 'weatherReasonExtremeCold');
  } else if (minTemp !== null && minTemp <= 5) {
    _pushUnique(mediumReasons, 'weatherReasonCold');
  }

  // Numeric thresholds can still establish medium/high risk without a usable
  // condition. They cannot establish low risk because precipitation/storm
  // hazards may be hidden by the missing or unknown condition field.
  const level = highReasons.length > 0
    ? 'high'
    : mediumReasons.length > 0
      ? 'medium'
      : hasKnownCondition
        ? 'low'
        : 'unknown';
  if (level === 'unknown') return unknown;
  const reasons = level === 'high' ? [...highReasons, ...mediumReasons] : mediumReasons;
  const hasPrecipitationRisk =
    RADAR_CONDITION_PATTERN.test(condition) ||
    /\u96ea|snow|sleet/i.test(condition) ||
    (precipitation !== null && precipitation >= 40);
  const needsIndoorFallback =
    level === 'high' ||
    reasons.some((reason) =>
      [
        'weatherReasonPrecipitation',
        'weatherReasonFog',
        'weatherReasonPrecipitationProbability',
      ].includes(reason),
    );

  return {
    level,
    reasons,
    advice: _impactAdvice(reasons, level),
    needsIndoorFallback,
    hasPrecipitationRisk,
  };
}

function _todayString(now) {
  if (typeof now === 'string' && _isIsoDate(now.slice(0, 10))) return now.slice(0, 10);
  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Show radar only for actionable rain/storm risk today or tomorrow. High-risk
 * precipitation stays actionable even outside that short window.
 *
 * @param {object|null|undefined} weather
 * @param {ReturnType<classifyWeatherRisk>|null|undefined} impact
 * @param {Date|string|number} [now]
 * @returns {boolean}
 */
export function shouldShowRadar(weather, impact, now = new Date()) {
  if (!weather || typeof weather !== 'object' || !_isIsoDate(weather.date)) return false;
  if (weather.isSynthetic === true || weather.trusted === false || weather.source === 'mock') return false;

  const precipitation = _precipitationProbability(weather);
  const hasRadarCondition = RADAR_CONDITION_PATTERN.test(_conditionText(weather));
  if (!hasRadarCondition && !(precipitation !== null && precipitation >= 40)) return false;

  const resolvedImpact = impact?.level ? impact : classifyWeatherRisk(weather);
  const highPrecipitation =
    resolvedImpact.level === 'high' &&
    Array.isArray(resolvedImpact.reasons) &&
    resolvedImpact.reasons.some((reason) => HIGH_RADAR_REASONS.has(reason));
  if (highPrecipitation) return true;

  const today = _todayString(now);
  if (!today) return false;
  return weather.date === today || weather.date === _addUtcDays(today, 1);
}

function _outOfChina(lat, lng) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function _transformLat(x, y) {
  let result = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  result += ((20 * Math.sin(6 * x * _PI) + 20 * Math.sin(2 * x * _PI)) * 2) / 3;
  result += ((20 * Math.sin(y * _PI) + 40 * Math.sin((y / 3) * _PI)) * 2) / 3;
  result += ((160 * Math.sin((y / 12) * _PI) + 320 * Math.sin((y * _PI) / 30)) * 2) / 3;
  return result;
}

function _transformLng(x, y) {
  let result = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  result += ((20 * Math.sin(6 * x * _PI) + 20 * Math.sin(2 * x * _PI)) * 2) / 3;
  result += ((20 * Math.sin(x * _PI) + 40 * Math.sin((x / 3) * _PI)) * 2) / 3;
  result += ((150 * Math.sin((x / 12) * _PI) + 300 * Math.sin((x / 30) * _PI)) * 2) / 3;
  return result;
}

function _gcj02ToWgs84(lat, lng) {
  if (_outOfChina(lat, lng)) return { lat, lng };
  let deltaLat = _transformLat(lng - 105, lat - 35);
  let deltaLng = _transformLng(lng - 105, lat - 35);
  const radLat = (lat / 180) * _PI;
  let magic = Math.sin(radLat);
  magic = 1 - _EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  deltaLat = (deltaLat * 180) / (((_A * (1 - _EE)) / (magic * sqrtMagic)) * _PI);
  deltaLng = (deltaLng * 180) / ((_A / sqrtMagic) * Math.cos(radLat) * _PI);
  return { lat: lat - deltaLat, lng: lng - deltaLng };
}

function _coordinatePair(coords) {
  if (Array.isArray(coords)) return { lat: _finiteNumber(coords[0]), lng: _finiteNumber(coords[1]) };
  if (!coords || typeof coords !== 'object') return { lat: null, lng: null };
  return {
    lat: _finiteNumber(coords.latitude ?? coords.lat),
    lng: _finiteNumber(coords.longitude ?? coords.lng ?? coords.lon),
  };
}

/**
 * Build a Windy radar deep link from project GCJ-02 coordinates. Coordinates
 * outside China are already global WGS-84 and remain unchanged.
 *
 * @param {{latitude?:number, longitude?:number, lat?:number, lng?:number, lon?:number}|[number, number]} coords
 * @param {number} [zoom]
 * @returns {string|null}
 */
export function buildWindyRadarUrl(coords, zoom = 11) {
  const { lat, lng } = _coordinatePair(coords);
  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180 || (lat === 0 && lng === 0)) return null;

  const wgs84 = _gcj02ToWgs84(lat, lng);
  const safeZoom = Math.min(18, Math.max(3, Math.round(_finiteNumber(zoom) ?? 11)));
  const latitude = wgs84.lat.toFixed(5);
  const longitude = wgs84.lng.toFixed(5);
  return `https://www.windy.com/${latitude}/${longitude}?radar,${latitude},${longitude},${safeZoom}`;
}
