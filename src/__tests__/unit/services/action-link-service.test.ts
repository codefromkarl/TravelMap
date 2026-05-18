/**
 * 行动链接服务单元测试
 */

import { describe, expect, it } from "vitest";
import { enrichTripWithLinks } from "../../../services/action-link-service.js";
import {
  createMockAttraction,
  createMockDayPlan,
  createMockHotel,
  createMockTripPlan,
} from "../../mocks/fixtures.js";

describe("action-link-service", () => {
  describe("enrichTripWithLinks", () => {
    it("为需预约景点生成预约链接", () => {
      const trip = createMockTripPlan({
        days: [
          createMockDayPlan({
            attractions: [
              createMockAttraction({
                nameZh: "故宫博物院",
                reservationRequired: true,
                reservationTips: "需提前在官网预约",
              }),
            ],
          }),
        ],
      });

      const result = enrichTripWithLinks(trip);

      expect(result.days[0].attractions[0].bookingUrl).toBe(
        "https://www.dpm.org.cn/visit/ticket.html",
      );
    });

    it("未知预约景点生成搜索链接", () => {
      const trip = createMockTripPlan({
        days: [
          createMockDayPlan({
            attractions: [
              createMockAttraction({
                nameZh: "某个冷门景点",
                reservationRequired: true,
              }),
            ],
          }),
        ],
      });

      const result = enrichTripWithLinks(trip);

      expect(result.days[0].attractions[0].bookingUrl).toContain("google.com");
      expect(result.days[0].attractions[0].bookingUrl).toContain(
        encodeURIComponent("某个冷门景点"),
      );
    });

    it("不需预约景点不生成 bookingUrl", () => {
      const trip = createMockTripPlan({
        days: [
          createMockDayPlan({
            attractions: [
              createMockAttraction({
                nameZh: "天坛公园",
                reservationRequired: false,
              }),
            ],
          }),
        ],
      });

      const result = enrichTripWithLinks(trip);

      expect(result.days[0].attractions[0].bookingUrl).toBeUndefined();
    });

    it("为酒店生成比价链接", () => {
      const trip = createMockTripPlan({
        days: [
          createMockDayPlan({
            city: "北京",
            hotel: createMockHotel({ name: "北京大酒店" }),
          }),
        ],
      });

      const result = enrichTripWithLinks(trip);

      const links = result.days[0].hotel?.comparisonLinks;
      expect(links).toBeDefined();
      expect(links!.length).toBe(3);

      const platforms = links!.map((l) => l.platform);
      expect(platforms).toContain("Booking.com");
      expect(platforms).toContain("飞猪");
      expect(platforms).toContain("去哪儿");
    });

    it("无酒店时不生成比价链接", () => {
      const day = createMockDayPlan();
      // DayPlan 中 hotel 是可选的
      const { hotel, ...dayWithoutHotel } = day;

      const trip = createMockTripPlan({ days: [dayWithoutHotel as typeof day] });
      const result = enrichTripWithLinks(trip);

      expect(result.days[0].hotel).toBeUndefined();
    });

    it("单城市行程不生成城际交通链接", () => {
      const trip = createMockTripPlan({ cities: ["北京"] });
      const result = enrichTripWithLinks(trip);

      expect(result.flightLinks).toBeUndefined();
    });

    it("多城市行程生成城际交通链接", () => {
      const trip = createMockTripPlan({
        cities: ["北京", "西安"],
        days: [
          createMockDayPlan({ city: "北京", dayIndex: 1 }),
          createMockDayPlan({
            city: "西安",
            dayIndex: 2,
            isTransferDay: true,
          }),
        ],
      });

      const result = enrichTripWithLinks(trip);

      expect(result.flightLinks).toBeDefined();
      expect(result.flightLinks!.length).toBeGreaterThanOrEqual(2);

      const platforms = result.flightLinks!.map((l) => l.platform);
      expect(platforms).toContain("Skyscanner");
      expect(platforms).toContain("携程");
      expect(platforms).toContain("12306");
    });

    it("不修改原始行程对象", () => {
      const trip = createMockTripPlan({
        days: [
          createMockDayPlan({
            attractions: [
              createMockAttraction({
                nameZh: "故宫博物院",
                reservationRequired: true,
              }),
            ],
            hotel: createMockHotel(),
          }),
        ],
      });

      const originalAttr = trip.days[0].attractions[0];
      const originalHotel = trip.days[0].hotel;

      enrichTripWithLinks(trip);

      // 原始对象不被修改
      expect(originalAttr.bookingUrl).toBeUndefined();
      expect(originalHotel?.comparisonLinks).toBeUndefined();
    });

    it("正确处理三城市行程", () => {
      const trip = createMockTripPlan({
        cities: ["北京", "西安", "成都"],
        days: [
          createMockDayPlan({ city: "北京", dayIndex: 1 }),
          createMockDayPlan({ city: "西安", dayIndex: 2, isTransferDay: true }),
          createMockDayPlan({ city: "成都", dayIndex: 3, isTransferDay: true }),
        ],
      });

      const result = enrichTripWithLinks(trip);

      // 两段城际交通：北京→西安、西安→成都
      expect(result.flightLinks).toBeDefined();
      const labels = result.flightLinks!.map((l) => l.label);
      expect(labels.some((l) => l.includes("北京") && l.includes("西安"))).toBe(true);
      expect(labels.some((l) => l.includes("西安") && l.includes("成都"))).toBe(true);
    });
  });
});
