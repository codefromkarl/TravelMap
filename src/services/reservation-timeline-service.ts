/**
 * 预约时间轴服务 — 计算景点预约开放日和紧急度
 *
 * 核心逻辑：
 *   1. 从预约知识库查询景点的提前天数和放票时间
 *   2. 根据游玩日期计算预约开放日
 *   3. 对比今天判断紧急度
 *   4. 将结果写入 Attraction.reservationTimeline
 */

import { fuzzyLookupReservation, lookupReservation } from "../data/reservation-db.js";
import type { Attraction, DayPlan, ReservationTimeline } from "../types/trip.js";

/**
 * 为行程中的需预约景点计算预约时间轴
 *
 * @param days 行程天数列表
 * @param today 今日日期（YYYY-MM-DD），不传则使用当前日期
 * @returns 带预约时间轴的行程天数列表
 */
export function enrichReservationTimeline(days: DayPlan[], today?: string): DayPlan[] {
  const todayDate = today ? new Date(today) : new Date();

  return days.map((day) => ({
    ...day,
    attractions: day.attractions.map((a) => {
      if (!a.reservationRequired) return a;

      // 查询知识库
      const entry = lookupReservation(a.nameZh) ?? fuzzyLookupReservation(a.nameZh);
      if (!entry) return a;

      const visitDate = new Date(day.date);
      const visitMonth = visitDate.getMonth() + 1;

      // 旺季/淡季区别
      const isPeak = entry.peakSeasonMonths?.includes(visitMonth) ?? false;
      const advanceDays = isPeak
        ? (entry.peakAdvanceDays ?? entry.advanceDays)
        : entry.advanceDays;

      // 计算预约开放日
      const openDate = new Date(visitDate);
      openDate.setDate(openDate.getDate() - advanceDays);
      const bookingOpenDate = formatDate(openDate);

      // 计算紧急度
      const urgency = calcUrgency(todayDate, openDate);

      return {
        ...a,
        bookingUrl: a.bookingUrl ?? entry.officialUrl,
        reservationTimeline: {
          advanceDays,
          releaseTime: entry.releaseTime,
          bookingOpenDate,
          urgency,
          officialUrl: entry.officialUrl,
          altChannels: entry.altChannels,
        },
      };
    }),
  }));
}

/**
 * 为单个景点计算预约时间轴（供伴游问答使用）
 */
export function calcReservationTimeline(
  attraction: Attraction,
  visitDate: string,
  today?: string,
): ReservationTimeline | undefined {
  if (!attraction.reservationRequired) return undefined;

  const entry = lookupReservation(attraction.nameZh) ?? fuzzyLookupReservation(attraction.nameZh);
  if (!entry) return undefined;

  const todayDate = today ? new Date(today) : new Date();
  const visit = new Date(visitDate);
  const visitMonth = visit.getMonth() + 1;
  const isPeak = entry.peakSeasonMonths?.includes(visitMonth) ?? false;
  const advanceDays = isPeak ? (entry.peakAdvanceDays ?? entry.advanceDays) : entry.advanceDays;

  const openDate = new Date(visit);
  openDate.setDate(openDate.getDate() - advanceDays);

  return {
    advanceDays,
    releaseTime: entry.releaseTime,
    bookingOpenDate: formatDate(openDate),
    urgency: calcUrgency(todayDate, openDate),
    officialUrl: entry.officialUrl,
    altChannels: entry.altChannels,
  };
}

// ─── 内部工具 ─────────────────────────────────────────────

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function calcUrgency(
  today: Date,
  openDate: Date,
): ReservationTimeline["urgency"] {
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const openStart = new Date(openDate.getFullYear(), openDate.getMonth(), openDate.getDate());
  const diffMs = openStart.getTime() - todayStart.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "expired"; // 已过预约窗口
  if (diffDays <= 2) return "urgent"; // 1-2 天内开启
  return "normal";
}
