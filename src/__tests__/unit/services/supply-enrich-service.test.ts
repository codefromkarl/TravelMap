/**
 * supply-enrich-service 单元测试
 *
 * 覆盖：
 * - enrichAttractionSupplies 丰富单个景点补给
 * - enrichTripPlanSupplies 丰富整个行程补给
 * - enrichTripPlanSuppliesWithStats 带统计的丰富
 * - skipValidated 配置项
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  enrichAttractionSupplies,
  enrichTripPlanSupplies,
  enrichTripPlanSuppliesWithStats,
} from "../../../services/supply-enrich-service.js";
import type { Attraction, TripPlan } from "../../../types/trip.js";

// Mock supply-validation-service
vi.mock("../../../services/supply-validation-service.js", () => ({
  validateRouteSupplies: vi.fn(async (points: Array<Record<string, unknown>>) =>
    points.map((p: Record<string, unknown>) => ({
      ...p,
      locationAccuracy: "exact",
      priceConfidence: "api",
      lastUpdated: "2026-05-18",
      dataSource: "mock_api",
    })),
  ),
}));

describe("enrichAttractionSupplies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("无路线的景点直接返回", async () => {
    const attraction: Attraction = {
      name: "外滩",
      nameZh: "外滩",
      nameEn: "The Bund",
      address: "上海市黄浦区",
      location: { latitude: 31.24, longitude: 121.49 },
      visitDuration: 90,
      description: "外滩",
      category: "地标",
      ticketPrice: 0,
      reservationRequired: false,
      reservationTips: "",
    };

    const result = await enrichAttractionSupplies(attraction, "上海");
    expect(result).toEqual(attraction);
  });

  it("有 supplyPoints 的路线应被验证", async () => {
    const attraction: Attraction = {
      name: "西湖",
      nameZh: "西湖",
      nameEn: "West Lake",
      address: "杭州市西湖区",
      location: { latitude: 30.24, longitude: 120.15 },
      visitDuration: 120,
      description: "西湖",
      category: "湖泊",
      ticketPrice: 0,
      reservationRequired: false,
      reservationTips: "",
      routes: [
        {
          id: "test_route",
          name: "测试路线",
          description: "测试",
          duration: 180,
          waypoints: [
            {
              name: "断桥",
              location: { latitude: 30.26, longitude: 120.16 },
              visitDuration: 20,
              isOptional: false,
              supplyPoints: [
                {
                  name: "某茶室",
                  type: "cafe",
                  description: "茶",
                  estimatedCost: 30,
                  isRecommended: false,
                },
              ],
            },
          ],
          tags: ["测试"],
          source: "official",
          difficulty: 1,
        },
      ],
      selectedRouteId: "test_route",
    };

    const result = await enrichAttractionSupplies(attraction, "杭州");
    expect(result.routes).toBeDefined();
    expect(result.routes![0].waypoints[0].supplyPoints![0].locationAccuracy).toBe("exact");
    expect(result.routes![0].waypoints[0].supplyPoints![0].priceConfidence).toBe("api");
  });

  it("skipValidated=true 时应跳过已 exact+api 的补给点", async () => {
    const attraction: Attraction = {
      name: "西湖",
      nameZh: "西湖",
      nameEn: "West Lake",
      address: "杭州市西湖区",
      location: { latitude: 30.24, longitude: 120.15 },
      visitDuration: 120,
      description: "西湖",
      category: "湖泊",
      ticketPrice: 0,
      reservationRequired: false,
      reservationTips: "",
      routes: [
        {
          id: "test_route",
          name: "测试路线",
          description: "测试",
          duration: 180,
          waypoints: [
            {
              name: "断桥",
              location: { latitude: 30.26, longitude: 120.16 },
              visitDuration: 20,
              isOptional: false,
              supplyPoints: [
                {
                  name: "已验证茶室",
                  type: "cafe",
                  description: "茶",
                  estimatedCost: 30,
                  isRecommended: false,
                  locationAccuracy: "exact",
                  priceConfidence: "api",
                  lastUpdated: "2026-05-18",
                },
              ],
            },
          ],
          tags: ["测试"],
          source: "official",
          difficulty: 1,
        },
      ],
      selectedRouteId: "test_route",
    };

    const { validateRouteSupplies } = await import(
      "../../../services/supply-validation-service.js"
    );
    const result = await enrichAttractionSupplies(attraction, "杭州", { skipValidated: true });
    expect(validateRouteSupplies).not.toHaveBeenCalled();
    expect(result.routes![0].waypoints[0].supplyPoints![0].locationAccuracy).toBe("exact");
  });
});

describe("enrichTripPlanSupplies", () => {
  it("应处理行程中的所有景点", async () => {
    const tripPlan: TripPlan = {
      city: "杭州",
      cities: ["杭州"],
      startDate: "2026-06-01",
      endDate: "2026-06-02",
      days: [
        {
          date: "2026-06-01",
          dayIndex: 1,
          city: "杭州",
          isTransferDay: false,
          transferInfo: "",
          description: "第一天",
          transportation: "",
          accommodation: "",
          attractions: [
            {
              name: "西湖",
              nameZh: "西湖",
              nameEn: "West Lake",
              address: "杭州市西湖区",
              location: { latitude: 30.24, longitude: 120.15 },
              visitDuration: 120,
              description: "西湖",
              category: "湖泊",
              ticketPrice: 0,
              reservationRequired: false,
              reservationTips: "",
              routes: [
                {
                  id: "route1",
                  name: "环湖线",
                  description: "",
                  duration: 180,
                  waypoints: [
                    {
                      name: "断桥",
                      location: { latitude: 30.26, longitude: 120.16 },
                      visitDuration: 20,
                      isOptional: false,
                      supplyPoints: [
                        {
                          name: "茶室",
                          type: "cafe",
                          description: "",
                          estimatedCost: 30,
                          isRecommended: false,
                        },
                      ],
                    },
                  ],
                  tags: ["经典"],
                  source: "official",
                  difficulty: 1,
                },
              ],
            },
          ],
          meals: [],
        },
      ],
      weatherInfo: [],
      overallSuggestions: "",
    };

    const result = await enrichTripPlanSupplies(tripPlan);
    expect(
      result.days[0].attractions[0].routes![0].waypoints[0].supplyPoints![0].locationAccuracy,
    ).toBe("exact");
  });
});

describe("enrichTripPlanSuppliesWithStats", () => {
  it("应返回正确的统计信息", async () => {
    const tripPlan: TripPlan = {
      city: "杭州",
      cities: ["杭州"],
      startDate: "2026-06-01",
      endDate: "2026-06-02",
      days: [
        {
          date: "2026-06-01",
          dayIndex: 1,
          city: "杭州",
          isTransferDay: false,
          transferInfo: "",
          description: "第一天",
          transportation: "",
          accommodation: "",
          attractions: [
            {
              name: "西湖",
              nameZh: "西湖",
              nameEn: "West Lake",
              address: "杭州市西湖区",
              location: { latitude: 30.24, longitude: 120.15 },
              visitDuration: 120,
              description: "西湖",
              category: "湖泊",
              ticketPrice: 0,
              reservationRequired: false,
              reservationTips: "",
              routes: [
                {
                  id: "route1",
                  name: "环湖线",
                  description: "",
                  duration: 180,
                  waypoints: [
                    {
                      name: "断桥",
                      location: { latitude: 30.26, longitude: 120.16 },
                      visitDuration: 20,
                      isOptional: false,
                      supplyPoints: [
                        {
                          name: "茶室A",
                          type: "cafe",
                          description: "",
                          estimatedCost: 30,
                          isRecommended: false,
                        },
                        {
                          name: "茶室B",
                          type: "cafe",
                          description: "",
                          estimatedCost: 40,
                          isRecommended: false,
                        },
                      ],
                    },
                  ],
                  tags: ["经典"],
                  source: "official",
                  difficulty: 1,
                },
              ],
            },
          ],
          meals: [],
        },
      ],
      weatherInfo: [],
      overallSuggestions: "",
    };

    const { tripPlan: enriched, stats } = await enrichTripPlanSuppliesWithStats(tripPlan);
    expect(stats.attractionsProcessed).toBe(1);
    expect(stats.routesProcessed).toBe(1);
    expect(stats.supplyPointsValidated).toBe(2);
    expect(enriched.days[0].attractions[0].routes![0].waypoints[0].supplyPoints).toHaveLength(2);
  });
});
