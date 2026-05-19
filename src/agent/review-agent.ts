/**
 * ReviewAgent — 行程质量审查 Agent
 *
 * 在 TravelAgent 编排完行程后，自动审查行程质量：
 *   - 确定性检查（不花 LLM token）：日期连续性、天数匹配、必填字段
 *   - 语义检查（需 LLM）：地理连续性、时间合理性、人群适配
 *
 * 审查结果用于：
 *   1. 快速拦截明显错误（确定性检查不过直接返回）
 *   2. 为 TravelAgent 提供自动修复建议
 *   3. 向用户展示行程质量评分
 *
 * 设计原则：
 *   - 确定性检查免费（0 token），语义检查用便宜模型
 *   - 审查失败时生成可操作的修复指令，不生成新行程
 *   - 最多自动修复 1 轮，避免死循环
 */

import type { AgentEvent } from "@earendil-works/pi-agent-core";
import { Agent } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai";
import { getLogger } from "../services/logger.js";
import {
  type TripPlanConsistency,
  validateTripPlanConsistency,
} from "../services/post-processor.js";
import type { TravelerProfile, TripPlan } from "../types/trip.js";
// ─── 审查结果类型 ──────────────────────────────────────────

export interface ReviewIssue {
  /** 问题所在天数（0 表示全局问题） */
  day: number;
  /** 问题分类 */
  type:
    | "consistency" // 结构不一致（日期跳跃、天数不匹配）
    | "geography" // 地理不连续（折返、跳跃）
    | "time" // 时间不合理（超 12h、景点太少）
    | "crowd" // 人群适配（老人安排登山等）
    | "meal" // 餐饮缺失
    | "transfer"; // 城际衔接问题
  /** 问题描述 */
  description: string;
  /** 修复建议（用于 steer） */
  fix: string;
  /** 严重程度 */
  severity: "error" | "warning";
}

export interface ReviewResult {
  /** 是否通过审查 */
  passed: boolean;
  /** 质量评分 1-10 */
  score: number;
  /** 发现的问题列表 */
  issues: ReviewIssue[];
  /** 确定性检查结果 */
  consistency: TripPlanConsistency;
}

// ─── 审查 Prompt ────────────────────────────────────────────

const REVIEW_SYSTEM_PROMPT = `你是行程质量审查员。分析旅行计划 JSON，输出严格 JSON 格式的审查结果。

检查维度：
1. **地理连续性**：同一天的景点路线是否顺畅，有无明显的来回折返
2. **时间合理性**：每天总游览时间是否在 3-12 小时内
3. **人群适配**：如果提供了出行人群，是否照顾了老人/儿童/孕妇/行动不便者
4. **餐饮完整性**：每天是否包含早中晚三餐
5. **城际衔接**：多城市行程的移动日是否标注了交通方案

输出格式（严格 JSON，不要输出其他内容）：
{
  "passed": true/false,
  "score": 1-10,
  "issues": [
    {
      "day": 1,
      "type": "geography",
      "description": "第1天景点从城东跳到城西再回城东，路线折返",
      "fix": "调整第1天景点顺序为：天坛→前门→故宫",
      "severity": "warning"
    }
  ]
}

规则：
- severity 只能是 "error"（必须修复）或 "warning"（建议修复）
- type 只能是 geography/time/crowd/meal/transfer 之一
- day 为 0 表示全局问题
- passed=true 表示无 error 级别问题
- score 评分标准：无问题 9-10，仅有 warning 6-8，有 error 1-5
- 只输出 JSON，不要输出解释文字`;

// ─── 确定性检查（免费，不花 token）─────────────────────────

/**
 * 确定性审查 — 纯代码检查，不调用 LLM
 *
 * 覆盖：
 *   - 日期连续性、天数匹配
 *   - 每天至少有 1 个景点
 *   - 餐饮完整性（每天有 3 餐）
 *   - 多城市有移动日
 *   - 每天总游览时间合理性
 */
