/**
 * budget 工具单元测试
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockAttraction, createMockDayPlan, createMockMeal } from "../../mocks/fixtures.js";

// Mock budget-service
vi.mock("../../../services/budget-service.js", () => ({
  calculateBudget: vi.fn(),
  checkBudgetOverrun: vi.fn(),
}));

import { calculateBudget, checkBudgetOverrun } from "../../../services/budget-service.js";
import { calculateBudgetTool } from "../../../tools/budget.js";

const mockCalculateBudget = vi.mocked(calculateBudget);
const mockCheckBudgetOverrun = vi.mocked(checkBudgetOverrun);

describe("calculateBudgetTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const sampleDays = [
    createMockDayPlan({
      date: "2026-05-20",
      dayIndex: 1,
      city: "杭州",
      attractions: [createMockAttraction({ name: "西湖", ticketPrice: 0 })],
      meals: [createMockMeal({ type: "lunch", name: "楼外楼", estimatedCost: 100 })],
      accommodation: "酒店",
    }),
  ];

  it("应有正确的工具名称", () => {
    expect(calculateBudgetTool.name).toBe("calculate_budget");
  });

  it("应计算预算明细", async () => {
    mockCalculateBudget.mockReturnValue({
      totalAttractions: 0,
      totalHotels: 400,
      totalMeals: 100,
      totalTransportation: 50,
      totalInterCityTransport: 0,
      total: 550,
    });

    const result = await calculateBudgetTool.execute("call-1", {
      days: sampleDays,
    });

    expect(mockCalculateBudget).toHaveBeenCalled();
    expect(result.details.budget.total).toBe(550);
    expect((result.content[0] as { type: "text"; text: string }).text).toContain("预算明细");
    expect((result.content[0] as { type: "text"; text: string }).text).toContain("¥550");
  });

  it("应显示各项费用", async () => {
    mockCalculateBudget.mockReturnValue({
      totalAttractions: 100,
      totalHotels: 400,
      totalMeals: 200,
      totalTransportation: 50,
      totalInterCityTransport: 150,
      total: 900,
    });

    const result = await calculateBudgetTool.execute("call-2", {
      days: sampleDays,
    });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("门票");
    expect(text).toContain("住宿");
    expect(text).toContain("餐饮");
    expect(text).toContain("市内交通");
    expect(text).toContain("城际交通");
  });

  it("预算未超支时应显示剩余", async () => {
    mockCalculateBudget.mockReturnValue({
      totalAttractions: 0,
      totalHotels: 400,
      totalMeals: 100,
      totalTransportation: 50,
      totalInterCityTransport: 0,
      total: 550,
    });
    mockCheckBudgetOverrun.mockReturnValue({
      overBudget: false,
      suggestions: [],
    });

    const result = await calculateBudgetTool.execute("call-3", {
      days: sampleDays,
      budgetLimit: 1000,
    });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("在预算上限");
    expect(text).toContain("剩余");
  });

  it("预算超支时应显示建议", async () => {
    mockCalculateBudget.mockReturnValue({
      totalAttractions: 0,
      totalHotels: 400,
      totalMeals: 100,
      totalTransportation: 50,
      totalInterCityTransport: 0,
      total: 550,
    });
    mockCheckBudgetOverrun.mockReturnValue({
      overBudget: true,
      suggestions: ["考虑选择更经济的住宿", "减少餐厅消费"],
    });

    const result = await calculateBudgetTool.execute("call-4", {
      days: sampleDays,
      budgetLimit: 500,
    });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("超出预算上限");
    expect(text).toContain("更经济的住宿");
  });

  it("应支持自定义城际交通费用", async () => {
    mockCalculateBudget.mockReturnValue({
      totalAttractions: 0,
      totalHotels: 400,
      totalMeals: 100,
      totalTransportation: 50,
      totalInterCityTransport: 200,
      total: 750,
    });

    const result = await calculateBudgetTool.execute("call-5", {
      days: sampleDays,
      interCityTransportCost: 200,
    });

    expect(result.details.budget.totalInterCityTransport).toBe(200);
  });

  it("应支持自定义每日交通预算", async () => {
    mockCalculateBudget.mockReturnValue({
      totalAttractions: 0,
      totalHotels: 400,
      totalMeals: 100,
      totalTransportation: 100,
      totalInterCityTransport: 0,
      total: 600,
    });

    const result = await calculateBudgetTool.execute("call-6", {
      days: sampleDays,
      dailyTransportBudget: 100,
    });

    expect(result.details.budget.totalTransportation).toBe(100);
  });

  it("无预算限制时不应调用 checkBudgetOverrun", async () => {
    mockCalculateBudget.mockReturnValue({
      totalAttractions: 0,
      totalHotels: 400,
      totalMeals: 100,
      totalTransportation: 50,
      totalInterCityTransport: 0,
      total: 550,
    });

    await calculateBudgetTool.execute("call-7", {
      days: sampleDays,
    });

    expect(mockCheckBudgetOverrun).not.toHaveBeenCalled();
  });
});
