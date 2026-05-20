/**
 * companion 工具单元测试
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock companion-service
vi.mock("../../../services/companion-service.js", () => ({
  queryTripData: vi.fn(),
}));

import { queryTripData } from "../../../services/companion-service.js";
import { companionQATool } from "../../../tools/companion.js";

const mockQueryTripData = vi.mocked(queryTripData);

describe("companionQATool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const sampleTripPlan = {
    city: "杭州",
    cities: ["杭州"],
    startDate: "2026-05-20",
    endDate: "2026-05-22",
    days: [
      {
        date: "2026-05-20",
        dayIndex: 1,
        city: "杭州",
        attractions: [
          {
            name: "West Lake",
            nameZh: "西湖",
            visitDuration: 120,
            description: "著名景点",
            category: "自然风光",
            ticketPrice: 0,
            reservationRequired: false,
          },
        ],
        transportation: "步行",
        accommodation: "酒店",
        meals: [{ type: "lunch", name: "楼外楼", estimatedCost: 100 }],
      },
    ],
    weatherInfo: [],
  };

  it("应有正确的工具名称", () => {
    expect(companionQATool.name).toBe("query_trip_data");
  });

  it("应有 cheap costTier", () => {
    expect(companionQATool.costTier).toBe("cheap");
  });

  it("应返回问答结果", async () => {
    mockQueryTripData.mockReturnValue({
      found: true,
      answer: "西湖门票免费，建议游览时间2小时。",
      sources: ["attractions"],
    });

    const result = await companionQATool.execute("call-1", {
      question: "西湖门票多少钱？",
      tripPlan: sampleTripPlan,
    });

    expect(mockQueryTripData).toHaveBeenCalledWith({
      question: "西湖门票多少钱？",
      tripPlan: sampleTripPlan,
    });
    expect((result.content[0] as { type: "text"; text: string }).text).toContain("西湖门票免费");
  });

  it("未找到答案时应显示提示", async () => {
    mockQueryTripData.mockReturnValue({
      found: false,
      answer: "抱歉，无法从行程数据中找到答案。",
      sources: [],
    });

    const result = await companionQATool.execute("call-2", {
      question: "附近有电影院吗？",
      tripPlan: sampleTripPlan,
    });

    expect((result.content[0] as { type: "text"; text: string }).text).toContain("抱歉");
  });

  it("应支持多种问题类型", async () => {
    mockQueryTripData.mockReturnValue({
      found: true,
      answer: "今天杭州天气晴朗，气温25°C。",
      sources: ["weather"],
    });

    const result = await companionQATool.execute("call-3", {
      question: "今天天气怎么样？",
      tripPlan: sampleTripPlan,
    });

    expect((result.content[0] as { type: "text"; text: string }).text).toContain("天气");
  });

  it("应支持预算相关问题", async () => {
    mockQueryTripData.mockReturnValue({
      found: true,
      answer: "行程总预算约550元。",
      sources: ["budget"],
    });

    const result = await companionQATool.execute("call-4", {
      question: "这次旅行大概要花多少钱？",
      tripPlan: sampleTripPlan,
    });

    expect((result.content[0] as { type: "text"; text: string }).text).toContain("550");
  });

  it("应支持交通相关问题", async () => {
    mockQueryTripData.mockReturnValue({
      found: true,
      answer: "从酒店到西湖可以步行，约15分钟。",
      sources: ["transport"],
    });

    const result = await companionQATool.execute("call-5", {
      question: "怎么去西湖？",
      tripPlan: sampleTripPlan,
    });

    expect((result.content[0] as { type: "text"; text: string }).text).toContain("步行");
  });

  it("应支持餐厅相关问题", async () => {
    mockQueryTripData.mockReturnValue({
      found: true,
      answer: "午餐推荐楼外楼，预算约100元。",
      sources: ["restaurant"],
    });

    const result = await companionQATool.execute("call-6", {
      question: "中午吃什么？",
      tripPlan: sampleTripPlan,
    });

    expect((result.content[0] as { type: "text"; text: string }).text).toContain("楼外楼");
  });

  it("应返回结构化 details", async () => {
    mockQueryTripData.mockReturnValue({
      found: true,
      answer: "答案内容",
      sources: ["test"],
    });

    const result = await companionQATool.execute("call-7", {
      question: "测试问题",
      tripPlan: sampleTripPlan,
    });

    expect(result.details).toBeDefined();
    expect(result.details.found).toBe(true);
  });
});
