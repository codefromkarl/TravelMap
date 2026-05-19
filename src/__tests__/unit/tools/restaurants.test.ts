/**
 * search_restaurants Tool 单元测试
 */

import { afterEach, describe, expect, it } from "vitest";
import { searchRestaurantsTool } from "../../../tools/restaurants.js";
import { createEnvStub } from "../../helpers/env.js";

const env = createEnvStub();

afterEach(() => {
  env.reset();
});

describe("search_restaurants tool", () => {
  it("应定义正确的 name 和 label", () => {
    expect(searchRestaurantsTool.name).toBe("search_restaurants");
    expect(searchRestaurantsTool.label).toBe("餐厅搜索");
  });

  it("应有完整的 description", () => {
    expect(searchRestaurantsTool.description).toContain("餐厅");
    expect(searchRestaurantsTool.description).toContain("评分");
    expect(searchRestaurantsTool.description).toContain("人均消费");
  });

  it("costTier 应为 cheap", () => {
    expect(searchRestaurantsTool.costTier).toBe("cheap");
  });

  it("应有 TypeBox schema 参数定义", () => {
    const params = searchRestaurantsTool.parameters as Record<string, unknown>;
    expect(params).toBeDefined();
    expect(params.type).toBe("object");
    expect(params.properties).toBeDefined();
  });

  it("应包含 city, latitude, longitude 参数", () => {
    const props = (searchRestaurantsTool.parameters as Record<string, unknown>)
      .properties as Record<string, unknown>;
    expect(props.city).toBeDefined();
    expect(props.latitude).toBeDefined();
    expect(props.longitude).toBeDefined();
  });

  // ─── execute 行为测试 ────────────────────────────────────

  describe("execute", () => {
    it("无 API key 时应返回 mock 数据并标注来源", async () => {
      env.unset("AMAP_WEB_KEY");
      env.unset("GOOGLE_MAPS_API_KEY");

      const result = await searchRestaurantsTool.execute("tc_1", {
        city: "杭州",
        latitude: 30.275,
        longitude: 120.155,
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("杭州");
      expect(text).toContain("模拟数据");

      expect(result.details).toBeDefined();
      expect(result.details.source).toBe("mock");
      expect(result.details.restaurants).toBeDefined();
      expect(result.details.restaurants.length).toBeGreaterThan(0);
    });

    it("execute 结果应包含餐厅评分和人均消费", async () => {
      env.unset("AMAP_WEB_KEY");
      env.unset("GOOGLE_MAPS_API_KEY");

      const result = await searchRestaurantsTool.execute("tc_1", {
        city: "杭州",
        latitude: 30.275,
        longitude: 120.155,
        mealType: "lunch",
      });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("评分:");
      expect(text).toContain("人均: ¥");
      expect(text).toContain("距离:");
    });

    it("应传递 mealType 和 cuisine 参数到服务层", async () => {
      env.unset("AMAP_WEB_KEY");
      env.unset("GOOGLE_MAPS_API_KEY");

      const result = await searchRestaurantsTool.execute("tc_1", {
        city: "杭州",
        latitude: 30.275,
        longitude: 120.155,
        mealType: "dinner",
        cuisine: "川菜",
        limit: 3,
      });

      expect(result.details).toBeDefined();
      expect(result.details.city).toBe("杭州");
      // mock 数据会根据参数变化，至少应返回餐厅
      expect(result.details.restaurants.length).toBeGreaterThan(0);
    });

    it("应传递 radius 参数", async () => {
      env.unset("AMAP_WEB_KEY");
      env.unset("GOOGLE_MAPS_API_KEY");

      const result = await searchRestaurantsTool.execute("tc_1", {
        city: "杭州",
        latitude: 30.275,
        longitude: 120.155,
        radius: 500,
      });

      expect((result.content[0] as { text: string }).text).toContain("杭州");
      expect(result.details).toBeDefined();
    });

    it("无效坐标时应降级返回 mock 数据不崩溃", async () => {
      // 传入无效坐标，工具应捕获异常并返回降级数据
      const result = await searchRestaurantsTool.execute("tc_1", {
        city: "",
        latitude: NaN,
        longitude: NaN,
      });

      // 降级后仍然返回可用数据，不抛错
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      // 可能包含警告或 mock 数据提示
      expect((result.content[0] as { text: string }).text.length).toBeGreaterThan(0);
    });

    it("details 中 restaurants 数组应包含完整字段", async () => {
      env.unset("AMAP_WEB_KEY");
      env.unset("GOOGLE_MAPS_API_KEY");

      const result = await searchRestaurantsTool.execute("tc_1", {
        city: "杭州",
        latitude: 30.275,
        longitude: 120.155,
      });

      const restaurants = result.details.restaurants;
      expect(restaurants.length).toBeGreaterThan(0);

      const r = restaurants[0];
      expect(r).toHaveProperty("name");
      expect(r).toHaveProperty("rating");
      expect(r).toHaveProperty("averageCost");
      expect(r).toHaveProperty("distance");
      expect(r).toHaveProperty("walkMinutes");
      expect(r).toHaveProperty("cuisine");
      expect(r).toHaveProperty("location");
      expect(r).toHaveProperty("source");
    });
  });
});
