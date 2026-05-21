/**
 * Prompt Builder — 从 TripRequest 构建用户 prompt
 *
 * 从 TravelAgent 中提取的子模块，负责：
 *   - 格式化城市/日期/偏好信息
 *   - 人群画像文本生成
 *   - 偏好挖掘判断
 *   - 语言指令注入
 */

import type { TripRequest } from "../types/trip.js";
import { getLanguageInstruction } from "./prompts.js";

/**
 * 从旅行请求构建用户 prompt
 */
export function buildUserPrompt(request: TripRequest): string {
  // 发现模式：构建推荐请求 prompt
  if (request.mode === "discover") {
    return buildDiscoverPrompt(request);
  }

  // 行程规划模式：构建行程规划 prompt
  const cities =
    request.cities.length > 0
      ? request.cities.map((c) => `${c.city}(${c.days}天)`).join(" → ")
      : `${request.city}(${request.travelDays}天)`;

  const travelersText = formatTravelers(request.travelers);
  const needPreferenceDig = shouldDigPreferences(request);

  return [
    "请为我规划一次旅行：",
    "",
    `**目的地**: ${cities}`,
    `**日期**: ${request.startDate} 至 ${request.endDate}`,
    `**天数**: ${request.travelDays}天`,
    `**交通方式**: ${request.transportation}`,
    `**住宿偏好**: ${request.accommodation}`,
    `**兴趣偏好**: ${request.preferences.join("、") || "无特殊偏好"}`,
    request.freeTextInput ? `\n**额外要求**: ${request.freeTextInput}` : "",
    travelersText ? `\n${travelersText}` : "",
    "",
    needPreferenceDig
      ? "⚠️ 注意：用户没有提供具体的偏好信息和人群构成。请先通过追问了解：1）旅行风格 2）预算范围 3）是否有老人/儿童/孕妇/行动不便者，2-3轮后自动开始规划。"
      : "",
    getLanguageInstruction(request.language),
  ].join("\n");
}

/**
 * 构建发现模式 prompt
 */
function buildDiscoverPrompt(request: TripRequest): string {
  const lines: string[] = ["请根据我的需求推荐旅行目的地：", ""];

  // 位置信息
  const loc = request.currentLocation;
  if (loc) {
    if (loc.city) {
      lines.push(`**我的位置**: ${loc.city}`);
    } else {
      lines.push(`**我的位置**: 坐标 ${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`);
    }
  }

  // 约束条件
  const c = request.discoverConstraints;
  if (c) {
    if (c.maxTravelHours) {
      lines.push(`**最大交通时间**: ${c.maxTravelHours}小时以内`);
    }
    if (c.maxBudget) {
      lines.push(`**预算上限**: ${c.maxBudget}元/人`);
    }
    if (c.duration) {
      const durationMap: Record<string, string> = {
        "day-trip": "一日游",
        weekend: "周末2天",
        "3-5days": "3-5天小长假",
        flexible: "时间灵活",
      };
      lines.push(`**行程时长**: ${durationMap[c.duration] ?? c.duration}`);
    }
    if (c.themes && c.themes.length > 0) {
      lines.push(`**主题偏好**: ${c.themes.join("、")}`);
    }
    if (c.activities && c.activities.length > 0) {
      lines.push(`**活动类型**: ${c.activities.join("、")}`);
    }
  }

  // 出行人群
  const travelersText = formatTravelers(request.travelers);
  if (travelersText) {
    lines.push("", travelersText);
  }

  // 额外要求
  if (request.freeTextInput) {
    lines.push("", `**额外要求**: ${request.freeTextInput}`);
  }

  lines.push("", getLanguageInstruction(request.language));

  return lines.join("\n");
}

/**
 * 格式化人群画像为可读文本
 */
export function formatTravelers(travelers?: import("../types/trip.js").TravelerProfile): string {
  if (!travelers) return "";

  return [
    `**出行人群**: ${travelers.adults}成人${travelers.seniors > 0 ? ` · ${travelers.seniors}老人` : ""}${travelers.children > 0 ? ` · ${travelers.children}儿童` : ""}${travelers.infants > 0 ? ` · ${travelers.infants}婴幼儿` : ""}${travelers.pregnant ? " · 有孕妇" : ""}${travelers.mobilityImpaired ? " · 有行动不便者" : ""}`,
    "",
    "⚠️ 重要：系统已根据人群画像自动过滤了不适合的路线（如高风险登山路线对老人/孕妇已隐藏）。请在剩余可选路线中编排。",
  ].join("\n");
}

/**
 * 判断是否需要偏好挖掘
 */
export function shouldDigPreferences(request: TripRequest): boolean {
  return request.preferences.length === 0 && !request.freeTextInput && !request.travelers;
}
