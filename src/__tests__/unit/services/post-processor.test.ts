/**
 * PostProcessor — 单元测试
 *
 * 测试策略:
 *   - mock 底层 budget-service 和 action-link-service
 *   - 验证 budget 计算、links 生成、失败降级
 *   - 不调用真实 API
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  calculateBudgetForTrip,
  postProcessTripPlan,
  validateTripPlanConsistency,
} from "../../../services/post-processor.js";
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

  describe("validateTripPlanConsistency — 坐标完整性检查", () => {
    it("完整坐标的行程应通过校验", () => {
      const tripPlan = createMockTripPlan();
      const result = validateTripPlanConsistency(tripPlan);
      const coordErrors = result.errors.filter((e) => e.includes("坐标"));
      expect(coordErrors.length).toBe(0);
    });

    it("缺少 location 的景点应报错", () => {
      const tripPlan = createMockTripPlan({
        days: [
          {
            date: "2025-06-01",
            dayIndex: 1,
            city: "北京",
            isTransferDay: false,
            attractions: [
              {
                name: "故宫",
                nameZh: "故宫",
                nameEn: "Forbidden City",
                address: "东城区",
                visitDuration: 180,
                description: "皇家宫殿",
                category: "历史",
                ticketPrice: 60,
                reservationRequired: false,
                reservationTips: "",
                location: undefined as unknown as { latitude: number; longitude: number },
              },
            ],
            meals: [],
          } as any,
        ],
      });
      const result = validateTripPlanConsistency(tripPlan);
      const coordErrors = result.errors.filter((e) => e.includes("坐标"));
      expect(coordErrors.length).toBe(1);
      expect(coordErrors[0]).toContain("故宫");
      expect(result.valid).toBe(false);
    });

    it("坐标为 0,0 的景点应报错", () => {
      const tripPlan = createMockTripPlan({
        days: [
          {
            date: "2025-06-01",
            dayIndex: 1,
            city: "北京",
            isTransferDay: false,
            attractions: [
              {
                name: "天坛",
                nameZh: "天坛",
                nameEn: "Temple of Heaven",
                address: "东城区",
                visitDuration: 120,
                description: "祭天场所",
                category: "历史",
                ticketPrice: 34,
                reservationRequired: false,
                reservationTips: "",
                location: { latitude: 0, longitude: 0 },
              },
            ],
            meals: [],
          } as any,
        ],
      });
      const result = validateTripPlanConsistency(tripPlan);
      const coordErrors = result.errors.filter((e) => e.includes("坐标"));
      expect(coordErrors.length).toBe(1);
      expect(coordErrors[0]).toContain("天坛");
    });

    it("多个景点缺坐标应全部报错", () => {
      const tripPlan = createMockTripPlan({
        days: [
          {
            date: "2025-06-01",
            dayIndex: 1,
            city: "西安",
            isTransferDay: false,
            attractions: [
              {
                name: "城墙",
                nameZh: "城墙",
                nameEn: "",
                address: "",
                visitDuration: 120,
                description: "",
                category: "",
                ticketPrice: 0,
                reservationRequired: false,
                reservationTips: "",
                location: undefined as unknown as { latitude: number; longitude: number },
              },
              {
                name: "钟楼",
                nameZh: "钟楼",
                nameEn: "",
                address: "",
                visitDuration: 60,
                description: "",
                category: "",
                ticketPrice: 0,
                reservationRequired: false,
                reservationTips: "",
                location: { latitude: 0, longitude: 0 },
              },
              {
                name: "兵马俑",
                nameZh: "兵马俑",
                nameEn: "",
                address: "",
                visitDuration: 180,
                description: "",
                category: "",
                ticketPrice: 120,
                reservationRequired: false,
                reservationTips: "",
                location: { latitude: 34.38, longitude: 109.28 },
              }, // 有坐标
            ],
            meals: [],
          } as any,
        ],
      });
      const result = validateTripPlanConsistency(tripPlan);
      const coordErrors = result.errors.filter((e) => e.includes("坐标"));
      expect(coordErrors.length).toBe(2); // 城墙和钟楼缺坐标
      expect(coordErrors.some((e) => e.includes("城墙"))).toBe(true);
      expect(coordErrors.some((e) => e.includes("钟楼"))).toBe(true);
      expect(coordErrors.some((e) => e.includes("兵马俑"))).toBe(false); // 兵马俑有坐标
    });
  });
});
