/**
 * 各 Tool execute 测试 — 验证真实工具的 execute 逻辑
 *
 * 包含:
 *   - src/tools/attractions.ts  (searchAttractionsTool)
 *   - src/tools/weather.ts      (searchWeatherTool)
 *   - src/tools/geocode.ts      (geocodeTool)
 *   - src/tools/budget.ts       (calculateBudgetTool)
 *   - src/tools/hotels.ts       (searchHotelsTool 占位)
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";

// 真实实现工具
import { searchAttractionsTool } from "../../../tools/attractions.js";
import { calculateBudgetTool } from "../../../tools/budget.js";
import { geocodeTool } from "../../../tools/geocode.js";
// 占位工具
import { searchHotelsTool } from "../../../tools/hotels.js";
import { searchWeatherTool } from "../../../tools/weather.js";

import { createMockDayPlan } from "../../mocks/fixtures.js";

const originalEnv = process.env;

// ─── searchAttractionsTool ──────────────────────────────

describe("searchAttractionsTool (真实实现)", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("应返回包含城市名的景点搜索结果", async () => {
    const result = await searchAttractionsTool.execute("tc_1", { city: "北京" });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain("北京");
    expect(text).toContain("景点搜索结果");
  });

  it("details 应包含 city 和 sources", async () => {
    const result = await searchAttractionsTool.execute("tc_1", { city: "北京" });
    const details = result.details as { city: string; sources: string[] };

    expect(details.city).toBe("北京");
    expect(details.sources).toContain("mock");
    expect(details.sources).toContain("ugc");
  });

  it("应接受 preferences 和 keywords 参数", async () => {
    const result = await searchAttractionsTool.execute("tc_1", {
      city: "上海",
      preferences: ["历史文化"],
      keywords: "外滩",
    });

    const details = result.details as { city: string };
    expect(details.city).toBe("上海");
  });

  it("应返回 markdown 格式的景点列表", async () => {
    const result = await searchAttractionsTool.execute("tc_1", { city: "北京" });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain("##");
    expect(text).toContain("1.");
  });
});

// ─── searchWeatherTool ──────────────────────────────────

describe("searchWeatherTool (真实实现)", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OPENWEATHER_API_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("应返回天气查询结果", async () => {
    const result = await searchWeatherTool.execute("tc_1", { city: "北京" });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain("北京");
    expect(text).toContain("天气预报");
  });

  it("details 应包含 weather 数组", async () => {
    const result = await searchWeatherTool.execute("tc_1", { city: "北京", days: 3 });
    const details = result.details as { city: string; weather: unknown[]; source: string };

    expect(details.city).toBe("北京");
    expect(details.weather).toHaveLength(3);
    expect(details.source).toBe("mock");
  });

  it("应包含温度信息 (°C)", async () => {
    const result = await searchWeatherTool.execute("tc_1", { city: "北京" });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain("°C");
  });
});

// ─── geocodeTool ────────────────────────────────────────

describe("geocodeTool (真实实现)", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.AMAP_WEB_KEY;
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("应返回坐标信息", async () => {
    const result = await geocodeTool.execute("tc_1", {
      address: "天安门",
      city: "北京",
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain("坐标");
  });

  it("details 应包含 location 和 engine", async () => {
    const result = await geocodeTool.execute("tc_1", {
      address: "天安门",
      city: "北京",
    });
    const details = result.details as {
      address: string;
      city: string;
      location: { latitude: number };
      engine: string;
    };

    expect(details.address).toBe("天安门");
    expect(details.city).toBe("北京");
    expect(details.location.latitude).toBeDefined();
    expect(details.engine).toBeDefined();
  });
});

// ─── calculateBudgetTool ────────────────────────────────

describe("calculateBudgetTool (真实实现)", () => {
  it("应返回 Markdown 表格格式的预算明细", async () => {
    const days = [
      createMockDayPlan({
        attractions: [
          {
            name: "A",
            ticketPrice: 60,
            nameZh: "A",
            nameEn: "A",
            address: "",
            location: { latitude: 0, longitude: 0 },
            visitDuration: 60,
            description: "",
            category: "",
            reservationRequired: false,
            reservationTips: "",
          },
        ],
        meals: [{ type: "lunch" as const, name: "M", description: "", estimatedCost: 50 }],
        hotel: { name: "H", address: "", priceRange: "", rating: 4, estimatedCost: 300 },
      }),
    ];

    const result = await calculateBudgetTool.execute("tc_1", { days });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain("预算明细");
    expect(text).toContain("¥60"); // 门票
    expect(text).toContain("¥300"); // 住宿
    expect(text).toContain("¥50"); // 餐饮
  });

  it("有 budgetLimit 且未超支时应显示剩余金额", async () => {
    const days = [
      createMockDayPlan({
        attractions: [],
        meals: [{ type: "lunch" as const, name: "M", description: "", estimatedCost: 50 }],
      }),
    ];

    const result = await calculateBudgetTool.execute("tc_1", {
      days,
      budgetLimit: 10000,
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain("预算上限");
    expect(text).toContain("剩余");
  });

  it("有 budgetLimit 且超支时应显示超支警告", async () => {
    const days = [
      createMockDayPlan({
        attractions: [
          {
            name: "A",
            ticketPrice: 500,
            nameZh: "A",
            nameEn: "A",
            address: "",
            location: { latitude: 0, longitude: 0 },
            visitDuration: 60,
            description: "",
            category: "",
            reservationRequired: false,
            reservationTips: "",
          },
        ],
        hotel: { name: "H", address: "", priceRange: "", rating: 4, estimatedCost: 2000 },
        meals: [{ type: "lunch" as const, name: "M", description: "", estimatedCost: 500 }],
      }),
    ];

    const result = await calculateBudgetTool.execute("tc_1", {
      days,
      budgetLimit: 100,
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain("超出预算");
  });

  it("应支持自定义交通预算", async () => {
    const days = [createMockDayPlan({ attractions: [], meals: [] })];

    const result = await calculateBudgetTool.execute("tc_1", {
      days,
      dailyTransportBudget: 100,
      interCityTransportCost: 500,
    });
    const details = result.details as {
      budget: { totalTransportation: number; totalInterCityTransport: number };
    };

    expect(details.budget.totalTransportation).toBe(100);
    expect(details.budget.totalInterCityTransport).toBe(500);
  });
});

// ─── searchHotelsTool (占位) ────────────────────────────

describe("searchHotelsTool (占位)", () => {
  it("应返回占位文案", async () => {
    const result = await searchHotelsTool.execute("tc_1", {
      city: "北京",
      budget: "300-500",
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain("后续版本实现");
    expect(text).toContain("北京");
  });

  it("details 应包含 city", async () => {
    const result = await searchHotelsTool.execute("tc_1", { city: "上海" });
    const details = result.details as { city: string };

    expect(details.city).toBe("上海");
  });
});
