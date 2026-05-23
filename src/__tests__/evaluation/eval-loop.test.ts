/**
 * 评估体系测试
 *
 * 测试各维度评估器和评估运行器
 */

import { beforeEach, describe, expect, it } from "vitest";
import { AttributionAnalyzer } from "../../evaluation/attribution-analyzer.js";
import { evaluateExperience } from "../../evaluation/dimensions/experience.js";
import { evaluatePractical } from "../../evaluation/dimensions/practical.js";
import { evaluateSafety } from "../../evaluation/dimensions/safety.js";
import { evaluateStructure } from "../../evaluation/dimensions/structure.js";
import type { EvalReport } from "../../evaluation/dimensions.js";
import { EvalRunner } from "../../evaluation/runner.js";

describe("评估维度测试", () => {
  describe("结构维度", () => {
    it("完整行程应通过结构检查", async () => {
      const output = `
## 北京三日游

**目的地**: 北京
**日期**: 2025-06-01 至 2025-06-03

### Day 1
- 景点: 故宫博物院（游览 3 小时）
- 午餐: 南锣鼓巷小吃
- 晚餐: 全聚德烤鸭
- 住宿: 如家酒店

### Day 2
- 景点: 八达岭长城
- 午餐: 长城脚下农家菜
- 晚餐: 簋街小吃

### Day 3
- 景点: 颐和园
- 午餐: 五道口韩餐
- 下午返程
      `;

      const result = await evaluateStructure("帮我规划北京三日游", output);
      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThan(0.7);
    });

    it("缺少目的地应失败", async () => {
      const output = `
### Day 1
- 景点: 故宫博物院
- 午餐: 小吃
      `;

      const result = await evaluateStructure("帮我规划北京三日游", output);
      expect(result.passed).toBe(false);
      expect(
        result.checks.some(
          (c: { name: string; passed: boolean }) => c.name.includes("目的地") && !c.passed,
        ),
      ).toBe(true);
    });

    it("天数不连续应检测到", async () => {
      const output = `
## 行程

### Day 1
- 景点: A

### Day 3
- 景点: B
      `;

      const result = await evaluateStructure("三日游", output);
      const continuityCheck = result.checks.find((c: { name: string; passed: boolean }) =>
        c.name.includes("连续性"),
      );
      expect(continuityCheck?.passed).toBe(false);
    });
  });

  describe("实用维度", () => {
    it("预算匹配应通过", async () => {
      const output = `
## 成都两日游

**总预算**: 约 900 元

### Day 1
- 景点: 武侯祠
- 住宿: 经济型酒店（150元/晚）
      `;

      const context = {
        request: {
          city: "成都",
          days: 2,
          budget: 1000,
        },
      };

      const result = await evaluatePractical("成都两日游，预算1000元", output, context);
      const budgetCheck = result.checks.find((c: { name: string; passed: boolean }) =>
        c.name.includes("预算"),
      );
      expect(budgetCheck?.passed).toBe(true);
    });

    it("超出预算应检测到", async () => {
      const output = `
## 成都两日游

**总预算**: 约 2000 元

### Day 1
- 景点: 武侯祠
- 住宿: 五星级酒店（800元/晚）
      `;

      const context = {
        request: {
          city: "成都",
          days: 2,
          budget: 1000,
        },
      };

      const result = await evaluatePractical("成都两日游，预算1000元", output, context);
      const budgetCheck = result.checks.find((c: { name: string; passed: boolean }) =>
        c.name.includes("预算"),
      );
      expect(budgetCheck?.passed).toBe(false);
    });
  });

  describe("体验维度", () => {
    it("包含操作指引、文化提示和个性化响应时应通过", async () => {
      const output = `
## 杭州亲子文化两日游

### Day 1
- 上午 9:00 参观浙江省博物馆，建议提前预约门票，亲子互动展区适合孩子。
- 午餐选择本地杭帮菜，注意排队并错峰用餐。
- 下午步行到西湖，了解当地历史文化，注意防晒。
- 交通：地铁 + 步行。
      `;

      const result = await evaluateExperience("带孩子杭州文化游", output, {
        request: { city: "杭州", days: 2, companions: "孩子", keywords: ["文化"] },
      });

      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThan(0.7);
    });

    it("缺少体验信息时应给出改进建议", async () => {
      const output = "杭州两日游：第一天去西湖，第二天去灵隐寺。";

      const result = await evaluateExperience("带孩子杭州文化游", output, {
        request: { city: "杭州", days: 2, companions: "孩子", keywords: ["文化"] },
      });

      expect(result.passed).toBe(false);
      expect(result.suggestions?.length).toBeGreaterThan(0);
    });
  });

  describe("安全维度", () => {
    it("普通行程应通过安全检查", async () => {
      const output = `
## 北京三日游

### Day 1
- 景点: 故宫博物院
- 午餐: 南锣鼓巷
      `;

      const result = await evaluateSafety("北京三日游", output);
      expect(result.passed).toBe(true);
    });

    it("不适合老人的行程应检测到", async () => {
      const output = `
## 登山之旅

### Day 1
- 景点: 泰山登顶（徒步8小时）
- 景点: 华山栈道
      `;

      const context = {
        request: {
          city: "泰安",
          days: 2,
          companions: "带父母",
        },
      };

      const result = await evaluateSafety("带父母去爬山", output, context);
      const elderlyCheck = result.checks.find((c: { name: string; passed: boolean }) =>
        c.name.includes("老人"),
      );
      expect(elderlyCheck?.passed).toBe(false);
    });
  });
});

