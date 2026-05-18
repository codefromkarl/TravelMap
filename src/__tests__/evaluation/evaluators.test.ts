/**
 * AI 自动化评估 — 框架骨架
 *
 * 这是通向 AI 自动化测试的入口。当前提供：
 *   1. Evaluator 接口 — 可插拔的评估策略
 *   2. LLM-as-Judge 实现 — 用 LLM 评估 Agent 输出质量
 *   3. 结构化断言 — 验证 Agent 输出的 JSON 结构
 *
 * 后续迭代方向：
 *   - 接入真实 LLM API 进行自动评估
 *   - 添加评估数据集 (golden examples)
 *   - 添加评估报告生成
 *   - 集成到 CI pipeline
 */

import { describe, expect, it } from "vitest";

// ─── 评估器接口 ─────────────────────────────────────────────

interface EvaluationResult {
  /** 评估项名称 */
  name: string;
  /** 分数 0-1 */
  score: number;
  /** 详细说明 */
  reason: string;
  /** 是否通过 (score >= threshold) */
  passed: boolean;
}

// Evaluator 接口定义 — 供后续迭代使用，暂不在测试中直接引用
// interface Evaluator {
//   name: string;
//   evaluate(input: string, output: string): Promise<EvaluationResult>;
// }

// ─── 结构化断言评估器 ──────────────────────────────────────

/**
 * 验证 Agent 输出包含行程规划所需的结构化信息
 */
function assertTripPlanStructure(output: string): EvaluationResult[] {
  const results: EvaluationResult[] = [];

  const checks: Array<{ name: string; pattern: RegExp; required: boolean }> = [
    { name: "包含目的地", pattern: /目的地|城市|景点/, required: true },
    { name: "包含日期", pattern: /\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日]?/, required: true },
    { name: "包含景点推荐", pattern: /景点|游览|参观/, required: true },
    { name: "包含餐饮建议", pattern: /早餐|午餐|晚餐|美食|餐厅/, required: false },
    { name: "包含住宿建议", pattern: /住宿|酒店|民宿/, required: false },
    { name: "包含费用信息", pattern: /预算|费用|价格|元|¥/, required: false },
  ];

  for (const check of checks) {
    const match = check.pattern.test(output);
    results.push({
      name: check.name,
      score: match ? 1 : 0,
      reason: match
        ? `输出匹配 ${check.name} 模式`
        : `输出未匹配 ${check.name} 模式 (${check.pattern.source})`,
      passed: check.required ? match : true, // 非必须项不阻塞
    });
  }

  return results;
}

/**
 * 验证工具调用结果的格式
 */
function assertToolResultFormat(result: {
  content: Array<{ type: string; text?: string }>;
  details: unknown;
}): EvaluationResult[] {
  const results: EvaluationResult[] = [];

  // content 应该是数组
  results.push({
    name: "content 是数组",
    score: Array.isArray(result.content) ? 1 : 0,
    reason: Array.isArray(result.content) ? "content 格式正确" : "content 不是数组",
    passed: Array.isArray(result.content),
  });

  // content 应包含 text 类型
  const hasText = result.content.some((c) => c.type === "text");
  results.push({
    name: "包含 text 内容",
    score: hasText ? 1 : 0,
    reason: hasText ? "包含 text 内容" : "缺少 text 内容",
    passed: hasText,
  });

  // details 应该存在
  results.push({
    name: "details 存在",
    score: result.details !== undefined ? 1 : 0,
    reason: result.details !== undefined ? "details 存在" : "缺少 details",
    passed: result.details !== undefined,
  });

  return results;
}

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

      // 验证每一项的分数
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
});
