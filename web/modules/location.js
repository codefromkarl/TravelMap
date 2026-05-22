/**
 * 位置服务模块 — 获取用户位置并支持目的地推荐
 *
 * 功能：
 *   - 浏览器 Geolocation API 获取坐标
 *   - 高德 Geocoding API 反向解析城市名
 *   - 位置缓存（避免重复请求）
 */

import { getAmapGeoKey } from './context.js?v=5';

// ─── 位置缓存 ──────────────────────────────────────────────

let cachedLocation = null;
const CACHE_KEY = 'travel-agent-location';
const CACHE_TTL = 30 * 60 * 1000; // 30 分钟

/**
 * 获取缓存的位置
 */
function getCachedLocation() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Date.now() - data.timestamp > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/**
 * 缓存位置
 */
function setCachedLocation(location) {
  const data = { ...location, timestamp: Date.now() };
  localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  cachedLocation = data;
}

// ─── 位置获取 ──────────────────────────────────────────────

/**
 * 获取用户当前位置（带缓存）
 *
 * @returns {Promise<{latitude: number, longitude: number, city?: string}>}
 */
export async function getUserLocation() {
  // 1. 检查内存缓存
  if (cachedLocation && Date.now() - cachedLocation.timestamp < CACHE_TTL) {
    return cachedLocation;
  }

  // 2. 检查 localStorage 缓存
  const stored = getCachedLocation();
  if (stored) {
    cachedLocation = stored;
    return stored;
  }

  // 3. 调用浏览器 Geolocation API
  const coords = await getBrowserLocation();

  // 4. 反向解析城市名
  let city = null;
  try {
    city = await reverseGeocode(coords.latitude, coords.longitude);
  } catch (err) {
    console.warn('[Location] 反向解析失败:', err);
  }

  const location = {
    latitude: coords.latitude,
    longitude: coords.longitude,
    city,
  };

  // 5. 缓存结果
  setCachedLocation(location);

  return location;
}

/**
 * 调用浏览器 Geolocation API
 */
function getBrowserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('浏览器不支持定位功能'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        let message;
        switch (error.code) {
          case error.PERMISSION_DENIED:
            message = '定位权限被拒绝，请在浏览器设置中允许定位';
            break;
          case error.POSITION_UNAVAILABLE:
            message = '无法获取位置信息';
            break;
          case error.TIMEOUT:
            message = '定位请求超时';
            break;
          default:
            message = '定位失败';
        }
        reject(new Error(message));
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000, // 5 分钟
      },
    );
  });
}

/**
 * 高德反向地理编码 — 坐标转城市名
 */
async function reverseGeocode(latitude, longitude) {
  const key = getAmapGeoKey();
  if (!key) {
    throw new Error('高德地图 Key 未配置');
  }

  const url = `https://restapi.amap.com/v3/geocode/regeo?key=${key}&location=${longitude},${latitude}&extensions=base`;

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`);
  }

  const data = await resp.json();
  if (data.status !== '1' || !data.regeocode) {
    throw new Error(data.info || '解析失败');
  }

  // 优先返回区县级，其次市级
  const address = data.regeocode.addressComponent;
  return address?.city || address?.province || null;
}

// ─── 发现模式 Prompt 构建 ──────────────────────────────────

/**
 * 构建发现模式的用户消息
 *
 * @param {Object} location - 用户位置
 * @param {Object} constraints - 约束条件
 * @returns {string} 格式化的用户消息
 */
export function buildDiscoverPrompt(location, constraints = {}) {
  const lines = ['我想去旅行，但不确定去哪里，请帮我推荐目的地：', ''];

  // 位置
  if (location.city) {
    lines.push(`**我的位置**: ${location.city}`);
  } else {
    lines.push(`**我的位置**: 坐标 ${location.latitude.toFixed(2)}, ${location.longitude.toFixed(2)}`);
  }

  // 约束
  if (constraints.maxTravelHours) {
    lines.push(`**最大交通时间**: ${constraints.maxTravelHours}小时以内`);
  }
  if (constraints.maxBudget) {
    lines.push(`**预算**: ${constraints.maxBudget}元/人`);
  }
  if (constraints.duration) {
    const labels = {
      'day-trip': '一日游',
      'weekend': '周末2天',
      '3-5days': '3-5天小长假',
      'flexible': '时间灵活',
    };
    lines.push(`**行程时长**: ${labels[constraints.duration] || constraints.duration}`);
  }
  if (constraints.themes?.length) {
    lines.push(`**主题**: ${constraints.themes.join('、')}`);
  }
  if (constraints.activities?.length) {
    lines.push(`**活动**: ${constraints.activities.join('、')}`);
  }

  lines.push('', '请推荐 3-5 个适合的目的地，并说明推荐理由、交通方式、预估花费。');

  return lines.join('\n');
}
