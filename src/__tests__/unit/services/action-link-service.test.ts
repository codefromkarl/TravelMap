/**
 * 行动链接服务单元测试
 *
 * 覆盖：
 * - 同步版本（URL 模板）
 * - 异步增强版（trvl 实时 + fallback）
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enrichTripWithLinks,
  enrichTripWithLiveLinks,
} from "../../../services/action-link-service.js";
import {
  createMockAttraction,
  createMockDayPlan,
  createMockHotel,
  createMockTripPlan,
  createMockTrvlFlightResult,
  createMockTrvlHotelResult,
} from "../../mocks/fixtures.js";

// Mock trvl-service
vi.mock("../../../services/trvl-service.js", () => ({
  isTrvlAvailable: vi.fn(),
  searchFlights: vi.fn(),
  searchHotels: vi.fn(),
  cityToIATA: vi.fn((city: string) => city),
}));

import { isTrvlAvailable, searchFlights, searchHotels } from "../../../services/trvl-service.js";

const mockIsTrvlAvailable = vi.mocked(isTrvlAvailable);
const mockSearchFlights = vi.mocked(searchFlights);
const mockSearchHotels = vi.mocked(searchHotels);

afterEach(() => {
  vi.clearAllMocks();
});

describe("action-link-service", () => {
  describe("enrichTripWithLinks（同步/URL 模板）", () => {
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

    it("为酒店生成比价链接（URL 模板）", () => {
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

      // 所有链接来源是 template
      expect(links!.every((l) => l.source === "template")).toBe(true);
    });

    it("无酒店时不生成比价链接", () => {
      const day = createMockDayPlan();
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

      expect(originalAttr.bookingUrl).toBeUndefined();
      expect(originalHotel?.comparisonLinks).toBeUndefined();
    });
  });

  describe("enrichTripWithLiveLinks（异步/trvl 增强）", () => {
    it("trvl 不可用时 fallback 到 URL 模板", async () => {
      mockIsTrvlAvailable.mockResolvedValue(false);

      const trip = createMockTripPlan({
        days: [
          createMockDayPlan({
            city: "北京",
            hotel: createMockHotel({ name: "北京大酒店" }),
            attractions: [
              createMockAttraction({
                nameZh: "故宫博物院",
                reservationRequired: true,
              }),
            ],
          }),
        ],
      });

      const result = await enrichTripWithLiveLinks(trip);

      // 景点预约正常
      expect(result.days[0].attractions[0].bookingUrl).toBe(
        "https://www.dpm.org.cn/visit/ticket.html",
      );

      // 酒店 fallback 到模板链接
      const links = result.days[0].hotel?.comparisonLinks;
      expect(links).toBeDefined();
      expect(links!.every((l) => l.source === "template")).toBe(true);
      expect(links!.some((l) => l.platform === "Booking.com")).toBe(true);
    });

    it("trvl 可用时获取酒店实时比价", async () => {
      mockIsTrvlAvailable.mockResolvedValue(true);
      mockSearchHotels.mockResolvedValue(
        createMockTrvlHotelResult({
          hotels: [
            {
              name: "测试酒店",
              hotel_id: "h1",
              rating: 4.5,
              stars: 4,
              price: 398,
              currency: "CNY",
              booking_url: "https://example.com/hotel/live",
              sources: [
                {
                  provider: "google_hotels",
                  price: 398,
                  currency: "CNY",
                  booking_url: "https://example.com/hotel/google",
                },
                {
                  provider: "trivago",
                  price: 420,
                  currency: "CNY",
                  booking_url: "https://example.com/hotel/trivago",
                },
              ],
            },
          ],
        }),
      );

      const trip = createMockTripPlan({
        days: [
          createMockDayPlan({
            city: "北京",
            date: "2026-07-01",
            dayIndex: 1,
            hotel: createMockHotel({ name: "测试酒店" }),
          }),
          createMockDayPlan({
            city: "北京",
            date: "2026-07-02",
            dayIndex: 2,
          }),
        ],
      });

      const result = await enrichTripWithLiveLinks(trip);

      const links = result.days[0].hotel?.comparisonLinks;
      expect(links).toBeDefined();
      expect(links!.length).toBe(2);
      expect(links!.every((l) => l.source === "trvl")).toBe(true);
      expect(links!.some((l) => l.platform === "google_hotels")).toBe(true);
      expect(links!.some((l) => l.platform === "trivago")).toBe(true);

      // 验证有实时价格
      expect(links!.some((l) => l.price !== undefined)).toBe(true);
    });

    it("trvl 酒店搜索失败时 fallback 到模板", async () => {
      mockIsTrvlAvailable.mockResolvedValue(true);
      mockSearchHotels.mockRejectedValue(new Error("network error"));

      const trip = createMockTripPlan({
        days: [
          createMockDayPlan({
            city: "北京",
            date: "2026-07-01",
            dayIndex: 1,
            hotel: createMockHotel({ name: "北京大酒店" }),
          }),
        ],
      });

      const result = await enrichTripWithLiveLinks(trip);

      const links = result.days[0].hotel?.comparisonLinks;
      expect(links).toBeDefined();
      expect(links!.every((l) => l.source === "template")).toBe(true);
    });

    it("trvl 可用时获取航班实时价格", async () => {
      mockIsTrvlAvailable.mockResolvedValue(true);
      mockSearchFlights.mockResolvedValue(
        createMockTrvlFlightResult({
          flights: [
            {
              price: 580,
              currency: "CNY",
              duration: 120,
              stops: 0,
              booking_url: "https://example.com/flight/live",
              legs: [
                {
                  departure_airport: { code: "PEK", name: "北京首都" },
                  arrival_airport: { code: "XIY", name: "西安咸阳" },
                  departure_time: "08:00",
                  arrival_time: "10:00",
                  airline: "中国国航",
                },
              ],
            },
          ],
        }),
      );

      const trip = createMockTripPlan({
        cities: ["北京", "西安"],
        days: [
          createMockDayPlan({ city: "北京", dayIndex: 1 }),
          createMockDayPlan({
            city: "西安",
            dayIndex: 2,
            isTransferDay: true,
            date: "2026-07-02",
          }),
        ],
      });

      const result = await enrichTripWithLiveLinks(trip);

      expect(result.flightLinks).toBeDefined();
      expect(result.flightLinks!.length).toBeGreaterThanOrEqual(1);

      const liveLink = result.flightLinks!.find((l) => l.source === "trvl");
      expect(liveLink).toBeDefined();
      expect(liveLink!.price).toBe(580);
      expect(liveLink!.url).toBe("https://example.com/flight/live");
    });

    it("trvl 航班搜索失败时 fallback 到模板", async () => {
      mockIsTrvlAvailable.mockResolvedValue(true);
      mockSearchFlights.mockRejectedValue(new Error("timeout"));

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

      const result = await enrichTripWithLiveLinks(trip);

      expect(result.flightLinks).toBeDefined();
      expect(result.flightLinks!.every((l) => l.source === "template")).toBe(true);
    });

    it("trvl 返回空航班时 fallback 到模板", async () => {
      mockIsTrvlAvailable.mockResolvedValue(true);
      mockSearchFlights.mockResolvedValue(createMockTrvlFlightResult({ flights: [], count: 0 }));

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

      const result = await enrichTripWithLiveLinks(trip);

      expect(result.flightLinks).toBeDefined();
      expect(result.flightLinks!.every((l) => l.source === "template")).toBe(true);
    });

    it("正确处理三城市行程", async () => {
      mockIsTrvlAvailable.mockResolvedValue(false);

      const trip = createMockTripPlan({
        cities: ["北京", "西安", "成都"],
        days: [
          createMockDayPlan({ city: "北京", dayIndex: 1 }),
          createMockDayPlan({ city: "西安", dayIndex: 2, isTransferDay: true }),
          createMockDayPlan({ city: "成都", dayIndex: 3, isTransferDay: true }),
        ],
      });

      const result = await enrichTripWithLiveLinks(trip);

      expect(result.flightLinks).toBeDefined();
      const labels = result.flightLinks!.map((l) => l.label);
      expect(labels.some((l) => l.includes("北京") && l.includes("西安"))).toBe(true);
      expect(labels.some((l) => l.includes("西安") && l.includes("成都"))).toBe(true);
    });
  });
});
