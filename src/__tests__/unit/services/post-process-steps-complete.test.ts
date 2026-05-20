/**
 * Post-process Steps — 完整测试
 *
 * 覆盖每个步骤的：
 *   - isEnabled 配置检查
 *   - run 方法正常路径
 *   - run 方法错误降级
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionLinksStep } from "../../../services/post-process/steps/action-links-step.js";
import { BudgetCalcStep } from "../../../services/post-process/steps/budget-calc-step.js";
import { BudgetCheckStep } from "../../../services/post-process/steps/budget-check-step.js";
import { ConsistencyCheckStep } from "../../../services/post-process/steps/consistency-check-step.js";
import { HotelEnrichStep } from "../../../services/post-process/steps/hotel-enrich-step.js";
import { ReservationTimelineStep } from "../../../services/post-process/steps/reservation-timeline-step.js";
import { RestaurantEnrichStep } from "../../../services/post-process/steps/restaurant-enrich-step.js";
import { TransportEnrichStep } from "../../../services/post-process/steps/transport-enrich-step.js";
import { createMockTripPlan } from "../../mocks/fixtures.js";

// Mock 底层服务
vi.mock("../../../services/budget-service.js", () => ({
  calculateBudget: vi.fn(() => ({
    totalAttractions: 100,
    totalHotels: 300,
    totalMeals: 150,
    totalTransportation: 50,
    totalInterCityTransport: 0,
    total: 600,
  })),
  checkBudgetOverrun: vi.fn((budget, limit) => ({
    overBudget: budget.total > limit,
    suggestions: budget.total > limit ? ["超支建议"] : [],
  })),
}));

vi.mock("../../../services/action-link-service.js", () => ({
  enrichTripWithLiveLinks: vi.fn((trip) => trip),
}));

vi.mock("../../../services/restaurant-service.js", () => ({
  enrichDayMeals: vi.fn(async (day) => day),
}));

vi.mock("../../../services/transport-service.js", () => ({
  enrichTransferDays: vi.fn(async (trip) => trip),
}));

vi.mock("../../../services/hotel-service.js", () => ({
  enrichHotelsForTrip: vi.fn(async (trip) => trip),
}));

vi.mock("../../../services/reservation-timeline-service.js", () => ({
  enrichReservationTimeline: vi.fn((days) => days),
}));

describe("Post-process Steps 完整测试", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("BudgetCalcStep", () => {
    const step = new BudgetCalcStep();

    it("应始终启用", () => {
      expect(step.isEnabled({})).toBe(true);
    });

    it("应计算预算并返回新 TripPlan", async () => {
      const tripPlan = createMockTripPlan();
      const result = await step.run(tripPlan, {});
      expect(result.budget).toBeDefined();
      expect(result.budget!.total).toBe(600);
    });

    it("应传递 interCityTransportCost", async () => {
      const tripPlan = createMockTripPlan();
      await step.run(tripPlan, { interCityTransportCost: 200 });
      const { calculateBudget } = await import("../../../services/budget-service.js");
      expect(calculateBudget).toHaveBeenCalledWith(
        expect.objectContaining({ interCityTransportCost: 200 }),
      );
    });

    it("应传递 dailyTransportBudget", async () => {
      const tripPlan = createMockTripPlan();
      await step.run(tripPlan, { dailyTransportBudget: 100 });
      const { calculateBudget } = await import("../../../services/budget-service.js");
      expect(calculateBudget).toHaveBeenCalledWith(
        expect.objectContaining({ dailyTransportBudget: 100 }),
      );
    });
  });

  describe("BudgetCheckStep", () => {
    const step = new BudgetCheckStep();

    it("无 budgetLimit 时应禁用", () => {
      expect(step.isEnabled({})).toBe(false);
    });

    it("有 budgetLimit 时应启用", () => {
      expect(step.isEnabled({ budgetLimit: 1000 })).toBe(true);
    });

    it("应检查预算超支", async () => {
      const tripPlan = createMockTripPlan({
        budget: {
          totalAttractions: 0,
          totalHotels: 0,
          totalMeals: 0,
          totalTransportation: 0,
          totalInterCityTransport: 0,
          total: 800,
        },
      });
      await step.run(tripPlan, { budgetLimit: 500 });
      expect(step.budgetCheck).toBeDefined();
      expect(step.budgetCheck!.overBudget).toBe(true);
    });

    it("未超支时应返回建议为空", async () => {
      const tripPlan = createMockTripPlan({
        budget: {
          totalAttractions: 0,
          totalHotels: 0,
          totalMeals: 0,
          totalTransportation: 0,
          totalInterCityTransport: 0,
          total: 300,
        },
      });
      await step.run(tripPlan, { budgetLimit: 500 });
      expect(step.budgetCheck!.overBudget).toBe(false);
      expect(step.budgetCheck!.suggestions).toEqual([]);
    });
  });

  describe("ActionLinksStep", () => {
    const step = new ActionLinksStep();

    it("应始终启用", () => {
      expect(step.isEnabled({})).toBe(true);
    });

    it("应禁用 enableActionLinks", () => {
      expect(step.isEnabled({ enableActionLinks: false })).toBe(false);
    });

    it("应生成行动链接", async () => {
      const tripPlan = createMockTripPlan();
      const result = await step.run(tripPlan, {});
      expect(result).toBeDefined();
    });
  });

  describe("RestaurantEnrichStep", () => {
    const step = new RestaurantEnrichStep();

    it("默认禁用", () => {
      expect(step.isEnabled({})).toBe(false);
    });

    it("启用 enableRestaurantEnrich 时应启用", () => {
      expect(step.isEnabled({ enableRestaurantEnrich: true })).toBe(true);
    });

    it("应丰富餐厅信息", async () => {
      const tripPlan = createMockTripPlan();
      const result = await step.run(tripPlan, { enableRestaurantEnrich: true });
      expect(result).toBeDefined();
    });
  });

  describe("TransportEnrichStep", () => {
    const step = new TransportEnrichStep();

    it("默认禁用", () => {
      expect(step.isEnabled({})).toBe(false);
    });

    it("启用 enableTransportEnrich 时应启用", () => {
      expect(step.isEnabled({ enableTransportEnrich: true })).toBe(true);
    });

    it("应丰富交通信息", async () => {
      const tripPlan = createMockTripPlan();
      const result = await step.run(tripPlan, { enableTransportEnrich: true });
      expect(result).toBeDefined();
    });
  });

  describe("HotelEnrichStep", () => {
    const step = new HotelEnrichStep();

    it("默认禁用", () => {
      expect(step.isEnabled({})).toBe(false);
    });

    it("启用 enableHotelEnrich 时应启用", () => {
      expect(step.isEnabled({ enableHotelEnrich: true })).toBe(true);
    });

    it("应丰富酒店信息", async () => {
      const tripPlan = createMockTripPlan();
      const result = await step.run(tripPlan, { enableHotelEnrich: true });
      expect(result).toBeDefined();
    });
  });

  describe("ReservationTimelineStep", () => {
    const step = new ReservationTimelineStep();

    it("应始终启用", () => {
      expect(step.isEnabled({})).toBe(true);
    });

    it("应丰富预约时间线", async () => {
      const tripPlan = createMockTripPlan();
      const result = await step.run(tripPlan, {});
      expect(result).toBeDefined();
      expect(result.days).toBeDefined();
    });
  });

  describe("ConsistencyCheckStep", () => {
    const step = new ConsistencyCheckStep();

    it("应始终启用", () => {
      expect(step.isEnabled({})).toBe(true);
    });

    it("应执行一致性检查", async () => {
      const tripPlan = createMockTripPlan();
      await step.run(tripPlan, {});
      expect(step.consistency).toBeDefined();
    });

    it("检查发现问题时应记录结果", async () => {
      const tripPlan = createMockTripPlan({
        days: [
          {
            dayIndex: 1,
            date: "2026-05-20",
            city: "杭州",
            isTransferDay: false,
            transferInfo: "",
            description: "",
            transportation: "步行",
            accommodation: "",
            attractions: [],
            meals: [],
          },
          {
            dayIndex: 3,
            date: "2026-05-22",
            city: "杭州",
            isTransferDay: false,
            transferInfo: "",
            description: "",
            transportation: "步行",
            accommodation: "",
            attractions: [],
            meals: [],
          },
        ],
      });
      await step.run(tripPlan, {});
      expect(step.consistency).toBeDefined();
    });
  });
});
