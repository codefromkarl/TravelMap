/**
 * 伴游问答 Tool 单元测试
 */

import { describe, expect, it } from "vitest";
import { companionQATool } from "../../../tools/companion.js";

const makeTripPlan = () => ({
  city: "北京",
  cities: ["北京"],
  startDate: "2025-06-01",
  endDate: "2025-06-03",
  days: [
    {
      date: "2025-06-01",
      dayIndex: 1,
      city: "北京",
      transportation: "地铁",
      attractions: [
        {
          name: "故宫博物院",
          nameZh: "故宫博物院",
          nameEn: "The Palace Museum",
          address: "东城区景山前街4号",
          visitDuration: 180,
          description: "明清皇家宫殿",
          category: "博物馆",
          ticketPrice: 60,
          reservationRequired: true,
          reservationTips: "需提前预约",
        },
      ],
      meals: [],
    },
  ],
  weatherInfo: [
    {
      date: "2025-06-01",
      city: "北京",
      dayWeather: "晴",
      nightWeather: "晴",
      dayTemp: 28,
      nightTemp: 18,
      windDirection: "南",
      windPower: "2级",
    },
  ],
});

describe("query_trip_data tool", () => {
  it("工具元数据正确", () => {
    expect(companionQATool.name).toBe("query_trip_data");
    expect(companionQATool.label).toBe("伴游问答");
    expect(companionQATool.description).toContain("追问");
  });

  it("回答门票价格问题", async () => {
    const result = await companionQATool.execute("test-id", {
      question: "故宫门票多少钱",
      tripPlan: makeTripPlan(),
    });

    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("故宫");
    expect(text).toContain("60");
  });

  it("回答预约问题", async () => {
    const result = await companionQATool.execute("test-id", {
      question: "故宫需要预约吗",
      tripPlan: makeTripPlan(),
    });

    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("预约");
  });

  it("回答天气问题", async () => {
    const result = await companionQATool.execute("test-id", {
      question: "天气怎么样",
      tripPlan: makeTripPlan(),
    });

    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("晴");
  });
});
