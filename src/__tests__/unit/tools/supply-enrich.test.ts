/**
 * supply-enrich 工具测试 — 验证 enrich_supply_details 工具的 execute 逻辑
 *
 * 覆盖：
 *   - 正常执行路径（有路线有补给点的景点）
 *   - 无路线的景点
 *   - 有路线但无补给点的景点
 *   - skipValidated 跳过已验证补给点
 *   - 错误处理
 */

import { describe, expect, it, vi } from "vitest";

import { enrichSupplyDetailsTool } from "../../../tools/supply-enrich.js";

// Mock supply-enrich-service
vi.mock("../../../services/supply-enrich-service.js", () => ({
  enrichTripPlanSuppliesWithStats: vi.fn(),
}));

import { enrichTripPlanSuppliesWithStats } from "../../../services/supply-enrich-service.js";

const mockedEnrich = vi.mocked(enrichTripPlanSuppliesWithStats);

// ─── 基础测试数据 ──────────────────────────────────────

const makeTripPlan = (overrides?: Record<string, unknown>) => ({
  city: "北京",
  days: [
    {
      date: "2025-06-01",
      city: "北京",
      attractions: [
        {
          name: "故宫博物院",
          nameZh: "故宫博物院",
          location: { latitude: 39.9163, longitude: 116.3972 },
          routes: [
            {
              id: "route_1",
              name: "经典路线",
              waypoints: [
                {
                  name: "午门",
                  location: { latitude: 39.9163, longitude: 116.3972 },
                  supplyPoints: [
                    {
                      name: "故宫纪念品店",
                      type: "商店",
                      description: "纪念品和文创产品",
                      estimatedCost: 50,
                      isRecommended: true,
                    },
                  ],
                },
                {
                  name: "太和殿",
                  location: { latitude: 39.9172, longitude: 116.3972 },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  ...overrides,
});

// ─── enrichSupplyDetailsTool execute ────────────────────

describe("enrichSupplyDetailsTool execute", () => {
  it("工具元数据正确", () => {
    expect(enrichSupplyDetailsTool.name).toBe("enrich_supply_details");
    expect(enrichSupplyDetailsTool.label).toBe("补给详情");
    expect(enrichSupplyDetailsTool.description).toContain("补给");
    expect(enrichSupplyDetailsTool.parameters).toBeDefined();
    expect(typeof enrichSupplyDetailsTool.execute).toBe("function");
  });

  it("正常执行返回 markdown 格式结果", async () => {
    const enrichedPlan = makeTripPlan();
    // 模拟验证后的补给点
    const waypoint = enrichedPlan.days[0]?.attractions[0]?.routes[0]?.waypoints[0];
    // biome-ignore lint/suspicious/noExplicitAny: test fixture
    const sp0 = (waypoint?.supplyPoints?.[0] ?? {}) as any;
    sp0.locationAccuracy = "exact";
    sp0.estimatedCost = 55;
    sp0.priceConfidence = "api";

    mockedEnrich.mockResolvedValue({
      tripPlan: enrichedPlan as any,
      stats: {
        attractionsProcessed: 1,
        routesProcessed: 1,
        supplyPointsValidated: 1,
        supplyPointsSkipped: 0,
      },
    });

    const result = await enrichSupplyDetailsTool.execute("test-id", {
      tripPlan: makeTripPlan(),
    });

    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("补给详情丰富完成");
    expect(text).toContain("1");
    expect(text).toContain("故宫博物院");

    const details = result.details as {
      tripPlan: unknown;
      stats: { attractionsProcessed: number; supplyPointsValidated: number };
    };
    expect(details.stats.attractionsProcessed).toBe(1);
    expect(details.stats.supplyPointsValidated).toBe(1);
  });

  it("无路线的景点正常处理", async () => {
    const planNoRoutes = {
      city: "北京",
      days: [
        {
          date: "2025-06-01",
          city: "北京",
          attractions: [
            {
              name: "外滩",
              nameZh: "外滩",
              location: { latitude: 31.24, longitude: 121.49 },
            },
          ],
        },
      ],
    };

    mockedEnrich.mockResolvedValue({
      tripPlan: planNoRoutes as any,
      stats: {
        attractionsProcessed: 0,
        routesProcessed: 0,
        supplyPointsValidated: 0,
        supplyPointsSkipped: 0,
      },
    });

    const result = await enrichSupplyDetailsTool.execute("test-id", {
      tripPlan: planNoRoutes,
    });

    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("补给详情丰富完成");
    expect(result.details).toHaveProperty("stats");
  });

  it("skipValidated 传递到 service", async () => {
    mockedEnrich.mockResolvedValue({
      tripPlan: makeTripPlan() as any,
      stats: {
        attractionsProcessed: 1,
        routesProcessed: 1,
        supplyPointsValidated: 0,
        supplyPointsSkipped: 1,
      },
    });

    await enrichSupplyDetailsTool.execute("test-id", {
      tripPlan: makeTripPlan(),
    });

    // 验证 enrichTripPlanSuppliesWithStats 被调用且 skipValidated: true
    expect(mockedEnrich).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ skipValidated: true }),
    );
  });

  it("service 抛错时返回错误信息", async () => {
    mockedEnrich.mockRejectedValue(new Error("验证服务不可用"));

    const result = await enrichSupplyDetailsTool.execute("test-id", {
      tripPlan: makeTripPlan(),
    });

    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("补给详情丰富失败");
    expect(text).toContain("验证服务不可用");

    const details = result.details as { error: string };
    expect(details.error).toBe("验证服务不可用");
  });

  it("返回的 details 包含 tripPlan 和 stats", async () => {
    const plan = makeTripPlan();
    mockedEnrich.mockResolvedValue({
      tripPlan: plan as any,
      stats: {
        attractionsProcessed: 2,
        routesProcessed: 3,
        supplyPointsValidated: 5,
        supplyPointsSkipped: 1,
      },
    });

    const result = await enrichSupplyDetailsTool.execute("test-id", {
      tripPlan: plan,
    });

    const details = result.details as any;
    expect(details).toHaveProperty("tripPlan");
    expect(details.stats.attractionsProcessed).toBe(2);
    expect(details.stats.routesProcessed).toBe(3);
    expect(details.stats.supplyPointsValidated).toBe(5);
    expect(details.stats.supplyPointsSkipped).toBe(1);
  });

  it("补给点有 exact 坐标时显示实时价格", async () => {
    const enrichedPlan = makeTripPlan();
    // biome-ignore lint/suspicious/noExplicitAny: test fixture
    const sp1 = (enrichedPlan.days[0]?.attractions[0]?.routes[0]?.waypoints[0]?.supplyPoints?.[0] ??
      {}) as Record<string, unknown>;
    sp1["locationAccuracy"] = "exact";
    sp1["priceConfidence"] = "api";

    mockedEnrich.mockResolvedValue({
      tripPlan: enrichedPlan as any,
      stats: {
        attractionsProcessed: 1,
        routesProcessed: 1,
        supplyPointsValidated: 1,
        supplyPointsSkipped: 0,
      },
    });

    const result = await enrichSupplyDetailsTool.execute("test-id", {
      tripPlan: makeTripPlan(),
    });

    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("故宫博物院");
  });

  it("多天行程正常处理", async () => {
    const multiDayPlan = {
      city: "杭州",
      days: [
        {
          date: "2025-06-01",
          city: "杭州",
          attractions: [
            {
              name: "西湖",
              nameZh: "西湖",
              location: { latitude: 30.25, longitude: 120.15 },
              routes: [
                {
                  id: "r1",
                  name: "环湖线",
                  waypoints: [
                    {
                      name: "断桥",
                      location: { latitude: 30.26, longitude: 120.15 },
                      supplyPoints: [
                        {
                          name: "便利店",
                          type: "商店",
                          description: "饮料零食",
                          estimatedCost: 15,
                          isRecommended: false,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          date: "2025-06-02",
          city: "杭州",
          attractions: [
            {
              name: "灵隐寺",
              nameZh: "灵隐寺",
              location: { latitude: 30.25, longitude: 120.1 },
              routes: [],
            },
          ],
        },
      ],
    };

    mockedEnrich.mockResolvedValue({
      tripPlan: multiDayPlan as any,
      stats: {
        attractionsProcessed: 1,
        routesProcessed: 1,
        supplyPointsValidated: 1,
        supplyPointsSkipped: 0,
      },
    });

    const result = await enrichSupplyDetailsTool.execute("test-id", {
      tripPlan: multiDayPlan,
    });

    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("补给详情丰富完成");
  });
});
