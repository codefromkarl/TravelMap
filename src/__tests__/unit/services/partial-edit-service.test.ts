/**
 * 局部修改服务 — 单元测试
 *
 * 核心: parseTargetDays (天数字符串解析) + extractPreferences + applyPartialEdit
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { applyPartialEdit, parseTargetDays } from "../../../services/partial-edit-service.js";
import { createMockDayPlan, createMockTripPlan } from "../../mocks/fixtures.js";

const originalEnv = process.env;

// ─── parseTargetDays ────────────────────────────────────────

describe("parseTargetDays", () => {
  it("应解析 '第3天' 格式", () => {
    expect(parseTargetDays("修改第3天的行程", 5)).toEqual([2]);
  });

  it("应解析 '第1天' (首日)", () => {
    expect(parseTargetDays("第1天换个景点", 3)).toEqual([0]);
  });

  it("应解析 '第2-4天' 范围格式", () => {
    expect(parseTargetDays("修改第2-4天", 5)).toEqual([1, 2, 3]);
  });

  it("应解析 '第2到5天' 范围格式", () => {
    expect(parseTargetDays("重新安排第2到5天", 6)).toEqual([1, 2, 3, 4]);
  });

  it("应解析 '第2~3天' 波浪线格式", () => {
    expect(parseTargetDays("第2~3天换一下", 4)).toEqual([1, 2]);
  });

  it("范围不应超出总天数", () => {
    expect(parseTargetDays("第4-10天", 5)).toEqual([3, 4]);
  });

  it("应解析多个 '第X天'", () => {
    expect(parseTargetDays("修改第1天和第3天", 5)).toEqual([0, 2]);
  });

  it("应去重并排序", () => {
    const result = parseTargetDays("第3天和第3天", 5);
    expect(result).toEqual([2]);
  });

  it("应解析中文序数 '第二天'", () => {
    expect(parseTargetDays("第二天换个景点", 5)).toEqual([1]);
  });

  it("应解析中文序数 '第三天'", () => {
    expect(parseTargetDays("第三天", 5)).toEqual([2]);
  });

  it("应解析 '最后一天'", () => {
    expect(parseTargetDays("最后一天换个地方", 4)).toEqual([3]);
  });

  it("应解析 '明天'", () => {
    expect(parseTargetDays("明天的行程改一下", 3)).toEqual([0]);
  });

  it("应解析 '后天'", () => {
    expect(parseTargetDays("后天行程调整", 3)).toEqual([1]);
  });

  it("应解析 '所有' 为全部天数", () => {
    expect(parseTargetDays("所有天都改", 4)).toEqual([0, 1, 2, 3]);
  });

  it("应解析 '全部' 为全部天数", () => {
    expect(parseTargetDays("全部重新安排", 3)).toEqual([0, 1, 2]);
  });

  it("无匹配时应返回空数组", () => {
    expect(parseTargetDays("随便改改", 3)).toEqual([]);
  });

  it("超出范围的天数应被忽略", () => {
    expect(parseTargetDays("第10天", 3)).toEqual([]);
  });
});

// ─── applyPartialEdit ────────────────────────────────────────

describe("applyPartialEdit", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    // 确保无 Google API Key，走 mock
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("应只修改目标天数的行程", async () => {
    const tripPlan = createMockTripPlan({
      days: [
        createMockDayPlan({ dayIndex: 1, city: "北京", attractions: [], description: "原始Day1" }),
        createMockDayPlan({ dayIndex: 2, city: "北京", attractions: [], description: "原始Day2" }),
        createMockDayPlan({ dayIndex: 3, city: "上海", attractions: [], description: "原始Day3" }),
      ],
    });

    const result = await applyPartialEdit({
      tripPlan,
      targetDays: [1], // 只改第二天
      instruction: "换成博物馆类的景点",
    });

    // Day 1 不变
    expect(result.days[0].description).toBe("原始Day1");
    // Day 2 被修改
    expect(result.days[1].description).toContain("博物馆");
    expect(result.days[1].description).toContain("重新安排");
    // Day 3 不变
    expect(result.days[2].description).toBe("原始Day3");
  });

  it("应重算预算", async () => {
    const tripPlan = createMockTripPlan({
      days: [createMockDayPlan({ attractions: [], meals: [] })],
    });

    const result = await applyPartialEdit({
      tripPlan,
      targetDays: [0],
      instruction: "换个景点",
    });

    expect(result.budget).toBeDefined();
    expect(typeof result.budget!.total).toBe("number");
  });

  it("越界索引应被忽略", async () => {
    const tripPlan = createMockTripPlan({
      days: [createMockDayPlan()],
    });

    // 索引 5 超出范围
    const result = await applyPartialEdit({
      tripPlan,
      targetDays: [5],
      instruction: "修改",
    });

    // 不应抛错，且原始数据不变
    expect(result.days).toHaveLength(1);
  });

  it("应保留未修改天的 meals", async () => {
    const originalMeals = [
      { type: "breakfast" as const, name: "豆浆油条", description: "早餐", estimatedCost: 15 },
      { type: "lunch" as const, name: "盖浇饭", description: "午餐", estimatedCost: 25 },
    ];
    const tripPlan = createMockTripPlan({
      days: [
        createMockDayPlan({ meals: originalMeals }),
        createMockDayPlan({ dayIndex: 2, attractions: [] }),
      ],
    });

    const result = await applyPartialEdit({
      tripPlan,
      targetDays: [1], // 只改第二天
      instruction: "换个景点",
    });

    // 第一天的 meals 保持不变
    expect(result.days[0].meals).toEqual(originalMeals);
  });
});
