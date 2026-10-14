import { describe, expect, it } from "vitest";
import { evaluateExperience } from "../../../evaluation/dimensions/experience.js";
import { evaluatePractical } from "../../../evaluation/dimensions/practical.js";
import { evaluateSafety } from "../../../evaluation/dimensions/safety.js";
import { evaluateStructure } from "../../../evaluation/dimensions/structure.js";
import type { DimensionResult } from "../../../evaluation/dimensions.js";

function check(result: DimensionResult, name: string) {
  const evidence = result.checks.find((item) => item.name === name);
  expect(evidence, `Missing quality check: ${name}`).toBeDefined();
  return evidence;
}

describe("deterministic itinerary quality rules", () => {
  it("rejects empty structure with concrete field, day and city repair suggestions", async () => {
    const result = await evaluateStructure("北京两日游", "", {
      request: { city: "北京", days: 2 },
    });
    expect(result.passed).toBe(false);
    expect(check(result, "必填字段: 景点")?.score).toBe(0);
    expect(check(result, "天数标记")?.passed).toBe(false);
    expect(check(result, "城市匹配")?.passed).toBe(false);
    expect(result.suggestions).toContain("请包含具体的景点推荐");
    expect(result.suggestions).toContain("请包含明确的日期或天数信息");
  });

  it("supports Chinese daily headings and duplicate day labels without losing continuity", async () => {
    const result = await evaluateStructure(
      "北京市两日游",
      "## 行程安排：目的地北京\n### 第一天\n- 游览故宫\n### 第二天\n- 游览颐和园\n重复说明：Day 1",
      { request: { city: "北京市", days: 2 } },
    );
    expect(result.passed).toBe(true);
    expect(check(result, "天数连续性")?.detail).toBe("天数连续: 1,2");
    expect(check(result, "城市匹配")?.score).toBe(1);
  });

  it("reports mixed date formats and skipped day numbers independently", async () => {
    const result = await evaluateStructure(
      "北京三日游",
      "## 目的地：北京 2026-10-13\n### Day 1 / 第一天 / 10月13日\n- 景点故宫\n### Day 3\n- 景点颐和园",
    );
    expect(check(result, "日期格式一致性")?.passed).toBe(false);
    expect(check(result, "天数连续性")?.passed).toBe(false);
    expect(result.suggestions).toContain("请确保天数编号连续，不要跳跃");
  });

  it.each([
    [1100, true],
    [1101, false],
  ] as const)(
    "checks total budget at the documented 10 percent tolerance: %s",
    async (budget, passed) => {
      const result = await evaluatePractical(
        "北京两日游",
        `预算 ${budget} 元，上午参观故宫，地铁出行，住宿酒店`,
        { request: { city: "北京", days: 2, budget: 1000 } },
      );
      expect(check(result, "预算匹配")?.passed).toBe(passed);
      expect(check(result, "预算匹配")?.evidence).toBe(`${budget}元`);
      if (!passed)
        expect(result.suggestions).toContain("请调整行程以符合用户预算要求，或建议用户调整预算");
    },
  );

  it("flags unaffordable daily budget using fallback city references and suggests economic accommodation", async () => {
    const result = await evaluatePractical("新城市两日游", "总费用约 100 元", {
      request: { city: "新城市", days: 2, budget: 100 },
    });
    expect(check(result, "日均预算可行性")?.passed).toBe(false);
    expect(check(result, "日均预算可行性")?.detail).toContain("最低需要300元");
    expect(result.suggestions).toContain("日均预算过低，建议减少景点数量或选择更经济的住宿");
    expect(result.suggestions).toContain("请添加交通方式建议，帮助用户规划路线");
  });

  it.each([
    [1, false, "过短"],
    [2, true, "合理"],
    [7, false, "过长"],
  ] as const)(
    "detects timing pressure for %s attraction recommendations",
    async (count, passed, reason) => {
      const output = `### Day 1\n${Array.from({ length: count }, (_, index) => `景点 ${index}：具体安排说明及目的地开放规则待核实，避免交通延误。备注：开放规则请以官方公布为准，休息座椅和饮水服务位置需向工作人员咨询，晴雨情况可改变入口使用安排。`).join("\n")}`;
      const result = await evaluatePractical("一日游", output);
      const timing = check(result, "Day 1时间安排");
      expect(timing?.passed).toBe(passed);
      expect(timing?.detail).toContain(reason);
      expect(timing?.detail).toContain(`${count * 2}小时`);
    },
  );

  it("retains heuristic uncertainty instead of confusing its timing fallback with evidence", async () => {
    const result = await evaluatePractical("行程", "西湖、酒店、地铁、300元");
    expect(check(result, "预算信息")?.passed).toBe(true);
    expect(result.checks.find((item) => item.detail.includes("无法提取具体时间"))).toMatchObject({
      score: 0.5,
    });
    expect(
      result.checks.find((item) => item.name === "时间安排" && item.detail === "缺少具体时间安排")
        ?.passed,
    ).toBe(false);
  });

  it("treats illegal recommendations and undeveloped areas as failed safety evidence", async () => {
    const result = await evaluateSafety(
      "旅行",
      "未开发区域野泳，深夜去赌场，还推荐走私违禁品、毒品和红灯区。",
    );
    expect(result.passed).toBe(false);
    expect(check(result, "安全风险: 未开发区域")?.score).toBe(0);
    expect(check(result, "安全风险: 夜间安全")?.score).toBe(0.6);
    expect(result.checks.filter((item) => item.name === "违法内容")).toHaveLength(4);
    expect(result.suggestions).toEqual(["请移除违法内容建议"]);
  });

  it("separates advisory high-risk sport/terrain from hard prohibition and includes safety tips", async () => {
    const result = await evaluateSafety("旅行", "冲浪区域有急流，请注意安全并保管好财物。");
    expect(check(result, "安全风险: 高风险运动")?.passed).toBe(true);
    expect(check(result, "安全风险: 危险地形")?.score).toBe(0.6);
    expect(check(result, "安全提示")?.score).toBe(1);
  });

  it("identifies independent risks for elderly, children, pregnant and mobility-impaired travelers", async () => {
    const result = await evaluateSafety(
      "家庭旅行",
      "爬山到海拔3000米，凌晨出行，徒步8小时，亲子晚上酒吧和过山车。",
      { request: { city: "北京", days: 2, companions: "父母、孩子、孕妇、轮椅使用者" } },
    );
    for (const name of ["老人适配", "儿童适配", "孕妇适配", "行动不便者适配"])
      expect(check(result, name)?.passed).toBe(false);
    expect(check(result, "老人适配")?.detail).toContain("高强度运动、高海拔地区、作息不规律");
    expect(result.suggestions).toContain("为孕妇安排轻松的行程，避免刺激和拥挤的场所");
    expect(result.suggestions).toContain("选择无障碍设施完善的景点，避免需要大量步行的行程");
  });

  it.each([
    ["亲子动物园", 1, true],
    ["亲子动物园和酒吧", 0.6, false],
    ["看城市广场", 0.3, false],
  ] as const)("scores child suitability with evidence: %s", async (output, score, passed) => {
    const result = await evaluateSafety("亲子游", output, {
      request: { city: "北京", days: 1, companions: "孩子" },
    });
    expect(check(result, "儿童适配")).toMatchObject({ score, passed });
  });

  it("accepts low-intensity accessible itineraries while retaining missing accessibility confidence", async () => {
    const safe = await evaluateSafety("家庭游", "博物馆提供电梯和无障碍坡道，亲子互动展览。", {
      request: { city: "北京", days: 1, companions: "父母 孕妇 轮椅 孩子" },
    });
    expect(safe.passed).toBe(true);
    expect(check(safe, "行动不便者适配")?.score).toBe(1);
    const generic = await evaluateSafety("旅行", "博物馆参观", {
      request: { city: "北京", days: 1, companions: "朋友" },
    });
    expect(check(generic, "人群适配")?.score).toBe(0.8);
    const unspecifiedAccess = await evaluateSafety("旅行", "博物馆参观", {
      request: { city: "北京", days: 1, companions: "轮椅" },
    });
    expect(check(unspecifiedAccess, "行动不便者适配")?.score).toBe(0.7);
  });

  it("provides three concrete experience improvements when actionable, cultural and preference evidence is absent", async () => {
    const result = await evaluateExperience("摄影小众游", "无细节", {
      request: { city: "北京", days: 1, keywords: ["摄影", "小众"] },
    });
    expect(result.passed).toBe(false);
    expect(result.suggestions).toEqual([
      "补充预约/门票/交通/开放时间等可执行信息",
      "补充当地文化礼仪、错峰建议或景区规则提示",
      "显式回应同行人群、兴趣关键词和预算偏好",
    ]);
    expect(check(result, "个性化匹配")?.score).toBe(0.2);
  });

  it("uses explicit preference aliases and a half-match threshold rather than requiring literal wording", async () => {
    const result = await evaluateExperience(
      "旅行",
      "适合老人，提前预约；地铁到历史博物馆，错峰参观。",
      {
        request: { city: "北京", days: 1, companions: "父母", keywords: ["文化", "摄影", "小众"] },
      },
    );
    expect(check(result, "个性化匹配")).toMatchObject({
      passed: true,
      score: 0.5,
      evidence: "父母、文化",
    });
    expect(check(result, "操作指引")?.score).toBe(1);
    expect(check(result, "文化适配")?.score).toBe(1);
  });

  it("extracts preferences from input and distinguishes one/two operational signals", async () => {
    const result = await evaluateExperience(
      "带孩子美食休闲游",
      "亲子互动展览，餐厅特色菜，少走路；预约门票，地铁到达。当地小吃。",
    );
    expect(check(result, "个性化匹配")?.score).toBe(1);
    expect(check(result, "操作指引")?.score).toBe(0.8);
    expect(check(result, "文化适配")?.score).toBe(0.8);
    const noPreferences = await evaluateExperience("旅行", "可选预约门票");
    expect(check(noPreferences, "个性化匹配")?.score).toBe(0.8);
    expect(check(noPreferences, "操作指引")?.score).toBe(0.5);
    const plain = await evaluateExperience("旅行", "普通文字");
    expect(check(plain, "个性化匹配")?.score).toBe(0.6);
  });
});
