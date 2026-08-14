/**
 * 行程统计条模块
 *
 * 行程加载后，在聊天区顶部展示关键数据徽章：
 * 天数 / 景点数 / 城市数 / 总预算 / 天气
 * 数据来源为 TripPlan（与地图渲染、导出共用同一份数据）。
 */

import { currentLang } from '../infra/context.js';
import { I18N } from '../i18n.js';

const STATS_BAR_ID = 'trip-stats-bar';

function dictionary() {
  return I18N[currentLang] || I18N.zh;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * 从 TripPlan 提取统计摘要（纯函数，便于单测）
 * @param {object} tripPlan - 已验证的 TripPlan
 * @returns {{days: number, attractions: number, cities: number, budgetTotal: number|null, weather: string|null}|null}
 */
export function computeTripStats(tripPlan) {
  if (!tripPlan || !Array.isArray(tripPlan.days)) return null;

  const days = tripPlan.days.length;
  const attractions = tripPlan.days.reduce(
    (sum, day) => sum + (day.attractions?.length || 0),
    0,
  );

  const citySet = new Set();
  for (const day of tripPlan.days) {
    if (typeof day.city === 'string' && day.city) citySet.add(day.city);
  }
  for (const item of tripPlan.cities || []) {
    const name = typeof item === 'string' ? item : item?.city;
    if (name) citySet.add(name);
  }
  if (tripPlan.city) citySet.add(tripPlan.city);

  const budgetTotal = tripPlan.budget?.total ?? null;

  let weather = null;
  for (const w of tripPlan.weatherInfo || []) {
    if (w?.dayWeather) {
      weather = w.dayTemp ? `${w.dayWeather} ${w.dayTemp}°` : w.dayWeather;
      break;
    }
  }

  return { days, attractions, cities: citySet.size, budgetTotal, weather };
}

/**
 * 渲染行程统计条（幂等：重复调用会刷新内容并重新显示）
 * @param {object} tripPlan
 */
export function renderTripStats(tripPlan) {
  const bar = document.getElementById(STATS_BAR_ID);
  if (!bar) return;

  const stats = computeTripStats(tripPlan);
  if (!stats) return;

  const d = dictionary();
  const chips = [];
  if (stats.days > 0) chips.push(`🗓 <b>${stats.days}</b> ${escapeHtml(d.statsDays)}`);
  if (stats.attractions > 0) chips.push(`📍 <b>${stats.attractions}</b> ${escapeHtml(d.statsAttractions)}`);
  if (stats.cities > 0) chips.push(`🏙 <b>${stats.cities}</b> ${escapeHtml(d.statsCities)}`);
  if (stats.budgetTotal != null && stats.budgetTotal > 0) {
    chips.push(`💰 <b>¥${stats.budgetTotal.toLocaleString('zh-CN')}</b> ${escapeHtml(d.statsBudget)}`);
  }
  if (stats.weather) chips.push(`🌤 ${escapeHtml(stats.weather)}`);

  if (chips.length === 0) return;

  bar.innerHTML = chips.map(c => `<span class="trip-stats-chip">${c}</span>`).join('')
    + `<button type="button" class="trip-stats-close" title="${escapeHtml(d.statsClose)}" aria-label="${escapeHtml(d.statsClose)}">✕</button>`;
  bar.hidden = false;

  const closeBtn = bar.querySelector('.trip-stats-close');
  closeBtn?.addEventListener('click', () => {
    bar.hidden = true;
  });
}

/** 隐藏统计条 */
export function clearTripStats() {
  const bar = document.getElementById(STATS_BAR_ID);
  if (bar) bar.hidden = true;
}
