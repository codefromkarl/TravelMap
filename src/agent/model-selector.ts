/**
 * Model Selector — 根据请求复杂度选择模型层级
 *
 * 从 TravelAgent 中提取的子模块，负责：
 *   - 评估 TripRequest 复杂度
 *   - 返回合适的模型层级（L1 便宜 / L2 强推理）
 */

import type { TripRequest } from "../types/trip.js";

export type ModelTier = "L1" | "L2";

/**
 * 根据请求复杂度选择模型层级
 *
 * L1: 轻量模型 — 单城市、≤3天、简单偏好
 * L2: 强模型 — 多城市、>3天、复杂偏好
 */
export function selectModelTier(request: TripRequest): ModelTier {
  if (request.cities.length > 1) return "L2";
  if (request.travelDays > 3) return "L2";
  if (request.preferences.length > 2) return "L2";
  if (request.freeTextInput && request.freeTextInput.length > 20) return "L2";
  return "L1";
}
