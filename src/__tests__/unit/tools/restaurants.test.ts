/**
 * search_restaurants Tool 单元测试
 */

import { describe, it, expect } from "vitest";
import { searchRestaurantsTool } from "../../../tools/restaurants.js";

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
});
