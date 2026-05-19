/**
 * 各 Tool execute 测试 — 验证真实工具的 execute 逻辑
 *
 * 聚合所有 Tool 层测试，与 Service 层测试区别：
 *   - Tool 层测试验证：参数传递 → Service 调用 → markdown 格式化 → details 结构
 *   - Service 层测试验证：业务逻辑正确性
 *
 * 包含:
 *   - searchAttractionsTool    (attractions.ts)
 *   - searchWeatherTool        (weather.ts)
 *   - geocodeTool              (geocode.ts)
 *   - calculateBudgetTool      (budget.ts)
 *   - searchHotelsTool         (hotels.ts — 占位)
 *   - planMultiCityTool        (multi-city.ts)
 *   - generateActionLinksTool  (action-links.ts)
 *   - companionQATool          (companion.ts)
 *   - createTools()            (index.ts)
 */

import { beforeEach, describe, expect, it } from "vitest";

// 真实实现工具
import { generateActionLinksTool } from "../../../tools/action-links.js";
import { searchAttractionsTool } from "../../../tools/attractions.js";
import { calculateBudgetTool } from "../../../tools/budget.js";
import { companionQATool } from "../../../tools/companion.js";
import { geocodeTool } from "../../../tools/geocode.js";
// 占位工具
import { searchHotelsTool } from "../../../tools/hotels.js";
import { createTools } from "../../../tools/index.js";
import { planMultiCityTool } from "../../../tools/multi-city.js";
import { searchWeatherTool } from "../../../tools/weather.js";
import { createMockDayPlan } from "../../mocks/fixtures.js";

// ─── createTools (index.ts) ───────────────────────────

describe("createTools()", () => {
  it("应返回 11 个工具", () => {
    const tools = createTools();
    expect(tools).toHaveLength(11);
    expect(tools.map((t) => t.name)).toEqual([
      "search_attractions",
      "search_weather",
      "search_hotels",
      "geocode",
      "search_restaurants",
      "calculate_budget",
      "generate_action_links",
      "query_trip_data",
      "plan_multi_city",
      "enrich_supply_details",
      "search_intercity_transport",
    ]);
  });

  it("每个工具应有完整的必需字段", () => {
    for (const tool of createTools()) {
      expect(tool.name).toBeTruthy();
      expect(tool.label).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.parameters).toBeDefined();
      expect(typeof tool.execute).toBe("function");
    }
  });
});

// ─── searchAttractionsTool ──────────────────────────────

