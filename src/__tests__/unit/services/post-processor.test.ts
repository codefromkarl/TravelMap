/**
 * PostProcessor — 单元测试
 *
 * 测试策略:
 *   - mock 底层 budget-service 和 action-link-service
 *   - 验证 budget 计算、links 生成、失败降级
 *   - 不调用真实 API
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculateBudgetForTrip, postProcessTripPlan } from "../../../services/post-processor.js";
import { createMockTripPlan } from "../../mocks/fixtures.js";

// mock 底层服务
vi.mock("../../../services/budget-service.js", async () => {
  const actual = await vi.importActual<typeof import("../../../services/budget-service.js")>(
    "../../../services/budget-service.js",
  );
  return {
    ...actual,
    calculateBudget: vi.fn((params) => ({
      totalAttractions: 100,
      totalHotels: 300,
      totalMeals: 150,
      totalTransportation: 100,
      totalInterCityTransport: params.interCityTransportCost ?? 0,
      total: 650 + (params.interCityTransportCost ?? 0),
    })),
    checkBudgetOverrun: vi.fn((budget, limit) => ({
      overBudget: budget.total > limit,
      suggestions: budget.total > limit ? ["超支建议"] : [],
    })),
  };
});

vi.mock("../../../services/action-link-service.js", () => ({
  enrichTripWithLiveLinks: vi.fn((trip) => ({
    ...trip,
    flightLinks: [{ platform: "test", url: "http://test", label: "test" }],
  })),
}));

vi.mock("../../../services/restaurant-service.js", () => ({
  enrichDayMeals: vi.fn(async (day) => day),
}));

vi.mock("../../../services/transport-service.js", () => ({
  enrichTransferDays: vi.fn(async (trip) => trip),
}));

describe("PostProcessor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("postProcessTripPlan", () => {
    it("应为 TripPlan 计算预算并生成行动链接", async () => {
      const tripPlan = createMockTripPlan();

      const result = await postProcessTripPlan(tripPlan);

      expect(result.budgetCalculated).toBe(true);
      expect(result.linksGenerated).toBe(true);
      expect(result.tripPlan.budget).toBeDefined();
      expect(result.tripPlan.budget!.total).toBeGreaterThan(0);
      expect(result.tripPlan.flightLinks).toBeDefined();
      expect(result.tripPlan.flightLinks!.length).toBeGreaterThan(0);
    });

    it("应使用自定义 dailyTransportBudget", async () => {
      const tripPlan = createMockTripPlan();
      const { calculateBudget } = await import("../../../services/budget-service.js");

      await postProcessTripPlan(tripPlan, { dailyTransportBudget: 100 });

      expect(calculateBudget).toHaveBeenCalledWith(
        expect.objectContaining({ dailyTransportBudget: 100 }),
      );
    });

    it("应使用自定义 interCityTransportCost", async () => {
      const tripPlan = createMockTripPlan();
      const { calculateBudget } = await import("../../../services/budget-service.js");

      await postProcessTripPlan(tripPlan, { interCityTransportCost: 500 });

      expect(calculateBudget).toHaveBeenCalledWith(
        expect.objectContaining({ interCityTransportCost: 500 }),
      );
    });

    it("设置 budgetLimit 时应检查超支", async () => {
      const tripPlan = createMockTripPlan();
      const { checkBudgetOverrun } = await import("../../../services/budget-service.js");

      const result = await postProcessTripPlan(tripPlan, { budgetLimit: 100 });

      expect(checkBudgetOverrun).toHaveBeenCalled();
      expect(result.budgetCheck).toBeDefined();
      expect(result.budgetCheck!.overBudget).toBe(true);
    });

    it("禁用 enableActionLinks 时不应生成链接", async () => {
      const tripPlan = createMockTripPlan();

      const result = await postProcessTripPlan(tripPlan, { enableActionLinks: false });

      expect(result.linksGenerated).toBe(false);
      expect(result.tripPlan.flightLinks).toBeUndefined();
    });

    it("budget 计算失败时不应抛错，应继续生成 links", async () => {
      const tripPlan = createMockTripPlan();
      const { calculateBudget } = await import("../../../services/budget-service.js");
      vi.mocked(calculateBudget).mockImplementationOnce(() => {
        throw new Error("calc error");
      });

      const result = await postProcessTripPlan(tripPlan);

      expect(result.budgetCalculated).toBe(false);
      expect(result.linksGenerated).toBe(true);
    });

    it("links 生成失败时不应抛错，应保留已计算的 budget", async () => {
      const tripPlan = createMockTripPlan();
      const { enrichTripWithLiveLinks } = await import("../../../services/action-link-service.js");
      vi.mocked(enrichTripWithLiveLinks).mockRejectedValueOnce(new Error("link error"));

      const result = await postProcessTripPlan(tripPlan);

      expect(result.budgetCalculated).toBe(true);
      expect(result.linksGenerated).toBe(false);
      expect(result.tripPlan.budget).toBeDefined();
    });

    it("餐厅丰富失败时不应抛错，应继续后续处理", async () => {
      const tripPlan = createMockTripPlan();
      const { enrichDayMeals } = await import("../../../services/restaurant-service.js");
      vi.mocked(enrichDayMeals).mockRejectedValueOnce(new Error("restaurant error"));

      const result = await postProcessTripPlan(tripPlan, { enableRestaurantEnrich: true });

      expect(result.budgetCalculated).toBe(true);
      expect(result.linksGenerated).toBe(true);
    });

    it("城际交通丰富失败时不应抛错，应继续后续处理", async () => {
      const tripPlan = createMockTripPlan();
      const { enrichTransferDays } = await import("../../../services/transport-service.js");
      vi.mocked(enrichTransferDays).mockRejectedValueOnce(new Error("transport error"));

      const result = await postProcessTripPlan(tripPlan, { enableTransportEnrich: true });

      expect(result.budgetCalculated).toBe(true);
      expect(result.linksGenerated).toBe(true);
    });
  });

  describe("calculateBudgetForTrip", () => {
    it("应同步计算预算并返回新 TripPlan", () => {
      const tripPlan = createMockTripPlan({ budget: undefined });
      const result = calculateBudgetForTrip(tripPlan, 50, 0);

      expect(result.budget).toBeDefined();
      expect(result.budget!.total).toBe(650);
      // 不应修改原对象
      expect(tripPlan.budget).toBeUndefined();
    });
  });
});
