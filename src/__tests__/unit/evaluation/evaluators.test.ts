import { describe, expect, it } from "vitest";
import {
  assertToolCalls,
  assertToolResultFormat,
  assertTripPlanStructure,
} from "../../helpers/ai-e2e.js";

// ─── 测试用例 ───────────────────────────────────────────────

describe("AI 评估框架 — 结构化断言", () => {
  describe("assertTripPlanStructure", () => {
    it("完整的行程规划应通过所有检查", () => {
      const output = `
        ## 北京 3 日行程规划

        **目的地**: 北京
        **日期**: 2025-06-01 至 2025-06-03

        ### Day 1
        - 景点: 故宫博物院（游览 3 小时，门票 ¥60）
        - 午餐: 南锣鼓巷小吃
        - 晚餐: 全聚德烤鸭
        - 住宿: 如家酒店（约 ¥300/晚）

        **总预算**: 约 ¥2500
      `;

      const results = assertTripPlanStructure(output);
      const allPassed = results.every((r) => r.passed);
      expect(allPassed).toBe(true);

      const scores = results.map((r) => r.score);
      expect(scores.every((s) => s >= 0.5)).toBe(true);
    });

    it("缺失关键信息应标记 required 项为失败", () => {
      const output = "这是一段没有行程信息的随机文本";

      const results = assertTripPlanStructure(output);
      const requiredFails = results.filter((r) => !r.passed);
      expect(requiredFails.length).toBeGreaterThan(0);
    });
  });

  describe("assertToolResultFormat", () => {
    it("格式正确的工具结果应通过", () => {
      const result = {
        content: [{ type: "text", text: "搜索结果" }],
        details: { city: "北京" },
      };

      const results = assertToolResultFormat(result);
      expect(results.every((r) => r.passed)).toBe(true);
    });

    it("格式错误应标记失败", () => {
      const result = {
        content: [],
        details: undefined,
      };

      const results = assertToolResultFormat(result);
      const failed = results.filter((r) => !r.passed);
      expect(failed.length).toBeGreaterThan(0);
    });
  });

  describe("assertToolCalls", () => {
    it("子集匹配 — 包含所有期望工具时通过", () => {
      const actual = [
        { name: "search_attractions" },
        { name: "search_hotels" },
        { name: "geocode" },
      ];
      const result = assertToolCalls(actual, ["search_attractions", "search_hotels"]);
      expect(result.passed).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it("子集匹配 — 缺少期望工具时失败", () => {
      const actual = [{ name: "geocode" }];
      const result = assertToolCalls(actual, ["search_attractions"]);
      expect(result.passed).toBe(false);
      expect(result.missing).toEqual(["search_attractions"]);
    });
  });
});
