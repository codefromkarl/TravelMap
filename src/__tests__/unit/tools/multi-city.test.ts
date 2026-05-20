/**
 * multi-city 工具单元测试
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock multi-city-service
vi.mock("../../../services/multi-city-service.js", () => ({
  planMultiCityRoute: vi.fn(),
}));

import { planMultiCityRoute } from "../../../services/multi-city-service.js";
import { planMultiCityTool } from "../../../tools/multi-city.js";

const mockPlanMultiCityRoute = vi.mocked(planMultiCityRoute);

describe("planMultiCityTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应有正确的工具名称", () => {
    expect(planMultiCityTool.name).toBe("plan_multi_city");
  });

  it("应生成多城市行程框架", async () => {
    mockPlanMultiCityRoute.mockReturnValue({
      cityStays: [
        { city: "杭州", days: 2 },
        { city: "上海", days: 3 },
      ],
      totalDays: 5,
      totalTransportCost: 300,
      transfers: [
        {
          from: "杭州",
          to: "上海",
          date: "2026-05-22",
          transport: { mode: "高铁", hours: 1, cost: 150 },
        },
      ],
      dayOutline: [
        { dayIndex: 0, date: "2026-05-20", city: "杭州", isTransferDay: false },
        { dayIndex: 1, date: "2026-05-21", city: "杭州", isTransferDay: false },
        {
          dayIndex: 2,
          date: "2026-05-22",
          city: "上海",
          isTransferDay: true,
          transferInfo: "杭州→上海 高铁",
        },
        { dayIndex: 3, date: "2026-05-23", city: "上海", isTransferDay: false },
        { dayIndex: 4, date: "2026-05-24", city: "上海", isTransferDay: false },
      ],
    });

    const result = await planMultiCityTool.execute("call-1", {
      cities: [
        { city: "杭州", days: 2 },
        { city: "上海", days: 3 },
      ],
      startDate: "2026-05-20",
    });

    expect(mockPlanMultiCityRoute).toHaveBeenCalled();
    expect(result.details.totalDays).toBe(5);
    expect((result.content[0] as { type: "text"; text: string }).text).toContain("多城市行程框架");
    expect((result.content[0] as { type: "text"; text: string }).text).toContain("杭州");
    expect((result.content[0] as { type: "text"; text: string }).text).toContain("上海");
  });

  it("空城市列表应返回提示", async () => {
    const result = await planMultiCityTool.execute("call-2", {
      cities: [],
      startDate: "2026-05-20",
    });

    expect((result.content[0] as { type: "text"; text: string }).text).toContain(
      "请至少指定一个城市",
    );
    expect(mockPlanMultiCityRoute).not.toHaveBeenCalled();
  });

  it("单城市应显示无城际移动", async () => {
    mockPlanMultiCityRoute.mockReturnValue({
      cityStays: [{ city: "北京", days: 3 }],
      totalDays: 3,
      totalTransportCost: 0,
      transfers: [],
      dayOutline: [
        { dayIndex: 0, date: "2026-05-20", city: "北京", isTransferDay: false },
        { dayIndex: 1, date: "2026-05-21", city: "北京", isTransferDay: false },
        { dayIndex: 2, date: "2026-05-22", city: "北京", isTransferDay: false },
      ],
    });

    const result = await planMultiCityTool.execute("call-3", {
      cities: [{ city: "北京", days: 3 }],
      startDate: "2026-05-20",
    });

    expect((result.content[0] as { type: "text"; text: string }).text).toContain("0 个城际移动日");
  });

  it("应显示城际交通详情", async () => {
    mockPlanMultiCityRoute.mockReturnValue({
      cityStays: [
        { city: "北京", days: 2 },
        { city: "西安", days: 2 },
      ],
      totalDays: 6,
      totalTransportCost: 500,
      transfers: [
        {
          from: "北京",
          to: "西安",
          date: "2026-05-22",
          transport: { mode: "高铁", hours: 4.5, cost: 500 },
        },
      ],
      dayOutline: [
        { dayIndex: 0, date: "2026-05-20", city: "北京", isTransferDay: false },
        { dayIndex: 1, date: "2026-05-21", city: "北京", isTransferDay: false },
        {
          dayIndex: 2,
          date: "2026-05-22",
          city: "西安",
          isTransferDay: true,
          transferInfo: "北京→西安 高铁",
        },
        { dayIndex: 3, date: "2026-05-23", city: "西安", isTransferDay: false },
      ],
    });

    const result = await planMultiCityTool.execute("call-4", {
      cities: [
        { city: "北京", days: 2 },
        { city: "西安", days: 2 },
      ],
      startDate: "2026-05-20",
    });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("城际交通");
    expect(text).toContain("北京 → 西安");
    expect(text).toContain("高铁");
  });

  it("应显示总天数和交通费用", async () => {
    mockPlanMultiCityRoute.mockReturnValue({
      cityStays: [
        { city: "上海", days: 3 },
        { city: "成都", days: 4 },
      ],
      totalDays: 7,
      totalTransportCost: 800,
      transfers: [],
      dayOutline: [],
    });

    const result = await planMultiCityTool.execute("call-5", {
      cities: [
        { city: "上海", days: 3 },
        { city: "成都", days: 4 },
      ],
      startDate: "2026-05-20",
    });

    expect(result.details.totalDays).toBe(7);
    expect(result.details.totalTransportCost).toBe(800);
  });

  it("应显示路线概览", async () => {
    mockPlanMultiCityRoute.mockReturnValue({
      cityStays: [
        { city: "杭州", days: 2 },
        { city: "苏州", days: 2 },
      ],
      totalDays: 4,
      totalTransportCost: 200,
      transfers: [],
      dayOutline: [],
    });

    const result = await planMultiCityTool.execute("call-6", {
      cities: [
        { city: "杭州", days: 2 },
        { city: "苏州", days: 2 },
      ],
      startDate: "2026-05-20",
    });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("杭州(2天) → 苏州(2天)");
  });
});
