import { describe, expect, it } from "vitest";
import {
  calcReservationTimeline,
  enrichReservationTimeline,
} from "../../../services/reservation-timeline-service.js";
import type { Attraction, DayPlan } from "../../../types/trip.js";

/** 构建测试用景点 */
function makeAttraction(overrides: Partial<Attraction> = {}): Attraction {
  return {
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
    ...overrides,
  };
}

/** 构建测试用天 */
function makeDay(overrides: Partial<DayPlan> = {}): DayPlan {
  return {
    date: "2026-07-15",
    dayIndex: 1,
    city: "北京",
    isTransferDay: false,
    transferInfo: "",
    description: "",
    transportation: "",
    accommodation: "",
    attractions: [makeAttraction()],
    meals: [],
    ...overrides,
  };
}

describe("reservation-timeline-service", () => {
  describe("enrichReservationTimeline", () => {
    it("为需预约景点计算时间轴", () => {
      const days = [makeDay()];
      const result = enrichReservationTimeline(days, "2026-07-01");

      expect(result[0].attractions[0].reservationTimeline).toBeDefined();
      const tl = result[0].attractions[0].reservationTimeline!;
      expect(tl.advanceDays).toBe(7); // 故宫提前7天
      expect(tl.releaseTime).toBe("20:00");
      expect(tl.bookingOpenDate).toBe("2026-07-08"); // 7/15 - 7天
      expect(tl.officialUrl).toContain("dpm.org.cn");
    });

    it("非预约景点不受影响", () => {
      const days = [makeDay({
        attractions: [makeAttraction({
          nameZh: "西湖",
          name: "西湖",
          reservationRequired: false,
          reservationTips: "",
        })],
      })];
      const result = enrichReservationTimeline(days, "2026-07-01");

      expect(result[0].attractions[0].reservationTimeline).toBeUndefined();
    });

    it("紧急度：已过预约窗口 → expired", () => {
      // 故宫7/15游玩，需提前7天 → 7/8开放预约
      // today = 7/10 → 已过开放日 → expired
      const days = [makeDay()];
      const result = enrichReservationTimeline(days, "2026-07-10");

      const tl = result[0].attractions[0].reservationTimeline!;
      expect(tl.urgency).toBe("expired");
    });

    it("紧急度：即将开启 → urgent", () => {
      // 故宫7/15游玩，7/8开放预约
      // today = 7/7 → 还差1天 → urgent
      const days = [makeDay()];
      const result = enrichReservationTimeline(days, "2026-07-07");

      const tl = result[0].attractions[0].reservationTimeline!;
      expect(tl.urgency).toBe("urgent");
    });

    it("紧急度：尚早 → normal", () => {
      // today = 6/20 → 还差18天 → normal
      const days = [makeDay()];
      const result = enrichReservationTimeline(days, "2026-06-20");

      const tl = result[0].attractions[0].reservationTimeline!;
      expect(tl.urgency).toBe("normal");
    });

    it("旺季使用 peakAdvanceDays", () => {
      // 故宫旺季(7月) peakAdvanceDays=7
      // 默认 advanceDays=7, 所以一致。用颐和园测试（淡季1天, 旺季3天）
      const days = [makeDay({
        attractions: [makeAttraction({
          nameZh: "颐和园",
          name: "颐和园",
          reservationRequired: true,
          reservationTips: "需提前预约",
        })],
      })];
      // 7月 = 旺季
      const result = enrichReservationTimeline(days, "2026-06-20");

      const tl = result[0].attractions[0].reservationTimeline!;
      expect(tl.advanceDays).toBe(3); // 旺季 advanceDays
      expect(tl.bookingOpenDate).toBe("2026-07-12"); // 7/15 - 3天
    });

    it("淡季使用基础 advanceDays", () => {
      const days = [makeDay({
        date: "2026-12-15", // 12月 = 淡季
        attractions: [makeAttraction({
          nameZh: "颐和园",
          name: "颐和园",
          reservationRequired: true,
          reservationTips: "需提前预约",
        })],
      })];
      const result = enrichReservationTimeline(days, "2026-12-01");

      const tl = result[0].attractions[0].reservationTimeline!;
      expect(tl.advanceDays).toBe(1); // 淡季基础 advanceDays
      expect(tl.bookingOpenDate).toBe("2026-12-14"); // 12/15 - 1天
    });

    it("知识库中不存在的景点不受影响", () => {
      const days = [makeDay({
        attractions: [makeAttraction({
          nameZh: "某个不存在的景点ABC",
          name: "某个不存在的景点ABC",
          reservationRequired: true,
          reservationTips: "需预约",
        })],
      })];
      const result = enrichReservationTimeline(days, "2026-07-01");

      expect(result[0].attractions[0].reservationTimeline).toBeUndefined();
    });

    it("bookingUrl 使用知识库 officialUrl 填充", () => {
      const days = [makeDay({
        attractions: [makeAttraction({ bookingUrl: undefined })],
      })];
      const result = enrichReservationTimeline(days, "2026-07-01");

      expect(result[0].attractions[0].bookingUrl).toContain("dpm.org.cn");
    });

    it("保留已有的 bookingUrl（不覆盖）", () => {
      const days = [makeDay({
        attractions: [makeAttraction({ bookingUrl: "https://existing.url" })],
      })];
      const result = enrichReservationTimeline(days, "2026-07-01");

      expect(result[0].attractions[0].bookingUrl).toBe("https://existing.url");
    });

    it("多天多景点各自独立计算", () => {
      const days = [
        makeDay({
          date: "2026-07-15",
          attractions: [makeAttraction({ nameZh: "故宫博物院", name: "故宫博物院" })],
        }),
        makeDay({
          date: "2026-07-16",
          dayIndex: 2,
          attractions: [makeAttraction({ nameZh: "颐和园", name: "颐和园" })],
        }),
      ];
      const result = enrichReservationTimeline(days, "2026-07-01");

      const tl1 = result[0].attractions[0].reservationTimeline!;
      const tl2 = result[1].attractions[0].reservationTimeline!;

      expect(tl1.bookingOpenDate).toBe("2026-07-08"); // 故宫提前7天
      expect(tl2.bookingOpenDate).toBe("2026-07-13"); // 颐和园旺季提前3天
    });

    it("包含备选渠道信息", () => {
      const days = [makeDay()]; // 故宫有 altChannels
      const result = enrichReservationTimeline(days, "2026-07-01");

      const tl = result[0].attractions[0].reservationTimeline!;
      expect(tl.altChannels).toBeDefined();
      expect(tl.altChannels!.length).toBeGreaterThan(0);
      expect(tl.altChannels![0].platform).toBe("美团");
    });
  });

  describe("calcReservationTimeline — 单景点计算", () => {
    it("为单个景点计算时间轴", () => {
      const attraction = makeAttraction();
      const tl = calcReservationTimeline(attraction, "2026-07-15", "2026-07-01");

      expect(tl).toBeDefined();
      expect(tl!.advanceDays).toBe(7);
      expect(tl!.bookingOpenDate).toBe("2026-07-08");
    });

    it("非预约景点返回 undefined", () => {
      const attraction = makeAttraction({ reservationRequired: false, reservationTips: "" });
      const tl = calcReservationTimeline(attraction, "2026-07-15");

      expect(tl).toBeUndefined();
    });
  });
});
