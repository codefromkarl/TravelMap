import type { CheckResult, DimensionResult, EvalContext } from "../dimensions.js";

/**
 * 体验维度评估器
 *
 * 评估维度：
 *   - 用户体验：是否给出清晰、可操作的行程使用指引
 *   - 文化适配：是否提供本地礼仪、预约、开放时间等文化/场景提示
 *   - 个性化匹配：是否显式响应同行人群、兴趣关键词、预算偏好等需求
 *
 * 设计原则：
 *   - 使用确定性规则，避免额外 LLM 成本
 *   - 未提供对应上下文时不做硬性惩罚，仅检查通用体验质量
 */

export async function evaluateExperience(
  input: string,
  output: string,
  context?: EvalContext,
): Promise<DimensionResult> {
  const checks: CheckResult[] = [
    checkActionability(output),
    checkCultureAdaptation(output),
    checkPersonalization(input, output, context),
  ];

  const totalScore = checks.reduce((sum, c) => sum + c.score, 0) / checks.length;
  const allPassed = checks.every((c) => c.passed);

  return {
    dimensionId: "experience",
    score: totalScore,
    passed: allPassed,
    checks,
    failureReason: allPassed ? undefined : "体验评估未通过",
    suggestions: generateExperienceSuggestions(checks),
  };
}

function checkActionability(output: string): CheckResult {
  const actionSignals = [
    /预约|购票|门票|开放时间|闭馆|营业时间/,
    /交通|地铁|公交|打车|步行|换乘|路线/,
    /注意事项|建议|贴士|Tips?|避开|提前/iu,
  ];
  const matchedCount = actionSignals.filter((pattern) => pattern.test(output)).length;
  const passed = matchedCount >= 2;

  return {
    name: "操作指引",
    passed,
    score: matchedCount >= 3 ? 1 : matchedCount === 2 ? 0.8 : matchedCount === 1 ? 0.5 : 0.2,
    detail: passed ? "包含预约/交通/注意事项等可操作信息" : "缺少足够的可执行操作指引",
  };
}

function checkCultureAdaptation(output: string): CheckResult {
  const cultureSignals = [
    /礼仪|习俗|禁忌|尊重|着装|安静|排队|文明/,
    /本地|当地|特色|非遗|历史|文化|讲解/,
    /旺季|淡季|节假日|人流|错峰|闭馆|限流/,
  ];
  const matchedCount = cultureSignals.filter((pattern) => pattern.test(output)).length;
  const passed = matchedCount >= 1;

  return {
    name: "文化适配",
    passed,
    score: matchedCount >= 2 ? 1 : matchedCount === 1 ? 0.8 : 0.4,
    detail: passed ? "包含本地文化、礼仪或时段适配提示" : "缺少文化/场景适配提示",
  };
}

function checkPersonalization(input: string, output: string, context?: EvalContext): CheckResult {
  const companions = context?.request?.companions ?? extractCompanionHint(input);
  const keywords = context?.request?.keywords ?? extractKeywordHints(input);

  const expectedSignals: string[] = [];
  if (companions) expectedSignals.push(companions);
  expectedSignals.push(...keywords);

  if (expectedSignals.length === 0) {
    const hasPreferenceLanguage = /适合|偏好|可选|如果你|根据.*需求|预算|节奏/.test(output);
    return {
      name: "个性化匹配",
      passed: true,
      score: hasPreferenceLanguage ? 0.8 : 0.6,
      detail: hasPreferenceLanguage ? "包含通用个性化表述" : "用户未提供明确偏好，默认通过",
    };
  }

  const matched = expectedSignals.filter(
    (signal) => output.includes(signal) || fuzzyMatch(signal, output),
  );
  const score = matched.length / expectedSignals.length;

  return {
    name: "个性化匹配",
    passed: score >= 0.5,
    score: Math.max(0.2, score),
    detail:
      matched.length > 0
        ? `已响应偏好: ${matched.join("、")}`
        : `未明显响应用户偏好: ${expectedSignals.join("、")}`,
    evidence: matched.join("、") || undefined,
  };
}

function extractCompanionHint(input: string): string | undefined {
  const match = input.match(/老人|父母|长辈|亲子|孩子|儿童|情侣|朋友|同事|孕妇|行动不便/);
  return match?.[0];
}

function extractKeywordHints(input: string): string[] {
  const keywords = [
    "美食",
    "文化",
    "博物馆",
    "自然",
    "徒步",
    "购物",
    "摄影",
    "小众",
    "亲子",
    "休闲",
  ];
  return keywords.filter((keyword) => input.includes(keyword));
}

function fuzzyMatch(signal: string, output: string): boolean {
  const aliases: Record<string, RegExp> = {
    父母: /老人|长辈|爸妈|低强度|少走路/,
    长辈: /老人|父母|爸妈|低强度|少走路/,
    孩子: /儿童|亲子|小朋友|游乐|互动/,
    儿童: /孩子|亲子|小朋友|游乐|互动/,
    美食: /餐厅|小吃|夜市|本地菜|特色菜/,
    文化: /历史|博物馆|非遗|古迹|讲解/,
    休闲: /轻松|慢节奏|少走路|咖啡|公园/,
  };
  return aliases[signal]?.test(output) ?? false;
}

function generateExperienceSuggestions(checks: CheckResult[]): string[] {
  const suggestions: string[] = [];
  for (const check of checks) {
    if (check.passed) continue;
    if (check.name === "操作指引") {
      suggestions.push("补充预约/门票/交通/开放时间等可执行信息");
    } else if (check.name === "文化适配") {
      suggestions.push("补充当地文化礼仪、错峰建议或景区规则提示");
    } else if (check.name === "个性化匹配") {
      suggestions.push("显式回应同行人群、兴趣关键词和预算偏好");
    }
  }
  return suggestions;
}
