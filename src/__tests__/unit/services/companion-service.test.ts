/**
 * 伴游问答服务单元测试
 */

import { describe, expect, it } from "vitest";
import { queryTripData } from "../../../services/companion-service.js";
import {
  createMockAttraction,
  createMockDayPlan,
  createMockHotel,
  createMockTripPlan,
  createMockWeatherInfo,
} from "../../mocks/fixtures.js";

function createTripForQA() {
  return createMockTripPlan({
    city: "北京",
    cities: ["北京", "西安"],
    days: [
      createMockDayPlan({
        city: "北京",
        attractions: [
          createMockAttraction({
            nameZh: "故宫博物院",
            nameEn: "The Palace Museum",
            ticketPrice: 60,
            visitDuration: 180,
            reservationRequired: true,
            reservationTips: "需提前7天预约",
            bookingUrl: "https://www.dpm.org.cn/visit/ticket.html",
            category: "博物馆",
          }),
          createMockAttraction({
            nameZh: "颐和园",
            nameEn: "Summer Palace",
            ticketPrice: 30,
            visitDuration: 180,
            category: "公园",
          }),
        ],
        hotel: createMockHotel({ name: "北京饭店", estimatedCost: 500, rating: 4.8 }),
      }),
      createMockDayPlan({
        city: "西安",
        dayIndex: 2,
        isTransferDay: true,
        transportation: "高铁",
      }),
    ],
    weatherInfo: [
      createMockWeatherInfo({ city: "北京", dayWeather: "晴", dayTemp: 28, nightTemp: 18 }),
    ],
    budget: {
      totalAttractions: 90,
      totalHotels: 500,
      totalMeals: 240,
      totalTransportation: 100,
      totalInterCityTransport: 300,
      total: 1230,
    },
  });
}

describe("companion-service", () => {
  describe("queryTripData", () => {
    it("查询景点门票价格", () => {
      const result = queryTripData({ question: "故宫门票多少钱", tripPlan: createTripForQA() });
      expect(result.found).toBe(true);
      expect(result.answer).toContain("故宫博物院");
      expect(result.answer).toContain("60");
    });

    it("查询游览时间", () => {
      const result = queryTripData({ question: "故宫游览多久", tripPlan: createTripForQA() });
      expect(result.found).toBe(true);
      expect(result.answer).toContain("180");
      expect(result.answer).toContain("3 小时");
    });

    it("查询预约信息", () => {
      const result = queryTripData({ question: "故宫需要预约吗", tripPlan: createTripForQA() });
      expect(result.found).toBe(true);
      expect(result.answer).toContain("需要预约");
      expect(result.answer).toContain("提前7天");
    });

    it("查询适合人群", () => {
      const result = queryTripData({ question: "故宫适合带孩子吗", tripPlan: createTripForQA() });
      expect(result.found).toBe(true);
      expect(result.answer).toContain("故宫博物院");
    });

    it("查询酒店价格", () => {
      const result = queryTripData({ question: "酒店价格多少", tripPlan: createTripForQA() });
      expect(result.found).toBe(true);
      expect(result.answer).toContain("北京饭店");
      expect(result.answer).toContain("500");
    });

    it("查询预算", () => {
      const result = queryTripData({ question: "总预算多少", tripPlan: createTripForQA() });
      expect(result.found).toBe(true);
      expect(result.answer).toContain("1230");
    });

    it("查询天气", () => {
      const result = queryTripData({ question: "天气怎么样", tripPlan: createTripForQA() });
      expect(result.found).toBe(true);
      expect(result.answer).toContain("晴");
      expect(result.answer).toContain("28");
    });

    it("查询交通", () => {
      const result = queryTripData({ question: "怎么去西安", tripPlan: createTripForQA() });
      expect(result.found).toBe(true);
      expect(result.answer).toContain("高铁");
    });

    it("不指定景点时返回引导提示", () => {
      const result = queryTripData({ question: "门票多少钱", tripPlan: createTripForQA() });
      expect(result.answer).toContain("请告诉我");
    });

    it("通用查询返回景点详情", () => {
      const result = queryTripData({ question: "故宫有什么好玩的", tripPlan: createTripForQA() });
      expect(result.found).toBe(true);
      expect(result.answer).toContain("故宫博物院");
      expect(result.answer).toContain("60");
    });
  });
});