describe("searchAttractionsTool", () => {
  beforeEach(() => {
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  it("无 API Key 时应走 mock 数据，返回 markdown 格式", async () => {
    const result = await searchAttractionsTool.execute("tc_1", { city: "北京" });
    const text = (result.content[0] as { text: string }).text;

    // Tool 层验证：markdown 格式和 details 结构
    expect(text).toContain("景点搜索结果");
    expect(text).toContain("##");
    expect(text).toContain("1.");
    expect(text).toContain("北京");

    const details = result.details as { city: string; sources: string[]; fromCache: boolean };
    expect(details.city).toBe("北京");
    expect(details.sources).toContain("mock");
    expect(details.sources).toContain("ugc");
    expect(typeof details.fromCache).toBe("boolean");
  });

  it("details 应包含 attractions 数组且结构完整", async () => {
    const result = await searchAttractionsTool.execute("tc_1", { city: "上海" });
    const details = result.details as { attractions: unknown[]; city: string };

    expect(details.attractions.length).toBeGreaterThan(0);
    const a = details.attractions[0] as Record<string, unknown>;
    expect(a).toHaveProperty("name");
    expect(a).toHaveProperty("nameZh");
    expect(a).toHaveProperty("ticketPrice");
    expect(a).toHaveProperty("location");
    expect(a).toHaveProperty("visitDuration");
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
});

// ─── searchWeatherTool ──────────────────────────────────

describe("searchWeatherTool", () => {
  beforeEach(() => {
    delete process.env.OPENWEATHER_API_KEY;
  });

  it("应返回天气查询结果（markdown 格式）", async () => {
    const result = await searchWeatherTool.execute("tc_1", { city: "北京" });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain("北京");
    expect(text).toContain("天气预报");
    expect(text).toContain("°C");
  });

  it("details 应包含 weather 数组和 source", async () => {
    const result = await searchWeatherTool.execute("tc_1", { city: "北京", days: 3 });
    const details = result.details as { city: string; weather: unknown[]; source: string };

    expect(details.city).toBe("北京");
    expect(details.weather).toHaveLength(3);
    expect(details.source).toBe("mock");

    const w = details.weather[0] as Record<string, unknown>;
    expect(w).toHaveProperty("date");
    expect(w).toHaveProperty("dayTemp");
    expect(w).toHaveProperty("nightTemp");
    expect(typeof w.dayTemp).toBe("number");
  });

  it("默认应返回 7 天预报", async () => {
    const result = await searchWeatherTool.execute("tc_1", { city: "北京" });
    const details = result.details as { weather: unknown[] };

    expect(details.weather).toHaveLength(7);
  });
});

// ─── geocodeTool ────────────────────────────────────────

describe("geocodeTool", () => {
  beforeEach(() => {
    delete process.env.AMAP_WEB_KEY;
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  it("应返回坐标信息（markdown 格式）", async () => {
    const result = await geocodeTool.execute("tc_1", {
      address: "天安门",
      city: "北京",
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain("坐标");
  });

  it("details 应包含 location/engine/地址信息", async () => {
    const result = await geocodeTool.execute("tc_1", {
      address: "天安门",
      city: "北京",
    });
    const details = result.details as {
      address: string;
      city: string;
      location: { latitude: number; longitude: number };
      engine: string;
    };

    expect(details.address).toBe("天安门");
    expect(details.city).toBe("北京");
    expect(typeof details.location.latitude).toBe("number");
    expect(typeof details.location.longitude).toBe("number");
    expect(details.engine).toBeTruthy();
  });

  it("未知地址应返回降级结果不抛错", async () => {
    const result = await geocodeTool.execute("tc_1", {
      address: "完全不存在的地址xyz",
      city: "火星城",
    });

    expect(result.content[0]).toHaveProperty("type", "text");
    expect(result.details).toHaveProperty("location");
  });
});

// ─── calculateBudgetTool ────────────────────────────────

describe("calculateBudgetTool", () => {
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

  it("details 应包含完整的 budget 对象", async () => {
    const days = [createMockDayPlan({ attractions: [], meals: [] })];

    const result = await calculateBudgetTool.execute("tc_1", {
      days,
      dailyTransportBudget: 100,
      interCityTransportCost: 500,
    });
    const details = result.details as {
      budget: {
        total: number;
        totalAttractions: number;
        totalHotels: number;
        totalMeals: number;
        totalTransportation: number;
        totalInterCityTransport: number;
      };
    };

    expect(details.budget.totalTransportation).toBe(100);
    expect(details.budget.totalInterCityTransport).toBe(500);
    expect(details.budget.total).toBe(
      details.budget.totalAttractions +
        details.budget.totalHotels +
        details.budget.totalMeals +
        details.budget.totalTransportation +
        details.budget.totalInterCityTransport,
    );
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

// ─── planMultiCityTool ──────────────────────────────────

describe("planMultiCityTool", () => {
  it("单城市应返回无城际移动的框架", async () => {
    const result = await planMultiCityTool.execute("tc_1", {
      cities: [{ city: "北京", days: 3 }],
      startDate: "2025-06-01",
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain("多城市行程框架");
    expect(text).toContain("北京");
    expect(text).toContain("3天");

    const details = result.details as { totalDays: number; transfers: unknown[] };
    expect(details.totalDays).toBe(3);
    expect(details.transfers).toHaveLength(0);
  });

  it("两城市应插入城际移动日", async () => {
    const result = await planMultiCityTool.execute("tc_1", {
      cities: [
        { city: "北京", days: 2 },
        { city: "上海", days: 3 },
      ],
      startDate: "2025-06-01",
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain("城际移动");
    expect(text).toContain("北京");
    expect(text).toContain("上海");

    const details = result.details as {
      totalDays: number;
      transfers: Array<{ from: string; to: string }>;
    };
    expect(details.totalDays).toBe(6); // 2 + 1(transfer) + 3
    expect(details.transfers).toHaveLength(1);
    expect(details.transfers[0].from).toBe("北京");
    expect(details.transfers[0].to).toBe("上海");
  });

  it("三城市应生成两段城际交通", async () => {
    const result = await planMultiCityTool.execute("tc_1", {
      cities: [
        { city: "北京", days: 2 },
        { city: "西安", days: 2 },
        { city: "成都", days: 2 },
      ],
      startDate: "2025-06-01",
    });

    const details = result.details as {
      totalDays: number;
      transfers: Array<{ from: string; to: string }>;
    };
    expect(details.totalDays).toBe(8); // 2+1+2+1+2
    expect(details.transfers).toHaveLength(2);
    expect(details.transfers[0].from).toBe("北京");
    expect(details.transfers[0].to).toBe("西安");
    expect(details.transfers[1].from).toBe("西安");
    expect(details.transfers[1].to).toBe("成都");
  });

  it("空城市数组应返回提示信息", async () => {
    const result = await planMultiCityTool.execute("tc_1", {
      cities: [],
      startDate: "2025-06-01",
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain("至少指定一个城市");
  });

  it("应包含交通方式和费用", async () => {
    const result = await planMultiCityTool.execute("tc_1", {
      cities: [
        { city: "北京", days: 1 },
        { city: "上海", days: 1 },
      ],
      startDate: "2025-06-01",
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain("城际交通");
    // 北京-上海 1200km 应为飞机
    expect(text).toContain("飞机");
  });

  it("短距离应选择高铁", async () => {
    const result = await planMultiCityTool.execute("tc_1", {
      cities: [
        { city: "上海", days: 1 },
        { city: "杭州", days: 1 },
      ],
      startDate: "2025-06-01",
    });

    const details = result.details as {
      transfers: Array<{ transport: { mode: string } }>;
    };
    // 上海-杭州 180km 应为高铁
    expect(details.transfers[0].transport.mode).toBe("高铁");
  });
});

// ─── generateActionLinksTool ────────────────────────────

describe("generateActionLinksTool", () => {
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

  it("预约链接含时间轴信息（紧急度 + 备选渠道）", async () => {
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
                reservationTips: "需提前7天预约",
                bookingUrl: "https://www.dpm.org.cn/visit/ticket.html",
                // 模拟 reservationTimeline 由 post-processor 填充
                reservationTimeline: {
                  advanceDays: 7,
                  releaseTime: "20:00",
                  bookingOpenDate: "2025-05-25",
                  urgency: "urgent",
                  officialUrl: "https://www.dpm.org.cn/visit/ticket.html",
                  altChannels: [
                    { platform: "美团", url: "https://www.meituan.com/" },
                    { platform: "携程", url: "https://www.ctrip.com/" },
                  ],
                },
              },
            ],
          },
        ],
      },
    });

    expect(result.content[0].type).toBe("text");
    const text = (result.content[0] as { type: "text"; text: string }).text;
    // 紧急度标记
    expect(text).toMatch(/[🔴🟡🟢]/);
    // 时间轴信息
    expect(text).toContain("提前7天");
    expect(text).toContain("20:00");
    // 备选渠道
    expect(text).toContain("美团");
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

  it("空行程 linkCount 应为 0", async () => {
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

    expect(result.details.linkCount).toBe(0);
  });
});

// ─── companionQATool ────────────────────────────────────

describe("companionQATool", () => {
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

  it("details 应包含 found 和 answer", async () => {
    const result = await companionQATool.execute("test-id", {
      question: "故宫门票多少钱",
      tripPlan: makeTripPlan(),
    });

    const details = result.details as { found: boolean; answer: string };
    expect(typeof details.found).toBe("boolean");
    expect(typeof details.answer).toBe("string");
  });
});
