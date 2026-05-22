/**
 * AI 导游模块 — 基于位置的景点讲解
 *
 * 功能：
 * - 检测用户位置，接近景点时自动触发讲解
 * - 手动请求景点讲解
 * - 调用 TTS 播放讲解文本
 */

import { speak, stop as stopTTS, isTTSSupported } from './tts.js?v=10';

// ─── 常量 ──────────────────────────────────────────────

/** 触发讲解的距离阈值（米） */
const TRIGGER_DISTANCE_M = 200;

/** 位置更新间隔（毫秒） */
const LOCATION_UPDATE_INTERVAL = 30000;

// ─── 状态 ──────────────────────────────────────────────

let watchId = null;
let isWatching = false;
let currentTripPlan = null;
let lastTriggeredAttraction = null;
let onGuideCallback = null;

// ─── 距离计算 ──────────────────────────────────────────

/**
 * 计算两点之间的距离（Haversine 公式）
 * @returns {number} 距离（米）
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // 地球半径（米）
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ─── 位置检测 ──────────────────────────────────────────

/**
 * 检查是否接近某个景点
 * @param {number} lat - 用户纬度
 * @param {number} lng - 用户经度
 * @returns {object|null} 匹配的景点信息或 null
 */
function findNearbyAttraction(lat, lng) {
  if (!currentTripPlan?.days) return null;

  for (const day of currentTripPlan.days) {
    for (const attr of (day.attractions || [])) {
      if (!attr.location?.latitude || !attr.location?.longitude) continue;

      const distance = calculateDistance(
        lat, lng,
        attr.location.latitude, attr.location.longitude
      );

      if (distance <= TRIGGER_DISTANCE_M) {
        return {
          ...attr,
          distance: Math.round(distance),
          dayDate: day.date,
          dayIndex: day.dayIndex,
        };
      }
    }
  }

  return null;
}

/**
 * 位置更新处理
 */
function handlePositionUpdate(position) {
  const { latitude, longitude } = position.coords;

  const nearby = findNearbyAttraction(latitude, longitude);

  if (nearby && nearby.nameZh !== lastTriggeredAttraction) {
    lastTriggeredAttraction = nearby.nameZh;

    // 触发讲解回调
    if (onGuideCallback) {
      onGuideCallback(nearby);
    }
  }
}

/**
 * 位置错误处理
 */
function handlePositionError(error) {
  console.warn('[Guide] Location error:', error.message);
  // 不停止监听，可能是临时信号问题
}

// ─── 公开 API ─────────────────────────────────────────

/**
 * 检查是否支持位置服务
 */
export function isGeolocationSupported() {
  return 'geolocation' in navigator;
}

/**
 * 设置行程数据（用于位置匹配）
 */
export function setTripPlanForGuide(tripPlan) {
  currentTripPlan = tripPlan;
  lastTriggeredAttraction = null;
}

/**
 * 设置讲解触发回调
 * @param {function} callback - (attraction) => void
 */
export function onGuideTrigger(callback) {
  onGuideCallback = callback;
}

/**
 * 开始位置监听
 */
export function startLocationWatch() {
  if (!isGeolocationSupported()) {
    console.warn('[Guide] Geolocation not supported');
    return false;
  }

  if (isWatching) return true;

  watchId = navigator.geolocation.watchPosition(
    handlePositionUpdate,
    handlePositionError,
    {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 30000,
    }
  );

  isWatching = true;
  return true;
}

/**
 * 停止位置监听
 */
export function stopLocationWatch() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  isWatching = false;
  lastTriggeredAttraction = null;
}

/**
 * 获取监听状态
 */
export function getGuideState() {
  return {
    isWatching,
    isSupported: isGeolocationSupported(),
    lastTriggered: lastTriggeredAttraction,
  };
}

/**
 * 手动触发景点讲解（不依赖位置）
 * @param {object} attraction - 景点信息
 * @param {string} style - 讲解风格
 */
export async function requestGuide(attraction, style = 'standard') {
  if (!isTTSSupported()) {
    console.warn('[Guide] TTS not supported');
    return null;
  }

  // 生成讲解文本（简化版，完整版由后端 tool 生成）
  const name = attraction.nameZh || attraction.name;
  const city = attraction.city || '';
  const desc = attraction.description || '';

  let text = '';
  switch (style) {
    case 'brief':
      text = `欢迎来到${name}！${desc}`;
      break;
    case 'detailed':
      text = `各位游客，欢迎来到${name}！${name}位于${city}，${desc}建议您慢慢欣赏，感受这里的独特魅力。温馨提示：请保管好随身物品，注意安全。`;
      break;
    default: // standard
      text = `各位游客，欢迎来到${name}！${name}位于${city}，${desc}建议游览时间约${attraction.visitDuration || 30}分钟。`;
  }

  // 播放讲解
  speak(text, {
    rate: 0.9, // 导游语速稍慢
    onStart: () => updateGuideUI(true, name),
    onEnd: () => updateGuideUI(false, null),
  });

  return { text, attraction: name };
}

/**
 * 停止当前讲解
 */
export function stopGuide() {
  stopTTS();
  updateGuideUI(false, null);
}

// ─── UI 更新 ─────────────────────────────────────────

function updateGuideUI(isPlaying, attractionName) {
  const btn = document.getElementById('btn-guide');
  if (!btn) return;

  if (isPlaying) {
    btn.classList.add('playing');
    btn.setAttribute('title', `正在讲解: ${attractionName}`);
  } else {
    btn.classList.remove('playing');
    btn.setAttribute('title', 'AI 导游');
  }
}

// ─── 全局暴露 ─────────────────────────────────────────

window._guide = {
  isGeolocationSupported,
  setTripPlanForGuide,
  onGuideTrigger,
  startLocationWatch,
  stopLocationWatch,
  getGuideState,
  requestGuide,
  stopGuide,
};
