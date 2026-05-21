/**
 * 结构维度评估器
 *
 * 评估维度：
 *   - 完整性：必填字段是否存在
 *   - 格式规范：日期格式、天数连续性、结构层级
 *
 * 设计原则：
 *   - 纯正则 + 代码检查，不依赖 LLM（无偏见）
 *   - 所有检查都有明确的通过/失败标准
 */

import type { CheckResult, DimensionResult, EvalContext } from "../dimensions.js";

// ─── 结构完整性评估 ─────────────────────────────────────────

export async function evaluateStructure(
  _input: string,
  output: string,
  context?: EvalContext,
): Promise<DimensionResult> {
  const checks: CheckResult[] = [];

  // 1. 必填字段检查
  checks.push(...checkRequiredFields(output));

  // 2. 日期格式检查
  checks.push(...checkDateFormats(output));

  // 3. 天数连续性检查
  checks.push(...checkDayContinuity(output));

  // 4. 结构层级检查
  checks.push(...checkStructureHierarchy(output));

  // 5. 城市匹配检查（如果有上下文）
  if (context?.request?.city) {
    checks.push(checkCityMatch(output, context.request.city));
  }

  // 计算总分
  const totalScore = checks.reduce((sum, c) => sum + c.score, 0) / checks.length;
  const allPassed = checks.every((c) => c.passed);

  return {
    dimensionId: "structure",
    score: totalScore,
    passed: allPassed,
    checks,
    failureReason: allPassed ? undefined : "结构检查未通过",
    suggestions: allPassed ? [] : generateStructureSuggestions(checks),
  };
}

// ─── 检查函数 ──────────────────────────────────────────────

function checkRequiredFields(output: string): CheckResult[] {
  const fields = [
    {
      name: "目的地",
      pattern: /目的地|城市|出发.*(?:到|去|至)|行程.*(?:规划|安排)/,
      weight: 1.0,
    },
    {
      name: "日期/天数",
      pattern:
        /\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日]?|Day\s*\d|第[一二三四五六七八九十]+天|\d+天|\d+日/,
      weight: 1.0,
    },
    {
      name: "景点",
      pattern: /景点|游览|参观|游玩|去.*(?:公园|博物馆|广场|寺|庙|山|湖|塔|宫|园)/,
      weight: 1.0,
    },
  ];

  return fields.map((field) => {
    const matched = field.pattern.test(output);
    return {
      name: `必填字段: ${field.name}`,
      passed: matched,
      score: matched ? 1.0 : 0.0,
      detail: matched ? `包含${field.name}信息` : `缺少${field.name}信息`,
      evidence: matched ? extractMatch(output, field.pattern) : undefined,
    };
  });
}

function checkDateFormats(output: string): CheckResult[] {
  const checks: CheckResult[] = [];

  // 检查日期格式一致性
  const datePatterns = [
    /\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日]?/g, // 2025-06-01 或 2025年6月1日
    /Day\s*\d+/gi, // Day 1
    /第[一二三四五六七八九十]+天/g, // 第一天
    /\d+月\d+日/g, // 6月1日
  ];

  const foundFormats: string[] = [];
  for (const pattern of datePatterns) {
    const matches = output.match(pattern);
    if (matches && matches.length > 0) {
      foundFormats.push(pattern.source);
    }
  }

  // 至少有一种日期格式
  checks.push({
    name: "日期格式存在",
    passed: foundFormats.length > 0,
    score: foundFormats.length > 0 ? 1.0 : 0.0,
    detail: foundFormats.length > 0 ? "包含日期格式" : "缺少日期信息",
  });

  // 格式一致性（不混用多种格式）
  const consistent = foundFormats.length <= 2; // 允许最多2种格式（如日期+Day N）
  checks.push({
    name: "日期格式一致性",
    passed: consistent,
    score: consistent ? 1.0 : 0.5,
    detail: consistent ? "日期格式一致" : "混用多种日期格式，可能造成混淆",
  });

  return checks;
}

