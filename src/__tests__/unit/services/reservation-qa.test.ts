import { describe, expect, it } from "vitest";
import { queryTripData } from "../../../services/companion-service.js";
import type { TripPlan } from "../../../types/trip.js";

/** 构建最小测试用行程 */
function makeTripPlan(overrides: Partial<TripPlan> = {}): TripPlan {
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
        transportation: "",
        accommodation: "",
        attractions: [
          {
            name: "故宫博物院",
            nameZh: "故宫博物院",
            nameEn: "The Palace Museum",
            address: "北京市东城区",
            location: { latitude: 39.9163, longitude: 116.3972 },
            visitDuration: 180,
            description: "明清皇家宫殿",
            category: "博物馆",
            ticketPrice: 60,
            reservationRequired: true,
            reservationTips: "需提前7天预约",
            bookingUrl: "https://www.dpm.org.cn/visit/ticket.html",
            reservationTimeline: {
              advanceDays: 7,
              releaseTime: "20:00",
              bookingOpenDate: "2026-07-08",
              urgency: "expired",
              officialUrl: "https://www.dpm.org.cn/visit/ticket.html",
              altChannels: [
                { platform: "美团", url: "https://www.meituan.com/" },
              ],
            },
          },
          {
            name: "天坛公园",
            nameZh: "天坛公园",
            nameEn: "Temple of Heaven",
            address: "北京市东城区",
            location: { latitude: 39.8822, longitude: 116.4066 },
            visitDuration: 120,
            description: "明清祭祀场所",
            category: "公园",
            ticketPrice: 34,
            reservationRequired: true,
            reservationTips: "建议提前1天预约",
            bookingUrl: "https://www.tiantanpark.com/",
          },
        ],
        meals: [],
        hotel: {
          name: "如家酒店",
          address: "北京市",
          priceRange: "¥200-300",
          rating: 4.2,
          estimatedCost: 250,
        },
      },
      {
        date: "2026-07-16",
        dayIndex: 2,
        city: "北京",
        isTransferDay: false,
        transferInfo: "",
        description: "",
        transportation: "",
        accommodation: "",
        attractions: [
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
        meals: [],
      },
    ],
    weatherInfo: [],
    overallSuggestions: "",
    ...overrides,
  };
}

describe("companion-service reservation QA", () => {
  describe("reservation_timeline — 预约时间线查询", () => {
    it("查询故宫什么时候抢票", () => {
      const result = queryTripData({
        question: "故宫什么时候抢票？",
        tripPlan: makeTripPlan(),
      });

      expect(result.found).toBe(true);
      expect(result.answer).toContain("提前 7 天");
      expect(result.answer).toContain("20:00");
      expect(result.answer).toContain("2026-07-08");
      expect(result.answer).toContain("dpm.org.cn");
    });

    it("查询提前几天预约", () => {
      const result = queryTripData({
        question: "天坛提前几天预约？",
        tripPlan: makeTripPlan(),
      });

      expect(result.found).toBe(true);
      // 天坛没有 reservationTimeline，应该返回通用建议
      expect(result.answer).toContain("天坛");
    });

    it("查不存在的景点预约时间", () => {
      const result = queryTripData({
        question: "西湖什么时候抢票？",
        tripPlan: makeTripPlan(),
      });

      // 西湖不在行程中，matchedAttractions 为空
      expect(result.answer).toContain("没有");
    });
  });

  describe("reservation_status — 预约清单查询", () => {
    it("哪些景点需要预约", () => {
      const result = queryTripData({
        question: "哪些景点需要预约？",
        tripPlan: makeTripPlan(),
      });

      expect(result.found).toBe(true);
      expect(result.answer).toContain("预约清单");
      expect(result.answer).toContain("故宫博物院");
      expect(result.answer).toContain("天坛公园");
      // 颐和园不需要预约，不应该出现
      expect(result.answer).not.toContain("颐和园");
    });

    it("预约清单含时间轴信息", () => {
      const result = queryTripData({
        question: "预约清单",
        tripPlan: makeTripPlan(),
      });

      expect(result.answer).toContain("2026-07-08"); // bookingOpenDate
      expect(result.answer).toContain("20:00"); // releaseTime
      // 有紧急度标记
      expect(result.answer).toMatch(/🔴|🟡|🟢/);
    });

    it("全部无需预约时的回答", () => {
      const trip = makeTripPlan({
        days: [
          {
            date: "2026-07-15",
            dayIndex: 1,
            city: "杭州",
            isTransferDay: false,
            transferInfo: "",
            description: "",
            transportation: "",
            accommodation: "",
            attractions: [
              {
                name: "西湖",
                nameZh: "西湖",
                nameEn: "West Lake",
                address: "杭州市",
                location: { latitude: 30.25, longitude: 120.15 },
                visitDuration: 180,
                description: "杭州西湖",
                category: "公园",
                ticketPrice: 0,
                reservationRequired: false,
                reservationTips: "",
              },
            ],
            meals: [],
          },
        ],
      });

      const result = queryTripData({
        question: "预约清单",
        tripPlan: trip,
      });

      expect(result.answer).toContain("没有需要预约");
    });
  });

  describe("reservation — 基础预约查询（不变）", () => {
    it("查询故宫是否需要预约", () => {
      const result = queryTripData({
        question: "故宫需要预约吗？",
        tripPlan: makeTripPlan(),
      });

      expect(result.found).toBe(true);
      expect(result.answer).toContain("需要预约");
      expect(result.answer).toContain("dpm.org.cn");
    });
  });
});
