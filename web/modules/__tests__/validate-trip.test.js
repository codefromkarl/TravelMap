/**
 * validate-trip.js 单元测试
 *
 * 测试前端行程数据校验逻辑：
 * - validateTripPlanSchema() 结构校验
 * - validateTripPlan() 坐标完整性校验
 * - validateAndWarn() 告警输出
 * - validateToMarkdown() Markdown 告警文本
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateTripPlanSchema,
  validateTripPlan,
  validateAndWarn,
  validateToMarkdown,
} from '../tools/validate-trip.js';

// ─── 测试数据 ─────────────────────────────────────────

const createValidTripPlan = () => ({
  city: '杭州',
  days: [
    {
      day: 1,
      date: '2025-06-01',
      city: '杭州',
      attractions: [
        {
          name: '西湖',
          nameZh: '西湖',
          location: { latitude: 30.2458, longitude: 120.1484 },
        },
        {
          name: '灵隐寺',
          nameZh: '灵隐寺',
          location: { latitude: 30.2414, longitude: 120.1017 },
        },
      ],
    },
  ],
});

// ─── 测试 ─────────────────────────────────────────────

describe('validateTripPlanSchema', () => {
  it('正常行程通过校验', () => {
    const tripPlan = createValidTripPlan();
    const result = validateTripPlanSchema(tripPlan);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('tripPlan 为空返回无效', () => {
    const result = validateTripPlanSchema(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('tripPlan 为空');
  });

  it('缺少 city 字段返回无效', () => {
    const tripPlan = { days: [] };
    const result = validateTripPlanSchema(tripPlan);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('缺少 city 字段');
  });

  it('city 为空字符串返回无效', () => {
    const tripPlan = { city: '', days: [] };
    const result = validateTripPlanSchema(tripPlan);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('缺少 city 字段');
  });

  it('缺少 days 数组返回无效', () => {
    const tripPlan = { city: '杭州' };
    const result = validateTripPlanSchema(tripPlan);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('缺少 days 数组');
  });

  it('days 中有空元素返回错误', () => {
    const tripPlan = { city: '杭州', days: [null] };
    const result = validateTripPlanSchema(tripPlan);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('days[0] 为空');
  });

  it('day 缺少 date 返回错误', () => {
    const tripPlan = {
      city: '杭州',
      days: [{ attractions: [] }],
    };
    const result = validateTripPlanSchema(tripPlan);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('days[0] 缺少 date');
  });

  it('day 缺少 attractions 数组返回错误', () => {
    const tripPlan = {
      city: '杭州',
      days: [{ date: '2025-06-01' }],
    };
    const result = validateTripPlanSchema(tripPlan);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('days[0] 缺少 attractions 数组');
  });

  it('attraction 缺少 name 返回错误', () => {
    const tripPlan = {
      city: '杭州',
      days: [
        {
          date: '2025-06-01',
          attractions: [{ description: '测试' }],
        },
      ],
    };
    const result = validateTripPlanSchema(tripPlan);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('days[0].attractions[0] 缺少 name');
  });
});

describe('validateTripPlan', () => {
  it('无缺失坐标返回空数组', () => {
    const tripPlan = createValidTripPlan();
    const result = validateTripPlan(tripPlan);
    expect(result.missingCoords).toEqual([]);
    expect(result.hasIssues).toBe(false);
    expect(result.summary).toBe('');
  });

  it('有缺失坐标返回名称列表', () => {
    const tripPlan = {
      city: '杭州',
      days: [
        {
          attractions: [
            { name: '西湖', location: { latitude: 30.2458, longitude: 120.1484 } },
            { name: '河坊街', location: null },
            { name: '灵隐寺', location: { latitude: 0, longitude: 0 } },
          ],
        },
      ],
    };
    const result = validateTripPlan(tripPlan);
    expect(result.missingCoords).toContain('河坊街');
    expect(result.missingCoords).toContain('灵隐寺');
    expect(result.missingCoords).not.toContain('西湖');
    expect(result.hasIssues).toBe(true);
  });

  it('summary 包含缺失数量和预览', () => {
    const tripPlan = {
      city: '杭州',
      days: [
        {
          attractions: [
            { name: '景点1', location: null },
            { name: '景点2', location: null },
            { name: '景点3', location: null },
            { name: '景点4', location: null },
          ],
        },
      ],
    };
    const result = validateTripPlan(tripPlan);
    expect(result.summary).toContain('4');
    expect(result.summary).toContain('景点1');
    expect(result.summary).toContain('...');
  });

  it('空行程返回无问题', () => {
    const tripPlan = { city: '空城', days: [] };
    const result = validateTripPlan(tripPlan);
    expect(result.missingCoords).toEqual([]);
    expect(result.hasIssues).toBe(false);
  });

  it('null 行程返回无问题', () => {
    const result = validateTripPlan(null);
    expect(result.missingCoords).toEqual([]);
    expect(result.hasIssues).toBe(false);
  });
});

describe('validateAndWarn', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('无缺失坐标不输出警告', () => {
    const tripPlan = createValidTripPlan();
    validateAndWarn(tripPlan);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('有缺失坐标输出警告', () => {
    const tripPlan = {
      city: '杭州',
      days: [
        {
          attractions: [
            { name: '河坊街', location: null },
          ],
        },
      ],
    };
    validateAndWarn(tripPlan);
    expect(console.warn).toHaveBeenCalledWith(
      '[TripPlan] 景点坐标缺失:',
      expect.arrayContaining(['河坊街'])
    );
  });
});

describe('validateToMarkdown', () => {
  it('无缺失坐标返回空字符串', () => {
    const tripPlan = createValidTripPlan();
    const result = validateToMarkdown(tripPlan);
    expect(result).toBe('');
  });

  it('有缺失坐标返回 Markdown 告警', () => {
    const tripPlan = {
      city: '杭州',
      days: [
        {
          attractions: [
            { name: '河坊街', location: null },
          ],
        },
      ],
    };
    const result = validateToMarkdown(tripPlan);
    expect(result).toContain('⚠️');
    expect(result).toContain('1');
    expect(result).toContain('河坊街');
  });
});
