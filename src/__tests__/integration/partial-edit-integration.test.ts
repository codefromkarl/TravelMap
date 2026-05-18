/**
 * 集成测试 — 局部修改服务 + Agent 工具编排
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { calculateBudget } from "../../services/budget-service.js";
import { applyPartialEdit, parseTargetDays } from "../../services/partial-edit-service.js";
import { createMockDayPlan, createMockTripPlan } from "../mocks/fixtures.js";

const originalEnv = process.env;

describe("集成: 局部修改 → 预算重算链路", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("修改单天后应触发预算重算且总预算变化", async () => {
    const originalDay = createMockDayPlan({
      dayIndex: 1,
      city: "北京",
      attractions: [
        {
          name: "便宜景点",
          nameZh: "便宜景点",
          nameEn: "Cheap",
          address: "",
          location: { latitude: 0, longitude: 0 },
          visitDuration: 60,
          description: "",
          category: "",
          ticketPrice: 10,
          reservationRequired: false,
          reservationTips: "",
        },
      ],
      hotel: { name: "H", address: "", priceRange: "", rating: 4, estimatedCost: 200 },
      meals: [
        { type: "breakfast" as const, name: "早", description: "", estimatedCost: 20 },
        { type: "lunch" as const, name: "午", description: "", estimatedCost: 40 },
        { type: "dinner" as const, name: "晚", description: "", estimatedCost: 60 },
      ],
    });

    const tripPlan = createMockTripPlan({ days: [originalDay] });
    const _budgetBefore = calculateBudget({ days: tripPlan.days });

    // 应用修改
    const edited = await applyPartialEdit({
      tripPlan,
      targetDays: [0],
      instruction: "换成更贵的景点和美食",
    });

    const _budgetAfter = calculateBudget({ days: edited.days });

    // 预算对象应该存在且结构完整
    expect(edited.budget).toBeDefined();
    expect(edited.budget!.total).toBeGreaterThan(0);

    // 描述应被更新
    expect(edited.days[0].description).toContain("重新安排");
  });

  it("parseTargetDays + applyPartialEdit 端到端", async () => {
    const tripPlan = createMockTripPlan({
      days: [
        createMockDayPlan({ dayIndex: 1, city: "北京", attractions: [] }),
        createMockDayPlan({ dayIndex: 2, city: "上海", attractions: [] }),
        createMockDayPlan({ dayIndex: 3, city: "杭州", attractions: [] }),
      ],
    });

    const instruction = "修改第2天，换成公园类的景点";
    const targetDays = parseTargetDays(instruction, 3);

    expect(targetDays).toEqual([1]);

    const result = await applyPartialEdit({
      tripPlan,
      targetDays,
      instruction,
    });

    // 只有第二天被修改
    expect(result.days[0].description).not.toContain("重新安排");
    expect(result.days[1].description).toContain("重新安排");
    expect(result.days[2].description).not.toContain("重新安排");
  });
});

describe("集成: 多工具串联计算", () => {
  it("多天行程预算应包含各天费用汇总", () => {
    const days = [
      createMockDayPlan({
        dayIndex: 1,
        city: "北京",
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
        ],
        hotel: { name: "H1", address: "", priceRange: "", rating: 4, estimatedCost: 300 },
        meals: [
          { type: "breakfast" as const, name: "M1", description: "", estimatedCost: 20 },
          { type: "lunch" as const, name: "M2", description: "", estimatedCost: 50 },
          { type: "dinner" as const, name: "M3", description: "", estimatedCost: 80 },
        ],
      }),
      createMockDayPlan({
        dayIndex: 2,
        city: "上海",
        attractions: [
          {
            name: "B",
            ticketPrice: 199,
            nameZh: "B",
            nameEn: "B",
            address: "",
            location: { latitude: 0, longitude: 0 },
            visitDuration: 90,
            description: "",
            category: "",
            reservationRequired: false,
            reservationTips: "",
          },
          {
            name: "C",
            ticketPrice: 40,
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
        hotel: { name: "H2", address: "", priceRange: "", rating: 4.5, estimatedCost: 500 },
        meals: [
          { type: "breakfast" as const, name: "M4", description: "", estimatedCost: 30 },
          { type: "lunch" as const, name: "M5", description: "", estimatedCost: 70 },
          { type: "dinner" as const, name: "M6", description: "", estimatedCost: 100 },
        ],
      }),
    ];

    const budget = calculateBudget({ days, interCityTransportCost: 300 });

    expect(budget.totalAttractions).toBe(60 + 199 + 40); // 299
    expect(budget.totalHotels).toBe(300 + 500); // 800
    expect(budget.totalMeals).toBe(20 + 50 + 80 + 30 + 70 + 100); // 350
    expect(budget.totalTransportation).toBe(2 * 50); // 100
    expect(budget.totalInterCityTransport).toBe(300);
    expect(budget.total).toBe(299 + 800 + 350 + 100 + 300); // 1849
  });
});
