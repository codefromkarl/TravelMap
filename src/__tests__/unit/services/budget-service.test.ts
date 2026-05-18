/**
 * 预算计算服务 — 单元测试
 */

import { describe, expect, it } from "vitest";
import { calculateBudget, checkBudgetOverrun } from "../../../services/budget-service.js";
import { createMockDayPlan } from "../../mocks/fixtures.js";

describe("calculateBudget", () => {
  it("应正确汇总所有费用", () => {
    const days = [
      createMockDayPlan({
        attractions: [
          {
            name: "A",
            ticketPrice: 60,
            nameZh: "A",
            nameEn: "A",
            address: "",
            location: { latitude: 0, longitude: 0 },
            visitDuration: 60,
            description: "",
            category: "",
            reservationRequired: false,
            reservationTips: "",
          },
          {
            name: "B",
            ticketPrice: 40,
            nameZh: "B",
            nameEn: "B",
            address: "",
            location: { latitude: 0, longitude: 0 },
            visitDuration: 60,
            description: "",
            category: "",
            reservationRequired: false,
            reservationTips: "",
          },
        ],
        meals: [
          { type: "breakfast" as const, name: "早", description: "", estimatedCost: 20 },
          { type: "lunch" as const, name: "午", description: "", estimatedCost: 60 },
          { type: "dinner" as const, name: "晚", description: "", estimatedCost: 80 },
        ],
        hotel: { name: "H", address: "", priceRange: "", rating: 0, estimatedCost: 300 },
      }),
      createMockDayPlan({
        dayIndex: 2,
        attractions: [
          {
            name: "C",
            ticketPrice: 30,
            nameZh: "C",
            nameEn: "C",
            address: "",
            location: { latitude: 0, longitude: 0 },
            visitDuration: 60,
            description: "",
            category: "",
            reservationRequired: false,
            reservationTips: "",
          },
        ],
        meals: [
          { type: "breakfast" as const, name: "早", description: "", estimatedCost: 15 },
          { type: "dinner" as const, name: "晚", description: "", estimatedCost: 90 },
        ],
        hotel: { name: "H2", address: "", priceRange: "", rating: 0, estimatedCost: 400 },
      }),
    ];

    const budget = calculateBudget({ days });

    expect(budget.totalAttractions).toBe(60 + 40 + 30); // 130
    expect(budget.totalHotels).toBe(300 + 400); // 700
    expect(budget.totalMeals).toBe(20 + 60 + 80 + 15 + 90); // 265
    expect(budget.totalTransportation).toBe(2 * 50); // 100 (默认 dailyTransportBudget=50)
    expect(budget.totalInterCityTransport).toBe(0);
    expect(budget.total).toBe(130 + 700 + 265 + 100 + 0);
  });

  it("应支持自定义城际交通和每日交通预算", () => {
    const days = [createMockDayPlan()];

    const budget = calculateBudget({
      days,
      interCityTransportCost: 500,
      dailyTransportBudget: 80,
    });

    expect(budget.totalTransportation).toBe(1 * 80);
    expect(budget.totalInterCityTransport).toBe(500);
  });

  it("空天数应返回全零预算", () => {
    const budget = calculateBudget({ days: [] });

    expect(budget.totalAttractions).toBe(0);
    expect(budget.totalHotels).toBe(0);
    expect(budget.totalMeals).toBe(0);
    expect(budget.totalTransportation).toBe(0);
    expect(budget.total).toBe(0);
  });

  it("无酒店时住宿费用应为零", () => {
    const day = createMockDayPlan();
    delete (day as any).hotel;

    const budget = calculateBudget({ days: [day] });
    expect(budget.totalHotels).toBe(0);
  });

  it("无景点/无餐饮的天应正确处理", () => {
    const day = createMockDayPlan({ attractions: [], meals: [] });

    const budget = calculateBudget({ days: [day] });
    expect(budget.totalAttractions).toBe(0);
    expect(budget.totalMeals).toBe(0);
  });
});

describe("checkBudgetOverrun", () => {
  it("未超预算应返回 overBudget=false", () => {
    const budget = {
      totalAttractions: 100,
      totalHotels: 500,
      totalMeals: 200,
      totalTransportation: 100,
      totalInterCityTransport: 0,
      total: 900,
    };

    const result = checkBudgetOverrun(budget, 1000);
    expect(result.overBudget).toBe(false);
    expect(result.suggestions).toHaveLength(0);
  });

  it("超预算应返回 overBudget=true 和建议", () => {
    const budget = {
      totalAttractions: 500,
      totalHotels: 2000,
      totalMeals: 800,
      totalTransportation: 300,
      totalInterCityTransport: 0,
      total: 3600,
    };

    const result = checkBudgetOverrun(budget, 2000);
    expect(result.overBudget).toBe(true);
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions.some((s) => s.includes("¥3600"))).toBe(true);
  });

  it("刚好等于预算不应算超支", () => {
    const budget = {
      totalAttractions: 100,
      totalHotels: 400,
      totalMeals: 300,
      totalTransportation: 200,
      totalInterCityTransport: 0,
      total: 1000,
    };

    const result = checkBudgetOverrun(budget, 1000);
    expect(result.overBudget).toBe(false);
  });

  it("超支金额大部分来自住宿时应给出住宿建议", () => {
    const budget = {
      totalAttractions: 50,
      totalHotels: 1500,
      totalMeals: 200,
      totalTransportation: 100,
      totalInterCityTransport: 0,
      total: 1850,
    };

    const result = checkBudgetOverrun(budget, 1000);
    expect(result.overBudget).toBe(true);
    expect(result.suggestions.some((s) => s.includes("住宿"))).toBe(true);
  });
});