function deterministicReview(
  tripPlan: TripPlan,
  travelers?: TravelerProfile,
): { issues: ReviewIssue[]; consistency: TripPlanConsistency } {
  const issues: ReviewIssue[] = [];

  // 1. 结构一致性
  const consistency = validateTripPlanConsistency(tripPlan);
  for (const err of consistency.errors) {
    issues.push({
      day: 0,
      type: "consistency",
      description: err,
      fix: "修复行程数据结构",
      severity: "error",
    });
  }
  for (const warn of consistency.warnings) {
    issues.push({ day: 0, type: "consistency", description: warn, fix: "", severity: "warning" });
  }

  // 2. 餐饮完整性
  for (const day of tripPlan.days) {
    if (day.isTransferDay) continue;
    const mealTypes = new Set(day.meals?.map((m) => m.type) ?? []);
    const missing: string[] = [];
    if (!mealTypes.has("breakfast")) missing.push("早餐");
    if (!mealTypes.has("lunch")) missing.push("午餐");
    if (!mealTypes.has("dinner")) missing.push("晚餐");
    if (missing.length > 0) {
      issues.push({
        day: day.dayIndex,
        type: "meal",
        description: `第${day.dayIndex}天缺少${missing.join("、")}`,
        fix: `为第${day.dayIndex}天补充${missing.join("、")}推荐`,
        severity: "warning",
      });
    }
  }

  // 3. 时间合理性
  for (const day of tripPlan.days) {
    if (day.isTransferDay) continue;
    const totalMinutes = day.attractions.reduce((sum, a) => sum + a.visitDuration, 0);
    if (totalMinutes > 720) {
      issues.push({
        day: day.dayIndex,
        type: "time",
        description: `第${day.dayIndex}天总游览时间${Math.round(totalMinutes / 60)}小时，超过12小时`,
        fix: `减少第${day.dayIndex}天的景点数量或缩短游览时间`,
        severity: "error",
      });
    }
    if (totalMinutes === 0 && day.attractions.length === 0 && !day.isTransferDay) {
      issues.push({
        day: day.dayIndex,
        type: "time",
        description: `第${day.dayIndex}天没有安排景点`,
        fix: `为第${day.dayIndex}天添加景点安排`,
        severity: "warning",
      });
    }
  }

  // 4. 人群适配（确定性部分：高海拔 + 行动不便者）
  if (travelers) {
    const hasSpecialNeeds =
      travelers.seniors > 0 || travelers.mobilityImpaired || travelers.pregnant;
    if (hasSpecialNeeds) {
      for (const day of tripPlan.days) {
        for (const attraction of day.attractions) {
          if (attraction.routes) {
            for (const route of attraction.routes) {
              const maxElev = route.riskAssessment?.maxElevation ?? 0;
              if (maxElev > 2500) {
                issues.push({
                  day: day.dayIndex,
                  type: "crowd",
                  description: `${attraction.nameZh}的${route.name}路线海拔${maxElev}m，不适合${travelers.pregnant ? "孕妇" : travelers.mobilityImpaired ? "行动不便者" : "老人"}`,
                  fix: `为${attraction.nameZh}选择低海拔路线或替换景点`,
                  severity: "error",
                });
              }
            }
          }
        }
      }
    }
  }

  return { issues, consistency };
}

// ─── 语义检查（需要 LLM）──────────────────────────────────

interface LLMReviewOutput {
  passed: boolean;
  score: number;
  issues: Array<{
    day: number;
    type: string;
    description: string;
    fix: string;
    severity: string;
  }>;
}

/**
 * 从 LLM 消息中解析审查结果
 */
