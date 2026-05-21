/**
 * discover_destinations Tool 单元测试
 */

import { describe, expect, it, vi } from "vitest";
import { discoverDestinationsTool } from "../../../tools/discover.js";

vi.mock("../../../services/discover-service.js", () => ({
  discoverDestinations: vi.fn(),
}));

import { discoverDestinations } from "../../../services/discover-service.js";

const mockedDiscover = vi.mocked(discoverDestinations) as any;

describe("discover_destinations tool", () => {
  it("应定义正确的 name 和 label", () => {
    expect(discoverDestinationsTool.name).toBe("discover_destinations");
    expect(discoverDestinationsTool.label).toBe("目的地推荐");
  });

  it("正常执行应返回推荐列表", async () => {
    mockedDiscover.mockResolvedValue({
      userLocation: { latitude: 31.23, longitude: 121.47, city: "上海" },
      destinations: [
        {
          city: "杭州",
          reason: "西湖风景优美",
          matchScore: 90,
          travelMethod: "高铁",
          travelTime: "1小时",
          estimatedBudget: 800,
          highlights: ["西湖", "灵隐寺"],
          bestSeason: "春秋",
          suitableFor: ["情侣", "亲子"],
        },
        {
          city: "苏州",
          reason: "园林文化",
          matchScore: 85,
          travelMethod: "高铁",
          travelTime: "30分钟",
          estimatedBudget: 600,
          highlights: ["拙政园", "虎丘"],
          bestSeason: "春秋",
          suitableFor: ["文化爱好者"],
        },
      ],
      summary: "为您推荐以下目的地",
    });

    const result = await discoverDestinationsTool.execute!("call-1", {
      location: { latitude: 31.23, longitude: 121.47, city: "上海" },
      constraints: { maxTravelHours: 2, themes: ["亲子"] },
    });

    expect(result.content).toHaveLength(1);
    const firstContent = result.content[0]!;
    expect(firstContent.type).toBe("text");
    const text = firstContent.type === "text" ? firstContent.text : "";
    expect(text).toContain("目的地推荐");
    expect(text).toContain("杭州");
    expect(text).toContain("苏州");
    expect(text).toContain("匹配度 90%");
    expect(text).toContain("匹配度 85%");
    expect(text).toContain("为您推荐以下目的地");
    expect(result.details).toBeDefined();
  });

  it("无推荐时应返回提示信息", async () => {
    mockedDiscover.mockResolvedValue({
      userLocation: { latitude: 31.23, longitude: 121.47, city: "上海" },
      destinations: [],
      summary: "",
    });

    const result = await discoverDestinationsTool.execute!("call-2", {
      location: { latitude: 31.23, longitude: 121.47, city: "上海" },
    });

    expect(result.content).toHaveLength(1);
    const firstContent = result.content[0]!;
    const text = firstContent.type === "text" ? firstContent.text : "";
    expect(text).toContain("暂时没有找到");
  });

  it("服务异常时应返回错误信息", async () => {
    mockedDiscover.mockRejectedValue(new Error("LLM 服务不可用"));

    const result = await discoverDestinationsTool.execute!("call-3", {
      location: { latitude: 31.23, longitude: 121.47, city: "上海" },
    });

    expect(result.content).toHaveLength(1);
    const firstContent = result.content[0]!;
    const text = firstContent.type === "text" ? firstContent.text : "";
    expect(text).toContain("目的地推荐失败");
    expect(text).toContain("LLM 服务不可用");
  });

  it("应正确传递约束参数", async () => {
    mockedDiscover.mockResolvedValue({
      userLocation: { latitude: 39.9, longitude: 116.4, city: "北京" },
      destinations: [],
      summary: "无推荐",
    });

    await discoverDestinationsTool.execute!("call-4", {
      location: { latitude: 39.9, longitude: 116.4, city: "北京" },
      constraints: {
        maxTravelHours: 3,
        maxBudget: 1000,
        duration: "weekend",
        themes: ["情侣"],
        activities: ["美食", "购物"],
      },
      travelers: {
        adults: 2,
        seniors: 0,
        children: 0,
        infants: 0,
        pregnant: false,
        mobilityImpaired: false,
      },
    });

    expect(mockedDiscover).toHaveBeenCalledWith({
      location: { latitude: 39.9, longitude: 116.4, city: "北京" },
      constraints: {
        maxTravelHours: 3,
        maxBudget: 1000,
        duration: "weekend",
        themes: ["情侣"],
        activities: ["美食", "购物"],
      },
      travelers: {
        adults: 2,
        seniors: 0,
        children: 0,
        infants: 0,
        pregnant: false,
        mobilityImpaired: false,
      },
    });
  });
});
