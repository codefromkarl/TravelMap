/**
 * 实用维度评估器
 *
 * 评估维度：
 *   - 可执行性：行程是否真的可以执行
 *   - 预算合理性：费用估算是否合理
 *   - 时间安排合理性：每天时间分配是否合理
 *
 * 设计原则：
 *   - 基于客观数据和规则，不依赖 LLM（无偏见）
 *   - 使用真实数据作为参考基准
 */

import type { CheckResult, DimensionResult, EvalContext } from "../dimensions.js";

// ─── 参考数据 ──────────────────────────────────────────────

/** 景点平均游览时间（分钟） */
const ATTRACTION_DURATIONS: Record<string, number> = {
  博物馆: 180,
  公园: 90,
  寺庙: 60,
  古迹: 120,
  商场: 120,
  美食街: 90,
  自然景观: 120,
  主题公园: 300,
};

/** 餐饮平均时间（分钟） */
const MEAL_DURATIONS = {
  breakfast: 30,
  lunch: 60,
  dinner: 90,
};

/** 合理的每日游览时间范围（小时） */
const REASONABLE_DAILY_HOURS = { min: 3, max: 12 };

/** 餐饮人均价格参考（元） */
const MEAL_PRICES: Record<string, { budget: number; mid: number; luxury: number }> = {
  北京: { budget: 30, mid: 80, luxury: 200 },
  上海: { budget: 35, mid: 100, luxury: 250 },
  广州: { budget: 25, mid: 70, luxury: 180 },
  成都: { budget: 20, mid: 60, luxury: 150 },
  重庆: { budget: 20, mid: 60, luxury: 150 },
  杭州: { budget: 30, mid: 80, luxury: 200 },
  西安: { budget: 25, mid: 70, luxury: 180 },
};

/** 住宿均价参考（元/晚） */
const HOTEL_PRICES: Record<string, { budget: number; mid: number; luxury: number }> = {
  北京: { budget: 200, mid: 400, luxury: 800 },
  上海: { budget: 250, mid: 500, luxury: 1000 },
  广州: { budget: 180, mid: 350, luxury: 700 },
  成都: { budget: 150, mid: 300, luxury: 600 },
  重庆: { budget: 150, mid: 300, luxury: 600 },
  杭州: { budget: 200, mid: 400, luxury: 800 },
  西安: { budget: 150, mid: 300, luxury: 600 },
};

// ─── 实用性评估 ─────────────────────────────────────────────

export async function evaluatePractical(
  _input: string,
  output: string,
  context?: EvalContext,
): Promise<DimensionResult> {
  const checks: CheckResult[] = [];

  // 1. 可执行性检查
  checks.push(...checkFeasibility(output, context));

  // 2. 预算合理性检查
  checks.push(...checkBudgetReasonability(output, context));

  // 3. 时间安排合理性检查
  checks.push(...checkTimingReasonability(output));

  // 计算总分
  const totalScore = checks.reduce((sum, c) => sum + c.score, 0) / checks.length;
  const allPassed = checks.every((c) => c.passed);

  return {
    dimensionId: "practical",
    score: totalScore,
    passed: allPassed,
    checks,
    failureReason: allPassed ? undefined : "实用性评估未通过",
    suggestions: generatePracticalSuggestions(checks),
  };
}

// ─── 可执行性检查 ──────────────────────────────────────────

function checkFeasibility(output: string, context?: EvalContext): CheckResult[] {
  const checks: CheckResult[] = [];

  // 1. 景点是否真实存在（通过关键词匹配）
  const attractionKeywords =
    /故宫|长城|天安门|颐和园|西湖|外滩|东方明珠|兵马俑|大雁塔|锦里|宽窄巷子|洪崖洞|解放碑/;
  const hasRealAttractions = attractionKeywords.test(output);
  checks.push({
    name: "景点真实性",
    passed: hasRealAttractions,
    score: hasRealAttractions ? 1.0 : 0.6,
    detail: hasRealAttractions ? "包含知名真实景点" : "未提及知名景点，可能需要验证",
  });

  // 2. 是否有具体的时间安排
  const hasTimeArrangement = /\d+[点时:：]\d*|上午|下午|晚上|早上|中午/.test(output);
  checks.push({
    name: "时间安排",
    passed: hasTimeArrangement,
    score: hasTimeArrangement ? 1.0 : 0.5,
    detail: hasTimeArrangement ? "包含具体时间安排" : "缺少具体时间安排",
  });

  // 3. 是否有交通建议
  const hasTransport = /地铁|公交|打车|步行|自驾|高铁|火车|飞机|出租/.test(output);
  checks.push({
    name: "交通建议",
    passed: hasTransport,
    score: hasTransport ? 1.0 : 0.6,
    detail: hasTransport ? "包含交通建议" : "缺少交通建议",
  });

  // 4. 是否有住宿建议
  const hasAccommodation = /酒店|民宿|住宿|宾馆|旅馆|青旅/.test(output);
  checks.push({
    name: "住宿建议",
    passed: hasAccommodation,
    score: hasAccommodation ? 1.0 : 0.6,
    detail: hasAccommodation ? "包含住宿建议" : "缺少住宿建议",
  });

  return checks;
}

