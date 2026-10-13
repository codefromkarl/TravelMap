/**
 * TripPlan 校验工具 — 前端共享
 *
 * 提供 tripPlan 数据完整性校验，所有前端工具共用。
 * 检测坐标缺失、必填字段缺失等问题。
 */

/**
 * 为历史行程和旧工具结果补齐稳定的天气数组契约。
 * @param {object} tripPlan
 * @returns {object}
 */
export function normalizeTripPlanWeatherInfo(tripPlan) {
  if (tripPlan && typeof tripPlan === 'object' && !Array.isArray(tripPlan.weatherInfo)) {
    tripPlan.weatherInfo = [];
  }
  return tripPlan;
}

// ─── TripPlan 结构校验 ─────────────────────────────────────

/**
 * 校验 tripPlan 基本结构是否合法
 *
 * @param {object} tripPlan - 行程数据
 * @returns {{ valid: boolean, errors: string[] }} 校验结果
 */
export function validateTripPlanSchema(tripPlan) {
  const errors = [];

  if (!tripPlan || typeof tripPlan !== 'object' || Array.isArray(tripPlan)) {
    return { valid: false, errors: ['tripPlan 为空'] };
  }

  normalizeTripPlanWeatherInfo(tripPlan);

  if (typeof tripPlan.city !== 'string' || tripPlan.city.trim().length === 0) {
    errors.push('缺少 city 字段');
  }

  if (!Array.isArray(tripPlan.days)) {
    errors.push('缺少 days 数组');
    return { valid: false, errors };
  }

  if (tripPlan.days.length === 0) errors.push('days 数组为空');

  for (let i = 0; i < tripPlan.days.length; i++) {
    const day = tripPlan.days[i];
    if (!day || typeof day !== 'object' || Array.isArray(day)) {
      errors.push(`days[${i}] 为空`);
      continue;
    }

    if (!day.date) {
      errors.push(`days[${i}] 缺少 date`);
    } else {
      const date = typeof day.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day.date)
        ? new Date(`${day.date}T00:00:00Z`) : null;
      if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day.date) {
        errors.push(`days[${i}] date 无效`);
      } else if (i > 0 && day.date <= tripPlan.days[i - 1]?.date) {
        errors.push(`days[${i}] date 必须按时间递增`);
      }
    }

    if (!Array.isArray(day.attractions)) {
      errors.push(`days[${i}] 缺少 attractions 数组`);
      continue;
    }

    for (let j = 0; j < day.attractions.length; j++) {
      const attr = day.attractions[j];
      if (!attr || typeof attr !== 'object' || Array.isArray(attr)) {
        errors.push(`days[${i}].attractions[${j}] 为空`);
        continue;
      }

      if (![attr.name, attr.nameZh].some(name => typeof name === 'string' && name.trim())) {
        errors.push(`days[${i}].attractions[${j}] 缺少 name`);
      }
      const location = attr.location != null ? attr.location
        : (attr.lat != null || attr.lng != null ? { latitude: attr.lat, longitude: attr.lng } : null);
      if (location != null && (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)
        || Math.abs(location.latitude) > 90 || Math.abs(location.longitude) > 180)) {
        errors.push(`days[${i}].attractions[${j}] 坐标无效`);
      }
    }
  }

  if (tripPlan.budget != null) {
    if (typeof tripPlan.budget !== 'object' || Array.isArray(tripPlan.budget)) {
      errors.push('budget 无效');
    } else {
      for (const key of ['total', 'totalAttractions', 'totalHotels', 'totalMeals', 'totalTransportation', 'totalInterCityTransport']) {
        const value = tripPlan.budget[key];
        if (value != null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
          errors.push(`budget.${key} 无效`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── 坐标完整性校验 ─────────────────────────────────────────

/**
 * 校验结果
 * @typedef {Object} ValidationResult
 * @property {string[]} missingCoords - 缺少坐标的景点名称列表
 * @property {boolean} hasIssues - 是否存在问题
 * @property {string} summary - 人类可读的摘要文本
 */

/**
 * 校验 tripPlan 坐标完整性
 *
 * @param {object} tripPlan - 行程数据
 * @returns {ValidationResult} 校验结果
 */
export function validateTripPlan(tripPlan) {
  const missingCoords = [];

  if (!tripPlan || !Array.isArray(tripPlan.days)) {
    return { missingCoords: [], hasIssues: false, summary: '' };
  }

  for (const day of tripPlan.days) {
    for (const attr of (Array.isArray(day?.attractions) ? day.attractions : [])) {
      if (!attr) continue;
      const loc = attr.location;
      const needsGeocode =
        !loc ||
        !Number.isFinite(loc.latitude) ||
        !Number.isFinite(loc.longitude) ||
        (loc.latitude === 0 && loc.longitude === 0);

      if (needsGeocode) {
        missingCoords.push(attr.nameZh || attr.name || '未知景点');
      }
    }
  }

  const hasIssues = missingCoords.length > 0;
  let summary = '';

  if (hasIssues) {
    const preview = missingCoords.slice(0, 3).join('、');
    const suffix = missingCoords.length > 3 ? '...' : '';
    summary = `**${missingCoords.length}** 个景点缺少坐标（${preview}${suffix}），地图可能无法完整显示。建议重新生成行程。`;
  }

  return { missingCoords, hasIssues, summary };
}

/**
 * 校验 tripPlan 并输出警告到 console
 *
 * @param {object} tripPlan - 行程数据
 * @returns {ValidationResult} 校验结果
 */
export function validateAndWarn(tripPlan) {
  const result = validateTripPlan(tripPlan);

  if (result.hasIssues) {
    console.warn('[TripPlan] 景点坐标缺失:', result.missingCoords);
  }

  return result;
}

/**
 * 校验 tripPlan 并生成 Markdown 警告文本（用于工具返回内容）
 *
 * @param {object} tripPlan - 行程数据
 * @returns {string} Markdown 警告文本，无问题时返回空字符串
 */
export function validateToMarkdown(tripPlan) {
  const result = validateTripPlan(tripPlan);

  if (!result.hasIssues) {
    return '';
  }

  return `\n\n> ⚠️ ${result.summary}`;
}
