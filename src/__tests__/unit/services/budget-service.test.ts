/**
 * 预算计算服务 — 单元测试
 */

import { describe, expect, it } from "vitest";
import { calculateBudget, checkBudgetOverrun } from "../../../services/budget-service.js";
import { createMockDayPlan, createMockTravelerProfile } from "../../mocks/fixtures.js";

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
    // biome-ignore lint/suspicious/noExplicitAny: test mock - delete optional property
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

  // ─── travelers 人群画像测试 ──────────────────────────────

  describe("travelers 人群画像", () => {
    const baseDay = createMockDayPlan({
      attractions: [
        {
          name: "故宫",
          ticketPrice: 60,
          nameZh: "故宫",
          nameEn: "Forbidden City",
          address: "",
          location: { latitude: 0, longitude: 0 },
          visitDuration: 180,
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
    });

    it("2成人+1老人+1儿童+1婴儿：门票按系数打折", () => {
      const travelers = createMockTravelerProfile({
        adults: 2,
        seniors: 1,
        children: 1,
        infants: 1,
      });
      // 门票系数 = 2 + 1*0.5 + 1*0.5 + 1*0 = 3
      const budget = calculateBudget({ days: [baseDay], travelers });
      expect(budget.totalAttractions).toBe(Math.round(60 * 3));
    });

    it("仅成人时按原价计算", () => {
      const travelers = createMockTravelerProfile({
        adults: 2,
        seniors: 0,
        children: 0,
        infants: 0,
      });
      const budget = calculateBudget({ days: [baseDay], travelers });
      expect(budget.totalAttractions).toBe(60 * 2);
      expect(budget.totalMeals).toBe((20 + 60 + 80) * 2);
    });

    it("老人门票半价、餐饮全价", () => {
      const travelers = createMockTravelerProfile({
        adults: 0,
        seniors: 2,
        children: 0,
        infants: 0,
      });
      // 门票系数 = 0 + 2*0.5 = 1；餐饮系数 = 0 + 2 = 2
      const budget = calculateBudget({ days: [baseDay], travelers });
      expect(budget.totalAttractions).toBe(Math.round(60 * 1));
      expect(budget.totalMeals).toBe((20 + 60 + 80) * 2);
    });

    it("儿童门票半价、餐饮半价", () => {
      const travelers = createMockTravelerProfile({
        adults: 0,
        seniors: 0,
        children: 2,
        infants: 0,
      });
      // 门票系数 = 0 + 0 + 2*0.5 = 1；餐饮系数 = 0 + 0 + 2*0.5 = 1
      const budget = calculateBudget({ days: [baseDay], travelers });
      expect(budget.totalAttractions).toBe(Math.round(60 * 1));
      expect(budget.totalMeals).toBe(Math.round((20 + 60 + 80) * 1));
    });

    it("婴幼儿门票和餐饮均免费", () => {
      const travelers = createMockTravelerProfile({
        adults: 0,
        seniors: 0,
        children: 0,
        infants: 2,
      });
      const budget = calculateBudget({ days: [baseDay], travelers });
      expect(budget.totalAttractions).toBe(0);
      expect(budget.totalMeals).toBe(0);
    });

    it("2人住1间房，3人住2间房", () => {
      const travelers2 = createMockTravelerProfile({
        adults: 2,
        seniors: 0,
        children: 0,
        infants: 0,
      });
      const budget2 = calculateBudget({ days: [baseDay], travelers: travelers2 });
      expect(budget2.totalHotels).toBe(300 * 1);

      const travelers3 = createMockTravelerProfile({
        adults: 3,
        seniors: 0,
        children: 0,
        infants: 0,
      });
      const budget3 = calculateBudget({ days: [baseDay], travelers: travelers3 });
      expect(budget3.totalHotels).toBe(300 * 2);
    });

    it("4成人+2儿童=6人→3间房", () => {
      const travelers = createMockTravelerProfile({
        adults: 4,
        seniors: 0,
        children: 2,
        infants: 0,
      });
      const budget = calculateBudget({ days: [baseDay], travelers });
      // 总人数6，Math.ceil(6/2)=3间房
      expect(budget.totalHotels).toBe(300 * 3);
    });

    it("交通费用随人数增加", () => {
      const travelers1 = createMockTravelerProfile({
        adults: 1,
        seniors: 0,
        children: 0,
        infants: 0,
      });
      const budget1 = calculateBudget({
        days: [baseDay],
        travelers: travelers1,
        dailyTransportBudget: 50,
      });
      // 系数 = 1 + (1-1)/2 = 1
      expect(budget1.totalTransportation).toBe(50 * 1);

      const travelers3 = createMockTravelerProfile({
        adults: 3,
        seniors: 0,
        children: 0,
        infants: 0,
      });
      const budget3 = calculateBudget({
        days: [baseDay],
        travelers: travelers3,
        dailyTransportBudget: 50,
      });
      // 系数 = 1 + (3-1)/2 = 2
      expect(budget3.totalTransportation).toBe(50 * 2);
    });

    it("未提供 travelers 时按单人默认计算", () => {
      const budget = calculateBudget({ days: [baseDay] });
      expect(budget.totalAttractions).toBe(60);
      expect(budget.totalMeals).toBe(20 + 60 + 80);
      expect(budget.totalHotels).toBe(300);
    });
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
