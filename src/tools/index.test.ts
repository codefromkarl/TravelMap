import { describe, expect, it } from "vitest";
import { createTools } from "./index.js";

describe("tools", () => {
  it("should create all tools", () => {
    const tools = createTools();
    expect(tools).toHaveLength(5);
    expect(tools.map((t) => t.name)).toEqual([
      "search_attractions",
      "search_weather",
      "search_hotels",
      "geocode",
      "calculate_budget",
    ]);
  });

  it("each tool should have required fields", () => {
    for (const tool of createTools()) {
      expect(tool.name).toBeTruthy();
      expect(tool.label).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.parameters).toBeDefined();
      expect(tool.execute).toBeTypeOf("function");
    }
  });
});

describe("search_attractions tool", () => {
  it("should return mock attractions when no API key", async () => {
    const tools = createTools();
    const tool = tools.find((t) => t.name === "search_attractions")!;
    const result = await tool.execute("test-id", {
      city: "北京",
    });

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe("text");
    const text = result.content[0] as { type: "text"; text: string };
    expect(text.text).toContain("北京");
    expect(result.details).toHaveProperty("attractions");
    expect(result.details.attractions.length).toBeGreaterThan(0);
  });

  it("should include structured attraction data", async () => {
    const tools = createTools();
    const tool = tools.find((t) => t.name === "search_attractions")!;
    const result = await tool.execute("test-id", {
      city: "北京",
      preferences: ["历史文化"],
    });

    const attraction = result.details.attractions[0];
    expect(attraction).toHaveProperty("name");
    expect(attraction).toHaveProperty("nameZh");
    expect(attraction).toHaveProperty("address");
    expect(attraction).toHaveProperty("location");
    expect(attraction.location).toHaveProperty("latitude");
    expect(attraction.location).toHaveProperty("longitude");
    expect(attraction).toHaveProperty("visitDuration");
    expect(attraction).toHaveProperty("description");
    expect(attraction).toHaveProperty("ticketPrice");
  });
});

describe("search_weather tool", () => {
  it("should return weather data", async () => {
    const tools = createTools();
    const tool = tools.find((t) => t.name === "search_weather")!;
    const result = await tool.execute("test-id", {
      city: "上海",
      days: 3,
    });

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe("text");
    const text = result.content[0] as { type: "text"; text: string };
    expect(text.text).toContain("上海");
    expect(result.details).toHaveProperty("weather");
    expect(result.details.weather).toHaveLength(3);
  });

  it("weather data should have required fields", async () => {
    const tools = createTools();
    const tool = tools.find((t) => t.name === "search_weather")!;
    const result = await tool.execute("test-id", {
      city: "北京",
    });

    const w = result.details.weather[0];
    expect(w).toHaveProperty("date");
    expect(w).toHaveProperty("city");
    expect(w).toHaveProperty("dayWeather");
    expect(w).toHaveProperty("nightWeather");
    expect(w).toHaveProperty("dayTemp");
    expect(w).toHaveProperty("nightTemp");
    expect(w).toHaveProperty("windDirection");
    expect(w).toHaveProperty("windPower");
    // 温度应为数字
    expect(typeof w.dayTemp).toBe("number");
    expect(typeof w.nightTemp).toBe("number");
  });

  it("should default to 7 days", async () => {
    const tools = createTools();
    const tool = tools.find((t) => t.name === "search_weather")!;
    const result = await tool.execute("test-id", {
      city: "成都",
    });
    expect(result.details.weather).toHaveLength(7);
  });
});

describe("geocode tool", () => {
  it("should return coordinates for a known address", async () => {
    const tools = createTools();
    const tool = tools.find((t) => t.name === "geocode")!;
    const result = await tool.execute("test-id", {
      address: "故宫博物院",
      city: "北京",
    });

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe("text");
    const text = result.content[0] as { type: "text"; text: string };
    expect(text.text).toContain("故宫博物院");
    expect(result.details).toHaveProperty("location");
    expect(result.details.location).toHaveProperty("latitude");
    expect(result.details.location).toHaveProperty("longitude");
    // 经纬度应为有效数值
    const lat = result.details.location.latitude;
    const lng = result.details.location.longitude;
    expect(lat).toBeGreaterThan(-90);
    expect(lat).toBeLessThan(90);
    expect(lng).toBeGreaterThan(-180);
    expect(lng).toBeLessThan(180);
  });

  it("should not throw on unknown address", async () => {
    const tools = createTools();
    const tool = tools.find((t) => t.name === "geocode")!;
    const result = await tool.execute("test-id", {
      address: "完全不存在的地址xyz",
      city: "火星城",
    });

    // 不应抛异常，应返回降级结果
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe("text");
  });
});
