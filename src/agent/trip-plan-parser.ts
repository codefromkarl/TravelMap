/**
 * TripPlan 解析器 — 从 LLM 输出文本中提取结构化行程
 *
 * 从 TravelAgent 中解耦的纯函数模块，职责：
 *   1. 从消息对象中提取纯文本
 *   2. 从文本中解析 TripPlan JSON（三重 fallback 策略）
 *   3. 从文本中解析 TripPlan Diff（steerDiff 模式）
 *   4. 将 Diff 合并到已有 TripPlan
 */

import type { TripPlan } from "../types/trip.js";

// ─── 消息文本提取 ──────────────────────────────────────────

/** 从 pi-agent-core 消息对象中提取纯文本内容 */
export function extractTextFromMessage(msg: { role: string; content: unknown }): string | null {
  if (!msg.content) return null;

  // pi-agent-core 的消息格式: content 是数组 [{type, text}]
  if (Array.isArray(msg.content)) {
    const textParts = msg.content
      .filter((c: unknown) => (c as Record<string, unknown>).type === "text")
      .map((c: unknown) => (c as Record<string, unknown>).text as string);
    return textParts.join("\n");
  }

  // 也可能是字符串
  if (typeof msg.content === "string") {
    return msg.content;
  }

  return null;
}

// ─── TripPlan Diff 类型 ────────────────────────────────────

export interface TripPlanDiff {
  changedDays: number[];
  days: Record<string, unknown>;
}

// ─── JSON 提取辅助 ─────────────────────────────────────────

/**
 * 从文本中提取 JSON 字符串（支持 ```json 代码块和纯 JSON）
 * 返回 null 表示未找到可解析的 JSON
 */
function extractJsonText(text: string): string | null {
  // 策略 1: 从 ```json 代码块中提取
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1]!.trim();
  }

  // 策略 2: 尝试解析整个文本为 JSON
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    return trimmed;
  }

  // 策略 3: 从文本中提取最大可能 JSON 对象（从第一个 { 到最后一个 }）
  const jsonMatch = text.match(/(\{[\s\S]*\})/);
  if (jsonMatch) {
    return jsonMatch[1]!;
  }

  return null;
}

// ─── TripPlan Diff 解析 ────────────────────────────────────

/** 从文本中提取 TripPlan Diff（steerDiff 模式输出） */
export function parseTripPlanDiff(text: string): TripPlanDiff | null {
  try {
    const jsonText = extractJsonText(text);
    if (!jsonText) return null;

    const parsed = JSON.parse(jsonText);
    // Diff 格式特征：有 changedDays 和 days 字段，但没有 city
    if (parsed.changedDays && Array.isArray(parsed.changedDays) && parsed.days && !parsed.city) {
      return parsed as TripPlanDiff;
    }
  } catch {
    // 不是有效的 diff
  }
  return null;
}

// ─── Diff 合并 ─────────────────────────────────────────────

/** 将 Diff 合并到现有 TripPlan（仅替换 changedDays 指定的天数） */
export function mergeTripPlanDiff(base: TripPlan, diff: TripPlanDiff): TripPlan {
  const merged = { ...base, days: [...base.days] };
  for (const dayIndex of diff.changedDays) {
    const dayKey = String(dayIndex);
    const newDay = diff.days[dayKey];
    if (newDay && dayIndex >= 1 && dayIndex <= merged.days.length) {
      merged.days[dayIndex - 1] = newDay as (typeof merged.days)[0];
    }
  }
  return merged;
}

// ─── TripPlan 解析 ─────────────────────────────────────────

/** 从文本中提取 TripPlan JSON（三重 fallback 策略） */
export function parseTripPlanFromText(text: string): TripPlan | null {
  // 策略 1: 从 ```json 代码块中提取
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1]!.trim());
      if (parsed.city && Array.isArray(parsed.days)) {
        return parsed as TripPlan;
      }
    } catch {
      // 不是有效的 JSON，继续尝试
    }
  }

  // 策略 2: 尝试解析整个文本为 JSON
  try {
    const parsed = JSON.parse(text.trim());
    if (parsed.city && Array.isArray(parsed.days)) {
      return parsed as TripPlan;
    }
  } catch {
    // 不是有效的 JSON
  }

  // 策略 3: 从文本中提取最大可能 JSON 对象（从第一个 { 到最后一个 }）
  const jsonMatch = text.match(/(\{[\s\S]*\})/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]!);
      // 验证是否是 TripPlan（有 city 和 days 关键字段）
      if (parsed.city && Array.isArray(parsed.days)) {
        return parsed as TripPlan;
      }
    } catch {
      // 解析失败
    }
  }

  return null;
}

// ─── 从消息列表中查找最新 TripPlan ─────────────────────────

/**
 * 从 agent 消息历史中查找最新的 TripPlan（或 Diff）
 *
 * @returns 解析结果：完整 TripPlan、Diff（需合并）、或 null
 */
export function findLatestPlanInMessages(messages: Array<{ role: string; content: unknown }>):
  | {
      type: "plan";
      plan: TripPlan;
    }
  | {
      type: "diff";
      diff: TripPlanDiff;
    }
  | null {
  // 从后往前找第一个 assistant message
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    if (msg.role !== "assistant") continue;

    const text = extractTextFromMessage(msg);
    if (!text) continue;

    // 尝试解析为 Diff（steerDiff 模式）
    const diff = parseTripPlanDiff(text);
    if (diff) {
      return { type: "diff", diff };
    }

    // 尝试解析为完整 TripPlan
    const tripPlan = parseTripPlanFromText(text);
    if (tripPlan) {
      return { type: "plan", plan: tripPlan };
    }
  }

  return null;
}