describe("评估运行器", () => {
  let runner: EvalRunner;

  beforeEach(() => {
    runner = new EvalRunner({
      enableLLM: false, // 测试时禁用 LLM
      detectRegression: false,
      generateAttribution: false,
    });
  });

  it("应生成完整报告", async () => {
    const input = "帮我规划北京三日游";
    const output = `
## 北京三日游

**目的地**: 北京
**日期**: 2025-06-01 至 2025-06-03

### Day 1
- 景点: 故宫博物院
- 午餐: 南锣鼓巷
    `;

    const result = await runner.run(input, output);

    expect(result.report).toBeDefined();
    expect(result.report.id).toBeDefined();
    expect(result.report.dimensions.map((d) => d.dimensionId)).toEqual([
      "structure",
      "semantic",
      "practical",
      "safety",
      "experience",
    ]);
    expect(result.report.overallScore).toBeGreaterThan(0);
    expect(result.report.dimensions.length).toBeGreaterThan(0);
  });

  it("批量评估应生成汇总", async () => {
    const scenarios = [
      {
        id: "test-1",
        input: "北京三日游",
        output: "## 北京三日游\n**目的地**: 北京\n### Day 1\n- 景点: 故宫",
      },
      {
        id: "test-2",
        input: "上海两日游",
        output: "## 上海两日游\n**目的地**: 上海\n### Day 1\n- 景点: 外滩",
      },
    ];

    const result = await runner.runBatch(scenarios);

    expect(result.reports.length).toBe(2);
    expect(result.overallScore).toBeGreaterThan(0);
    expect(result.passRate).toBeDefined();
  });
});

describe("归因分析器", () => {
  let analyzer: AttributionAnalyzer;

  beforeEach(() => {
    analyzer = new AttributionAnalyzer();
  });

  it("应分析失败原因", () => {
    const report: EvalReport = {
      id: "test-report",
      timestamp: new Date().toISOString(),
      input: "北京三日游",
      output: "无目的地信息",
      overallScore: 0.3,
      passed: false,
      dimensions: [
        {
          dimensionId: "structure",
          score: 0.2,
          passed: false,
          checks: [
            {
              name: "必填字段: 目的地",
              passed: false,
              score: 0,
              detail: "缺少目的地信息",
            },
          ],
          failureReason: "结构检查未通过",
        },
      ],
      failedRequired: ["structure"],
      allSuggestions: ["请在输出中明确标注目的地城市"],
      metadata: {
        model: "test",
        provider: "test",
        duration: 100,
      },
    };

    const result = analyzer.analyzeReport(report);

    expect(result.failureCategories.length).toBeGreaterThan(0);
    expect(result.rootCauses.length).toBeGreaterThan(0);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });
});
