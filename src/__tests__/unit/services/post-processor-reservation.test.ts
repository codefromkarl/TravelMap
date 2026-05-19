import { describe, expect, it } from "vitest";
import { postProcessTripPlan } from "../../../services/post-processor.js";
import type { TripPlan } from "../../../types/trip.js";

/** 构建最小测试用行程 */
function makeTripPlan(): TripPlan {
  return {
    city: "北京",
    cities: ["北京"],
    startDate: "2026-07-15",
    endDate: "2026-07-17",
    days: [
      {
        date: "2026-07-15",
        dayIndex: 1,
        city: "北京",
        isTransferDay: false,
        transferInfo: "",
        description: "",
        transportation: "地铁",
        accommodation: "如家酒店",
        attractions: [
          {
            name: "故宫博物院",
            nameZh: "故宫博物院",
            nameEn: "The Palace Museum",
            address: "北京市东城区景山前街4号",
            location: { latitude: 39.9163, longitude: 116.3972 },
            visitDuration: 180,
            description: "中国明清两代的皇家宫殿",
            category: "博物馆",
            ticketPrice: 60,
            reservationRequired: true,
            reservationTips: "需提前7天预约",
          },
          {
            name: "颐和园",
            nameZh: "颐和园",
            nameEn: "Summer Palace",
            address: "北京市海淀区",
            location: { latitude: 39.9999, longitude: 116.2755 },
            visitDuration: 180,
            description: "清代皇家园林",
            category: "公园",
            ticketPrice: 30,
            reservationRequired: false,
            reservationTips: "",
          },
        ],
        meals: [
          { type: "breakfast", name: "豆浆油条", description: "", estimatedCost: 15 },
          { type: "lunch", name: "炸酱面", description: "", estimatedCost: 30 },
          { type: "dinner", name: "烤鸭", description: "", estimatedCost: 150 },
        ],
        hotel: {
          name: "如家酒店",
          address: "北京市东城区",
          priceRange: "¥200-300",
          rating: 4.2,
          estimatedCost: 250,
        },
      },
    ],
    weatherInfo: [],
    overallSuggestions: "",
  };
}

describe("post-processor integration — reservation timeline", () => {
  it("预约时间轴在管线中被自动计算", async () => {
    const trip = makeTripPlan();
    const result = await postProcessTripPlan(trip, {
      enableActionLinks: true,
    });

    // 故宫需要预约 → 应有 reservationTimeline
    const gugong = result.tripPlan.days[0].attractions.find((a) => a.nameZh === "故宫博物院");
    expect(gugong).toBeDefined();
    expect(gugong!.reservationTimeline).toBeDefined();
    expect(gugong!.reservationTimeline!.advanceDays).toBe(7);
    expect(gugong!.reservationTimeline!.bookingOpenDate).toBe("2026-07-08");
    expect(gugong!.reservationTimeline!.officialUrl).toContain("dpm.org.cn");

    // 颐和园不需要预约 → 无 reservationTimeline
    const yiheyuan = result.tripPlan.days[0].attractions.find((a) => a.nameZh === "颐和园");
    expect(yiheyuan!.reservationTimeline).toBeUndefined();
  });

  it("预约时间轴在预算计算之前执行", async () => {
    const trip = makeTripPlan();
    const result = await postProcessTripPlan(trip, {
      enableActionLinks: true,
    });

    // 确认预算也计算了（管线未中断）
    expect(result.budgetCalculated).toBe(true);
    expect(result.tripPlan.budget).toBeDefined();
  });

  it("预约时间轴在链接生成之前执行（bookingUrl 由知识库填充）", async () => {
    const trip = makeTripPlan();
    const result = await postProcessTripPlan(trip, {
      enableActionLinks: true,
    });

    // 故宫 bookingUrl 应被知识库填充
    const gugong = result.tripPlan.days[0].attractions.find((a) => a.nameZh === "故宫博物院");
    expect(gugong!.bookingUrl).toContain("dpm.org.cn");

    // 链接生成也成功
    expect(result.linksGenerated).toBe(true);
  });

  it("关闭 actionLinks 仍计算预约时间轴", async () => {
    const trip = makeTripPlan();
    const result = await postProcessTripPlan(trip, {
      enableActionLinks: false,
    });

    // 预约时间轴仍被计算
    const gugong = result.tripPlan.days[0].attractions.find((a) => a.nameZh === "故宫博物院");
    expect(gugong!.reservationTimeline).toBeDefined();

    // 链接未生成
    expect(result.linksGenerated).toBe(false);
  });
});
