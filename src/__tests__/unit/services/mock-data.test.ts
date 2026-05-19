/**
 * mock-data.ts 单测 — 验证共享 Mock 景点数据源
 */

import { describe, expect, it } from "vitest";
import { getMockAttractions, getMockUGC } from "../../../services/mock-data.js";

// ─── getMockAttractions ─────────────────────────────────

describe("getMockAttractions", () => {
  it("北京应返回 5 个景点", () => {
    const result = getMockAttractions({ city: "北京" });
    expect(result).toHaveLength(5);
  });

  it("上海应返回 3 个景点", () => {
    const result = getMockAttractions({ city: "上海" });
    expect(result).toHaveLength(3);
  });

  it("未收录城市应返回通用 mock", () => {
    const result = getMockAttractions({ city: "拉萨" });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].name).toContain("拉萨");
    expect(result[0].name).toContain("中心公园");
  });

  it("每个景点应有完整字段", () => {
    const result = getMockAttractions({ city: "北京" });
    for (const a of result) {
      expect(a.name).toBeTruthy();
      expect(a.nameZh).toBeTruthy();
      expect(a.nameEn).toBeTruthy();
      expect(a.address).toBeTruthy();
      expect(a.location).toHaveProperty("latitude");
      expect(a.location).toHaveProperty("longitude");
      expect(typeof a.visitDuration).toBe("number");
      expect(typeof a.ticketPrice).toBe("number");
      expect(typeof a.reservationRequired).toBe("boolean");
    }
  });

  it("故宫应有预约提示", () => {
    const result = getMockAttractions({ city: "北京" });
    const gugong = result.find((a) => a.name.includes("故宫"));
    expect(gugong).toBeDefined();
    expect(gugong!.reservationRequired).toBe(true);
    expect(gugong!.reservationTips).toBeTruthy();
  });

  it("天安门广场应免费", () => {
    const result = getMockAttractions({ city: "北京" });
    const tiananmen = result.find((a) => a.name.includes("天安门"));
    expect(tiananmen).toBeDefined();
    expect(tiananmen!.ticketPrice).toBe(0);
  });
});

// ─── getMockUGC ──────────────────────────────────────────

describe("getMockUGC", () => {
  it("故宫应有 UGC 数据", () => {
    const result = getMockUGC("北京", "故宫博物院");
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].source).toBe("xiaohongshu");
    expect(result[0].rating).toBeGreaterThan(0);
    expect(result[0].tips).toBeTruthy();
  });

  it("外滩应有 UGC 数据", () => {
    const result = getMockUGC("上海", "外滩");
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].rating).toBeGreaterThan(4);
  });

  it("未收录景点应返回通用评价", () => {
    const result = getMockUGC("杭州", "灵隐寺");
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].source).toBe("local_knowledge");
    expect(result[0].summary).toContain("灵隐寺");
  });

  it("每条评价应有 source/summary/rating/tips", () => {
    const result = getMockUGC("北京", "故宫博物院");
    for (const r of result) {
      expect(r.source).toBeTruthy();
      expect(r.summary).toBeTruthy();
      expect(typeof r.rating).toBe("number");
      expect(typeof r.tips).toBe("string");
    }
  });
});
