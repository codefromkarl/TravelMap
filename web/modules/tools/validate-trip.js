/**
 * TripPlan 校验工具 — 前端共享
 *
 * 提供 tripPlan 数据完整性校验，所有前端工具共用。
 * 检测坐标缺失、必填字段缺失等问题。
 */

// ─── TripPlan 结构校验 ─────────────────────────────────────

/**
 * 校验 tripPlan 基本结构是否合法
 *
 * @param {object} tripPlan - 行程数据
 * @returns {{ valid: boolean, errors: string[] }} 校验结果
 */
export function validateTripPlanSchema(tripPlan) {
  const errors = [];

  if (!tripPlan) {
    return { valid: false, errors: ['tripPlan 为空'] };
  }

  if (typeof tripPlan.city !== 'string' || tripPlan.city.length === 0) {
    errors.push('缺少 city 字段');
  }

  if (!Array.isArray(tripPlan.days)) {
    errors.push('缺少 days 数组');
    return { valid: false, errors };
  }

  for (let i = 0; i < tripPlan.days.length; i++) {
    const day = tripPlan.days[i];
    if (!day) {
      errors.push(`days[${i}] 为空`);
      continue;
    }

    if (!day.date) {
      errors.push(`days[${i}] 缺少 date`);
    }

    if (!Array.isArray(day.attractions)) {
      errors.push(`days[${i}] 缺少 attractions 数组`);
      continue;
    }

    for (let j = 0; j < day.attractions.length; j++) {
      const attr = day.attractions[j];
      if (!attr) {
        errors.push(`days[${i}].attractions[${j}] 为空`);
        continue;
      }

      if (!attr.name && !attr.nameZh) {
        errors.push(`days[${i}].attractions[${j}] 缺少 name`);
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

  if (!tripPlan || !tripPlan.days) {
    return { missingCoords: [], hasIssues: false, summary: '' };
  }

  for (const day of tripPlan.days) {
    for (const attr of day.attractions || []) {
      const loc = attr.location;
      const needsGeocode =
        !loc ||
        !loc.latitude ||
        !loc.longitude ||
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