// ─── 预算合理性检查 ─────────────────────────────────────────

function checkBudgetReasonability(output: string, context?: EvalContext): CheckResult[] {
  const checks: CheckResult[] = [];

  // 提取预算数字
  const budgetMatch = output.match(/预算.*?(\d+).*?元|总.*?费用.*?(\d+).*?元|约.*?[¥￥](\d+)/);
  const mentionedBudget = budgetMatch
    ? parseInt(budgetMatch[1] ?? budgetMatch[2] ?? budgetMatch[3] ?? "0", 10)
    : 0;

  // 如果用户指定了预算
  if (context?.request?.budget) {
    const userBudget = context.request.budget;
    const days = context.request.days ?? 1;
    const dailyBudget = userBudget / days;

    // 检查是否在预算范围内
    const withinBudget = mentionedBudget === 0 || mentionedBudget <= userBudget * 1.1; // 允许10%误差
    checks.push({
      name: "预算匹配",
      passed: withinBudget,
      score: withinBudget ? 1.0 : 0.3,
      detail: withinBudget
        ? `预算合理（用户要求: ${userBudget}元）`
        : `超出预算（用户要求: ${userBudget}元，实际: ${mentionedBudget}元）`,
      evidence: mentionedBudget > 0 ? `${mentionedBudget}元` : undefined,
    });

    // 检查日均预算是否合理
    const city = context.request.city;
    const cityHotelPrices = HOTEL_PRICES[city] ?? HOTEL_PRICES["北京"]!;
    const minDailyBudget = cityHotelPrices.budget + 100; // 最低住宿+餐饮

    const dailyBudgetReasonable = dailyBudget >= minDailyBudget;
    checks.push({
      name: "日均预算可行性",
      passed: dailyBudgetReasonable,
      score: dailyBudgetReasonable ? 1.0 : 0.4,
      detail: dailyBudgetReasonable
        ? `日均预算${Math.round(dailyBudget)}元可行`
        : `日均预算${Math.round(dailyBudget)}元过低，最低需要${minDailyBudget}元`,
    });
  } else {
    // 没有指定预算，只检查是否提及费用
    const hasBudgetInfo = /费用|价格|元|¥|￥|预算|花费/.test(output);
    checks.push({
      name: "预算信息",
      passed: hasBudgetInfo,
      score: hasBudgetInfo ? 1.0 : 0.5,
      detail: hasBudgetInfo ? "包含预算/费用信息" : "缺少预算/费用信息",
    });
  }

  return checks;
}

// ─── 时间安排合理性检查 ─────────────────────────────────────

function checkTimingReasonability(output: string): CheckResult[] {
  const checks: CheckResult[] = [];

  // 提取每天的行程时间
  const daySections = output.split(/(?=Day\s*\d+|第[一二三四五六七八九十]+天)/i);

  for (const section of daySections) {
    if (section.length < 50) continue; // 跳过太短的段落

    // 估算游览时间
    const attractionCount = (section.match(/景点|游览|参观|游玩|去/g) ?? []).length;
    const estimatedHours = attractionCount * 2; // 粗略估计每个景点2小时

    if (estimatedHours > 0) {
      const withinRange =
        estimatedHours >= REASONABLE_DAILY_HOURS.min &&
        estimatedHours <= REASONABLE_DAILY_HOURS.max;

      const dayMatch = section.match(/Day\s*(\d+)|第([一二三四五六七八九十]+)天/i);
      const dayLabel = dayMatch ? dayMatch[0] : "某天";

      checks.push({
        name: `${dayLabel}时间安排`,
        passed: withinRange,
        score: withinRange ? 1.0 : estimatedHours > REASONABLE_DAILY_HOURS.max ? 0.3 : 0.6,
        detail: withinRange
          ? `预估游览时间${estimatedHours}小时，合理`
          : `预估游览时间${estimatedHours}小时，${estimatedHours > REASONABLE_DAILY_HOURS.max ? "过长" : "过短"}`,
      });
    }
  }

  // 如果没有提取到具体时间，给默认分
  if (checks.length === 0) {
    checks.push({
      name: "时间安排",
      passed: true,
      score: 0.5,
      detail: "无法提取具体时间安排，默认通过",
    });
  }

  return checks;
}

// ─── 建议生成 ──────────────────────────────────────────────

function generatePracticalSuggestions(checks: CheckResult[]): string[] {
  const suggestions: string[] = [];

  for (const check of checks) {
    if (!check.passed) {
      switch (true) {
        case check.name.includes("预算匹配"):
          suggestions.push("请调整行程以符合用户预算要求，或建议用户调整预算");
          break;
        case check.name.includes("日均预算"):
          suggestions.push("日均预算过低，建议减少景点数量或选择更经济的住宿");
          break;
        case check.name.includes("时间安排"):
          if (check.detail.includes("过长")) {
            suggestions.push("每天行程过长，建议减少景点数量");
          } else {
            suggestions.push("每天行程过短，可以增加景点或延长游览时间");
          }
          break;
        case check.name.includes("交通建议"):
          suggestions.push("请添加交通方式建议，帮助用户规划路线");
          break;
      }
    }
  }

  return [...new Set(suggestions)];
}