function checkDayContinuity(output: string): CheckResult[] {
  const checks: CheckResult[] = [];

  // 提取天数标记
  const dayMarkers = extractDayMarkers(output);

  if (dayMarkers.length === 0) {
    checks.push({
      name: "天数标记",
      passed: false,
      score: 0.0,
      detail: "未找到天数标记（Day N 或第N天）",
    });
    return checks;
  }

  // 检查连续性
  const sorted = [...dayMarkers].sort((a, b) => a - b);
  const isContinuous = sorted.every((val, idx) => idx === 0 || val === sorted[idx - 1]! + 1);

  checks.push({
    name: "天数连续性",
    passed: isContinuous,
    score: isContinuous ? 1.0 : 0.5,
    detail: isContinuous ? `天数连续: ${sorted.join(",")}` : `天数不连续: ${sorted.join(",")}`,
  });

  // 检查天数与请求匹配（如果有上下文）
  // 这个在外面处理

  return checks;
}

function checkStructureHierarchy(output: string): CheckResult[] {
  const checks: CheckResult[] = [];

  // 检查是否有层级结构（标题、列表等）
  const hasHeadings = /^#{1,3}\s+.+$/m.test(output) || /^\*\*.+\*\*$/m.test(output);
  const hasLists = /^[-*]\s+.+$/m.test(output) || /^\d+\.\s+.+$/m.test(output);

  checks.push({
    name: "标题结构",
    passed: hasHeadings,
    score: hasHeadings ? 1.0 : 0.5,
    detail: hasHeadings ? "包含标题结构" : "缺少标题结构，可读性较差",
  });

  checks.push({
    name: "列表结构",
    passed: hasLists,
    score: hasLists ? 1.0 : 0.5,
    detail: hasLists ? "包含列表结构" : "缺少列表结构，信息组织较差",
  });

  // 检查每天是否有独立段落
  const daySections = output.split(/(?=Day\s*\d+|第[一二三四五六七八九十]+天)/i);
  const hasMultipleSections = daySections.length > 2; // 至少2天+其他内容
  checks.push({
    name: "按天分段",
    passed: hasMultipleSections,
    score: hasMultipleSections ? 1.0 : 0.5,
    detail: hasMultipleSections ? "行程按天分段展示" : "未按天分段，结构不清晰",
  });

  return checks;
}

function checkCityMatch(output: string, expectedCity: string): CheckResult {
  const cityPatterns = [
    expectedCity,
    expectedCity.replace(/市$/, ""), // 去掉"市"后缀
    expectedCity + "市",
  ];

  const matched = cityPatterns.some((city) => output.includes(city));

  return {
    name: "城市匹配",
    passed: matched,
    score: matched ? 1.0 : 0.0,
    detail: matched ? `输出包含目标城市: ${expectedCity}` : `输出未包含目标城市: ${expectedCity}`,
    evidence: matched ? expectedCity : undefined,
  };
}

// ─── 辅助函数 ──────────────────────────────────────────────

function extractMatch(text: string, pattern: RegExp): string | undefined {
  const match = text.match(pattern);
  return match ? match[0] : undefined;
}

function extractDayMarkers(text: string): number[] {
  const markers: number[] = [];

  // Day N 格式
  const dayMatches = text.matchAll(/Day\s*(\d+)/gi);
  for (const match of dayMatches) {
    markers.push(parseInt(match[1]!, 10));
  }

  // 第N天 格式
  const chineseDayMap: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  const chineseMatches = text.matchAll(/第([一二三四五六七八九十]+)天/g);
  for (const match of chineseMatches) {
    const num = chineseDayMap[match[1]!];
    if (num) markers.push(num);
  }

  // N天 格式（如 "3天"、"三天"）
  const simpleDayMatch = text.match(/(\d+)天/);
  if (simpleDayMatch) {
    // 这是总天数，不是每天的标记
  }

  return [...new Set(markers)];
}

function generateStructureSuggestions(checks: CheckResult[]): string[] {
  const suggestions: string[] = [];

  for (const check of checks) {
    if (!check.passed) {
      switch (check.name) {
        case "必填字段: 目的地":
          suggestions.push("请在输出中明确标注目的地城市");
          break;
        case "必填字段: 日期/天数":
          suggestions.push("请包含明确的日期或天数信息");
          break;
        case "必填字段: 景点":
          suggestions.push("请包含具体的景点推荐");
          break;
        case "天数连续性":
          suggestions.push("请确保天数编号连续，不要跳跃");
          break;
        case "城市匹配":
          suggestions.push("请确保行程覆盖用户请求的目标城市");
          break;
      }
    }
  }

  return [...new Set(suggestions)];
}
