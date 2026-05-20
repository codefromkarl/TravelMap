/**
 * action-links 工具单元测试
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock action-link-service
vi.mock("../../../services/action-link-service.js", () => ({
  enrichTripWithLiveLinks: vi.fn(),
}));

import { enrichTripWithLiveLinks } from "../../../services/action-link-service.js";
import { generateActionLinksTool } from "../../../tools/action-links.js";

const mockEnrichTrip = vi.mocked(enrichTripWithLiveLinks) as any;

describe("generateActionLinksTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseTripPlan: Record<string, any> = {
    city: "杭州",
    cities: ["杭州"],
    startDate: "2026-05-20",
    endDate: "2026-05-22",
    days: [
      {
        date: "2026-05-20",
        dayIndex: 1,
        city: "杭州",
        attractions: [{ name: "West Lake", nameZh: "西湖", reservationRequired: false }],
      },
    ],
  };

  it("应有正确的工具名称", () => {
    expect(generateActionLinksTool.name).toBe("generate_action_links");
  });

  it("应返回链接统计", async () => {
    mockEnrichTrip.mockResolvedValue({
      ...baseTripPlan,
      days: [
        {
          ...baseTripPlan.days[0],
          attractions: [
            {
              name: "West Lake",
              nameZh: "西湖",
              bookingUrl: "https://example.com",
            },
          ],
        },
      ],
    });

    const result = await generateActionLinksTool.execute("call-1", {
      tripPlan: baseTripPlan as any,
    });

    expect(mockEnrichTrip).toHaveBeenCalledWith(baseTripPlan);
    expect(result.details.linkCount).toBeGreaterThanOrEqual(0);
    expect((result.content[0] as { type: "text"; text: string }).text).toContain("行动链接");
  });

  it("应包含预约链接", async () => {
    mockEnrichTrip.mockResolvedValue({
      ...baseTripPlan,
      days: [
        {
          ...baseTripPlan.days[0],
          attractions: [
            {
              name: "Museum",
              nameZh: "博物馆",
              reservationRequired: true,
              bookingUrl: "https://museum.example.com/book",
              reservationTimeline: {
                advanceDays: 3,
                releaseTime: "09:00",
                bookingOpenDate: "2026-05-17",
                urgency: "normal",
              },
            },
          ],
        },
      ],
    });

    const result = await generateActionLinksTool.execute("call-2", {
      tripPlan: baseTripPlan as any,
    });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("景点预约");
    expect(text).toContain("博物馆");
    expect(text).toContain("预约链接");
  });

  it("应包含酒店比价链接", async () => {
    mockEnrichTrip.mockResolvedValue({
      ...baseTripPlan,
      days: [
        {
          ...baseTripPlan.days[0],
          attractions: [],
          hotel: {
            name: "杭州大酒店",
            address: "杭州市西湖区",
            priceRange: "400-600",
            rating: 4.5,
            estimatedCost: 500,
            comparisonLinks: [
              { platform: "Booking", url: "https://booking.com", label: "官网", price: 500 },
              { platform: "飞猪", url: "https://fliggy.com", label: "飞猪", price: 480 },
            ],
          },
        },
      ],
    });

    const result = await generateActionLinksTool.execute("call-3", {
      tripPlan: baseTripPlan as any,
    });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("酒店比价");
    expect(text).toContain("杭州大酒店");
  });

  it("应包含城际交通链接", async () => {
    mockEnrichTrip.mockResolvedValue({
      ...baseTripPlan,
      days: baseTripPlan.days,
      flightLinks: [
        {
          platform: "携程",
          url: "https://ctrip.com",
          label: "高铁",
          price: 150,
          source: "template",
        },
      ],
    });

    const result = await generateActionLinksTool.execute("call-4", {
      tripPlan: baseTripPlan as any,
    });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("城际交通");
  });

  it("应处理空行程", async () => {
    mockEnrichTrip.mockResolvedValue({
      ...baseTripPlan,
      days: [],
    });

    const result = await generateActionLinksTool.execute("call-5", {
      tripPlan: baseTripPlan as any,
    });

    expect(result.details.linkCount).toBe(0);
    expect((result.content[0] as { type: "text"; text: string }).text).toContain("行动链接");
  });

  it("应显示实时价格标记", async () => {
    mockEnrichTrip.mockResolvedValue({
      ...baseTripPlan,
      days: [
        {
          ...baseTripPlan.days[0],
          attractions: [],
          hotel: {
            name: "酒店",
            address: "杭州市",
            priceRange: "400-600",
            rating: 4.0,
            estimatedCost: 500,
            comparisonLinks: [
              {
                platform: "trvl",
                url: "https://trvl.com",
                label: "实时",
                price: 600,
                source: "trvl",
              },
            ],
          },
        },
      ],
    });

    const result = await generateActionLinksTool.execute("call-6", {
      tripPlan: baseTripPlan as any,
    });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("实时");
  });

  it("应显示预约紧急程度", async () => {
    mockEnrichTrip.mockResolvedValue({
      ...baseTripPlan,
      days: [
        {
          ...baseTripPlan.days[0],
          attractions: [
            {
              name: "Attraction",
              nameZh: "景点",
              reservationRequired: true,
              bookingUrl: "https://example.com",
              reservationTimeline: {
                advanceDays: 7,
                bookingOpenDate: "2026-05-13",
                urgency: "urgent",
                altChannels: [{ platform: "飞猪", url: "https://fliggy.com" }],
              },
            },
          ],
        },
      ],
    });

    const result = await generateActionLinksTool.execute("call-7", {
      tripPlan: baseTripPlan as any,
    });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("🟡");
  });
});
