/**
 * route-official-data.ts 单测 — 验证官方路线数据加载和查询
 */

import { describe, expect, it } from "vitest";
import {
  getAvailableAttractionNames,
  getMockRoutes,
  getOfficialRoutes,
} from "../../../services/route-official-data.js";

// ─── getOfficialRoutes ──────────────────────────────────

describe("getOfficialRoutes", () => {
  it("不存在的景点应返回空数组", () => {
    const result = getOfficialRoutes("完全不存在的景点", "北京");
    expect(result).toEqual([]);
  });

  it("不匹配的城市应返回空数组", () => {
    // 即使景点名匹配，城市不匹配也应返回空
    const result = getOfficialRoutes("天安门广场", "火星城");
    expect(result).toEqual([]);
  });

  it("空字符串景点名应可能匹配到数据（因为 includes('') 为 true）", () => {
    // 空字符串 includes 检查始终为 true，这是数据查询的边界行为
    // 实际调用方不会传空字符串，这里只验证不崩溃
    const result = getOfficialRoutes("", "北京");
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── getAvailableAttractionNames ────────────────────────

describe("getAvailableAttractionNames", () => {
  it("应返回非空数组", () => {
    const names = getAvailableAttractionNames();
    expect(names.length).toBeGreaterThan(0);
  });

  it("每个名称应为非空字符串", () => {
    const names = getAvailableAttractionNames();
    for (const name of names) {
      expect(typeof name).toBe("string");
      expect(name.length).toBeGreaterThan(0);
    }
  });
});

// ─── getMockRoutes ───────────────────────────────────────

describe("getMockRoutes", () => {
  it("含'景区'的景点应生成 mock 路线", () => {
    const result = getMockRoutes("九寨沟景区", "阿坝");
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].id).toContain("mock");
    expect(result[0].name).toContain("经典路线");
  });

  it("含'公园'的景点应生成 mock 路线", () => {
    const result = getMockRoutes("朝阳公园", "北京");
    expect(result.length).toBeGreaterThan(0);
  });

  it("含'风景区'的景点应生成 mock 路线", () => {
    const result = getMockRoutes("黄山风景区", "黄山");
    expect(result.length).toBeGreaterThan(0);
  });

  it("普通短名称不应生成 mock 路线", () => {
    const result = getMockRoutes("故宫", "北京");
    expect(result).toEqual([]);
  });

  it("mock 路线应有完整字段", () => {
    const result = getMockRoutes("张家界景区", "张家界");
    if (result.length > 0) {
      const route = result[0];
      expect(route.id).toBeTruthy();
      expect(route.name).toBeTruthy();
      expect(route.description).toBeTruthy();
      expect(typeof route.duration).toBe("number");
      expect(route.waypoints.length).toBeGreaterThan(0);
      expect(route.tags).toBeDefined();
      expect(route.source).toBe("llm_knowledge");

      // 验证 waypoints
      for (const wp of route.waypoints) {
        expect(wp.name).toBeTruthy();
        expect(wp.location).toHaveProperty("latitude");
        expect(wp.location).toHaveProperty("longitude");
        expect(typeof wp.visitDuration).toBe("number");
      }
    }
  });

  it("mock 路线应包含 supplyStrategy", () => {
    const result = getMockRoutes("武陵源景区", "张家界");
    if (result.length > 0) {
      expect(result[0].supplyStrategy).toBeDefined();
      expect(result[0].supplyStrategy!.warnings.length).toBeGreaterThan(0);
    }
  });
});