function parseReviewFromMessages(
  messages: Array<{ role: string; content: unknown }>,
): LLMReviewOutput | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    if (msg.role !== "assistant") continue;

    const text = extractText(msg);
    if (!text) continue;

    // 尝试提取 JSON
    try {
      const jsonMatch =
        text.match(/```(?:json)?\s*\n?([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]!);
        if (typeof parsed.passed === "boolean" && Array.isArray(parsed.issues)) {
          return parsed as LLMReviewOutput;
        }
      }
    } catch {
      // 继续尝试
    }
  }
  return null;
}

// ─── ReviewAgent 类 ─────────────────────────────────────────

export class ReviewAgent {
  private agent: Agent;
  private enabled: boolean;

  constructor(options?: { enabled?: boolean }) {
    this.enabled = options?.enabled ?? true;

    // 审查使用便宜模型
    const cheapModel = getModel("openai", "gpt-4o-mini");
    this.agent = new Agent({
      initialState: {
        systemPrompt: REVIEW_SYSTEM_PROMPT,
        model: cheapModel,
        thinkingLevel: "off", // 审查不需要思考，节省 token
        tools: [],
        messages: [],
      },
    });
  }

  /**
   * 审查行程计划
   *
   * 两阶段：
   *   1. 确定性检查（免费，不花 token）
   *   2. 语义检查（需 LLM，使用便宜模型）
   *
   * 如果确定性检查发现 error 级别问题，跳过语义检查直接返回。
   */
  async review(tripPlan: TripPlan, travelers?: TravelerProfile): Promise<ReviewResult> {
    if (!this.enabled) {
      return {
        passed: true,
        score: 10,
        issues: [],
        consistency: { valid: true, warnings: [], errors: [] },
      };
    }

    const logger = getLogger();

    // ── 阶段 1: 确定性检查 ──
    const { issues: detIssues, consistency } = deterministicReview(tripPlan, travelers);
    const hasErrors = detIssues.some((i) => i.severity === "error");

    if (hasErrors) {
      logger.info("[ReviewAgent] 确定性检查发现严重问题，跳过语义检查", {
        issueCount: detIssues.length,
        errorCount: detIssues.filter((i) => i.severity === "error").length,
      });
      return {
        passed: false,
        score: calcScore(detIssues),
        issues: detIssues,
        consistency,
      };
    }

    // ── 阶段 2: 语义检查（LLM）──
    try {
      const planJson = JSON.stringify(tripPlan, null, 2);
      const travelerContext = travelers ? `\n\n出行人群: ${JSON.stringify(travelers)}` : "";

      // 截断过长 JSON，避免 token 浪费
      const truncatedJson =
        planJson.length > 8000
          ? `${planJson.slice(0, 8000)}\n... (已截断，共${planJson.length}字符)`
          : planJson;

      await this.agent.prompt(
        `请审查以下行程计划：\n\`\`\`json\n${truncatedJson}\n\`\`\`${travelerContext}`,
      );
      await this.agent.waitForIdle();

      const messages = this.agent.state.messages as Array<{ role: string; content: unknown }>;
      const llmResult = parseReviewFromMessages(messages);

      if (llmResult) {
        // 合并确定性 + 语义检查结果
        const semanticIssues: ReviewIssue[] = llmResult.issues
          .filter(
            (i) =>
              ["geography", "time", "crowd", "meal", "transfer"].includes(i.type) &&
              ["error", "warning"].includes(i.severity),
          )
          .map((i) => ({
            day: i.day,
            type: i.type as ReviewIssue["type"],
            description: i.description,
            fix: i.fix,
            severity: i.severity as ReviewIssue["severity"],
          }));

        const allIssues = [...detIssues, ...semanticIssues];
        const hasSemanticErrors = semanticIssues.some((i) => i.severity === "error");

        logger.info("[ReviewAgent] 审查完成", {
          totalIssues: allIssues.length,
          passed: !hasSemanticErrors && !hasErrors,
          score: llmResult.score,
        });

        return {
          passed: !hasSemanticErrors && !hasErrors,
          score: Math.min(llmResult.score, calcScore(allIssues)),
          issues: allIssues,
          consistency,
        };
      }
    } catch (err) {
      logger.warn("[ReviewAgent] 语义检查失败，仅使用确定性检查结果", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // 语义检查失败时，仅返回确定性检查结果
    return {
      passed: !hasErrors,
      score: calcScore(detIssues),
      issues: detIssues,
      consistency,
    };
  }

  /**
   * 生成自动修复的 steer 指令
   *
   * 将 error 级别的问题翻译成 steer() 消息
   */
  generateFixMessage(issues: ReviewIssue[]): string {
    const errors = issues.filter((i) => i.severity === "error" && i.fix);
    if (errors.length === 0) return "";

    const lines = ["请修复以下行程问题："];
    for (const issue of errors) {
      const dayLabel = issue.day > 0 ? `第${issue.day}天` : "全局";
      lines.push(`- ${dayLabel}: ${issue.description}（建议: ${issue.fix}）`);
    }
    lines.push("", "请只修改有问题的天数，其他天数保持不变。");

    return lines.join("\n");
  }

  /** 重置 agent 状态 */
  reset(): void {
    this.agent.reset();
  }

  /** 订阅事件 */
  onEvent(listener: (event: AgentEvent) => void): () => void {
    return this.agent.subscribe(listener);
  }
}

// ─── 辅助函数 ──────────────────────────────────────────────

/** 根据问题计算评分 */
function calcScore(issues: ReviewIssue[]): number {
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  return Math.max(1, 10 - errorCount * 3 - warningCount);
}

/** 从 pi-agent 消息中提取文本 */
function extractText(msg: { role: string; content: unknown }): string | null {
  if (!msg.content) return null;
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((c: unknown) => (c as Record<string, unknown>).type === "text")
      .map((c: unknown) => (c as Record<string, unknown>).text as string)
      .join("\n");
  }
  if (typeof msg.content === "string") return msg.content;
  return null;
}

// ─── 便捷函数 ──────────────────────────────────────────────

/**
 * 快速审查 — 只做确定性检查，不调用 LLM
 *
 * 适用于需要低成本快速检查的场景（如 preSearch 后的即时反馈）
 */
export function quickReview(
  tripPlan: TripPlan,
  travelers?: TravelerProfile,
): Omit<ReviewResult, "consistency"> & { consistency: TripPlanConsistency } {
  const { issues, consistency } = deterministicReview(tripPlan, travelers);
  const hasErrors = issues.some((i) => i.severity === "error");
  return {
    passed: !hasErrors,
    score: calcScore(issues),
    issues,
    consistency,
  };
}
