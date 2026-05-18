/**
 * 行动链接 Tool 单元测试
 */

import { describe, expect, it } from "vitest";
import { generateActionLinksTool } from "../../../tools/action-links.js";

describe("generate_action_links tool", () => {
  it("工具元数据正确", () => {
    expect(generateActionLinksTool.name).toBe("generate_action_links");
    expect(generateActionLinksTool.label).toBe("行动链接");
    expect(generateActionLinksTool.description).toContain("预约");
    expect(generateActionLinksTool.parameters).toBeDefined();
  });

  it("为需预约景点生成链接", async () => {
    const result = await generateActionLinksTool.execute("test-id", {
      tripPlan: {
        city: "北京",
        cities: ["北京"],
        startDate: "2025-06-01",
        endDate: "2025-06-03",
        days: [
          {
            date: "2025-06-01",
            dayIndex: 1,
            city: "北京",
            attractions: [
              {
                name: "故宫博物院",
                nameZh: "故宫博物院",
                reservationRequired: true,
              },
            ],
          },
        ],
      },
    });

    expect(result.content[0].type).toBe("text");
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("行动链接");
    expect(text).toContain("故宫博物院");
    expect(text).toContain("预约");
    expect(result.details.linkCount).toBeGreaterThan(0);
  });

  it("为酒店生成比价链接", async () => {
    const result = await generateActionLinksTool.execute("test-id", {
      tripPlan: {
        city: "上海",
        cities: ["上海"],
        startDate: "2025-06-01",
        endDate: "2025-06-03",
        days: [
          {
            date: "2025-06-01",
            dayIndex: 1,
            city: "上海",
            attractions: [],
            hotel: { name: "上海大酒店" },
          },
        ],
      },
    });

    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("Booking.com");
    expect(text).toContain("飞猪");
  });

  it("为多城市行程生成城际交通链接", async () => {
    const result = await generateActionLinksTool.execute("test-id", {
      tripPlan: {
        city: "北京",
        cities: ["北京", "西安"],
        startDate: "2025-06-01",
        endDate: "2025-06-03",
        days: [
          {
            date: "2025-06-01",
            dayIndex: 1,
            city: "北京",
            attractions: [],
          },
          {
            date: "2025-06-02",
            dayIndex: 2,
            city: "西安",
            isTransferDay: true,
            attractions: [],
          },
        ],
      },
    });

    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("城际交通");
    expect(text).toContain("Skyscanner");
  });

  it("空行程仍有输出", async () => {
    const result = await generateActionLinksTool.execute("test-id", {
      tripPlan: {
        city: "测试城市",
        cities: ["测试城市"],
        startDate: "2025-06-01",
        endDate: "2025-06-01",
        days: [
          {
            date: "2025-06-01",
            dayIndex: 1,
            city: "测试城市",
            attractions: [],
          },
        ],
      },
    });

    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("行动链接");
    expect(result.details.linkCount).toBe(0);
  });
});
