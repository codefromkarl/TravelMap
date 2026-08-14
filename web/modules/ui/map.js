import { showToast, getAmapKey, getAmapGeoKey, SUPPLY_COLORS, CITY_CENTERS, RISK_COLORS, isDomesticCityForMap, chatPanel, currentLang } from '../infra/context.js';
import { I18N } from '../i18n.js';
import { loadSupplyPointsFromCache, saveSupplyPointsToCache } from '../db.js';
import { registerMarker, scrollToAttraction, clearMarkerRegistry } from '../anchor-link.js';
import { getCachedCoord, setCachedCoord } from '../coord-cache.js';
import { ttlGet, ttlSet } from '../infra/ttl-cache.js';
import { markerRegistry } from '../markers.js';
import { routePlanner } from '../route-planner.js';
import { matchWeatherToDay, classifyWeatherRisk, shouldShowRadar, buildWindyRadarUrl } from '../weather-planning.js';
import { requireAuth } from '../auth/auth.js';
import { getUserLocation, buildDiscoverPrompt } from '../location.js';

// ─── XSS 防护：HTML 转义 ──────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// View-switch controls must remain reachable while either content pane is hidden.
// Keep their DOM ownership at the stable page root, not inside the map pane.
function moveMobileViewControlsToPageRoot() {
  const pageMap = document.getElementById('page-map');
  if (!pageMap) return;
  for (const id of ['mobile-view-toggle', 'mobile-view-toggle-chat']) {
    const control = document.getElementById(id);
    if (control && control.parentElement !== pageMap) pageMap.appendChild(control);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', moveMobileViewControlsToPageRoot, { once: true });
} else {
  moveMobileViewControlsToPageRoot();
}

let _routePanelData = [];

function addDaysToIsoDate(date, offset) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const value = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(value.getTime())) return '';
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

function getDayDate(day, dayIdx, tripPlan) {
  return typeof day?.date === 'string' && day.date ? day.date : addDaysToIsoDate(tripPlan?.startDate, dayIdx);
}

function getRadarCoords(day, city) {
  const locations = [
    ...(day?.attractions || []).map(attr => attr?.location),
    day?.hotel?.location,
  ];
  const valid = locations.find(location => {
    const lat = Number(location?.latitude);
    const lng = Number(location?.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && (lat !== 0 || lng !== 0);
  });
  if (valid) return { latitude: Number(valid.latitude), longitude: Number(valid.longitude) };
  const center = CITY_CENTERS[city];
  return Array.isArray(center) ? { latitude: center[0], longitude: center[1] } : null;
}

function buildRoutePanelDayData(day, dayIdx, tripPlan, attractions, meals) {
  const city = day?.city || tripPlan?.city || '';
  const date = getDayDate(day, dayIdx, tripPlan);
  const weatherDay = date && !day?.date ? { ...day, date, city } : day;
  const weather = matchWeatherToDay(weatherDay, tripPlan, tripPlan?.weatherInfo);
  const weatherRisk = classifyWeatherRisk(weather);
  const radarUrl = weather && shouldShowRadar(weather, weatherRisk)
    ? buildWindyRadarUrl(getRadarCoords(day, city), 11)
    : null;
  return {
    dayNum: dayIdx + 1,
    date,
    city,
    weather,
    weatherRisk,
    radarUrl,
    attractions,
    meals,
  };
}

// ═══════════════════════════════════════════════════════
// 坐标系转换：WGS-84 (GPS) → GCJ-02 (火星坐标/高德)
// Leaflet 使用 WGS-84，高德 API 需要 GCJ-02，直接传会导致偏移
// ═══════════════════════════════════════════════════════
const _PI = 3.14159265358979324;
const _A = 6378245.0;
const _EE = 0.00669342162296594323;

function _outOfChina(lat, lng) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function _transformLat(x, y) {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * _PI) + 20.0 * Math.sin(2.0 * x * _PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(y * _PI) + 40.0 * Math.sin(y / 3.0 * _PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(y / 12.0 * _PI) + 320 * Math.sin(y * _PI / 30.0)) * 2.0 / 3.0;
  return ret;
}

function _transformLng(x, y) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * _PI) + 20.0 * Math.sin(2.0 * x * _PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(x * _PI) + 40.0 * Math.sin(x / 3.0 * _PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(x / 12.0 * _PI) + 300.0 * Math.sin(x / 30.0 * _PI)) * 2.0 / 3.0;
  return ret;
}

/** WGS-84 → GCJ-02（高德/国内地图使用） */
function wgs84ToGcj02(lat, lng) {
  if (_outOfChina(lat, lng)) return { lat, lng };
  let dLat = _transformLat(lng - 105.0, lat - 35.0);
  let dLng = _transformLng(lng - 105.0, lat - 35.0);
  const radLat = lat / 180.0 * _PI;
  let magic = Math.sin(radLat);
  magic = 1 - _EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / ((_A * (1 - _EE)) / (magic * sqrtMagic) * _PI);
  dLng = (dLng * 180.0) / (_A / sqrtMagic * Math.cos(radLat) * _PI);
  return { lat: lat + dLat, lng: lng + dLng };
}

/** GCJ-02 → WGS-84（Leaflet 使用） */
export function gcj02ToWgs84(lat, lng) {
  if (_outOfChina(lat, lng)) return { lat, lng };
  const d = wgs84ToGcj02(lat, lng);
  return { lat: lat - (d.lat - lat), lng: lng - (d.lng - lng) };
}

// ─── 景点间路线规划（高德步行/驾车）───────────────────────
const _routeCache = new Map();
const _ROUTE_CACHE_MAX = 100;

/**
 * 调用高德路线规划 API 获取两点间的步行路线
 * @returns {Promise<Array<[number, number]>>} GCJ-02 坐标点数组
 */
async function fetchWalkingRoute(fromLat, fromLng, toLat, toLng) {
  const cacheKey = `${fromLat.toFixed(4)},${fromLng.toFixed(4)}-${toLat.toFixed(4)},${toLng.toFixed(4)}`;
  if (_routeCache.has(cacheKey)) return _routeCache.get(cacheKey);

  const geoKey = getAmapGeoKey();
  if (!geoKey) return null;

  // 输入坐标已经是 GCJ-02 格式，直接传给高德 API
  try {
    const url = `https://restapi.amap.com/v3/direction/walking?origin=${fromLng.toFixed(6)},${fromLat.toFixed(6)}&destination=${toLng.toFixed(6)},${toLat.toFixed(6)}&key=${geoKey}`;
    const resp = await fetchWithTimeout(url, {}, 5000);
    const data = await resp.json();

    if (data.status === '1' && data.route?.paths?.length > 0) {
      const steps = data.route.paths[0].steps || [];
      const points = [];
      for (const step of steps) {
        if (step.polyline) {
          const coords = step.polyline.split(';').map(c => {
            const [lng, lat] = c.split(',').map(Number);
            // 直接返回 GCJ-02 坐标
            return [lat, lng];
          });
          points.push(...coords);
        }
      }
      _routeCache.set(cacheKey, points);
      // LRU 淘汰
      if (_routeCache.size > _ROUTE_CACHE_MAX) {
        _routeCache.delete(_routeCache.keys().next().value);
      }
      return points;
    }
  } catch (e) {
    console.warn('[Map] 步行路线规划失败:', e.message);
  }

  _routeCache.set(cacheKey, null);
  return null;
}

/**
 * 调用高德驾车路线规划 API 获取两点间的驾车路线
 * @returns {Promise<Array<[number, number]>>} GCJ-02 坐标点数组
 */
async function fetchDrivingRoute(fromLat, fromLng, toLat, toLng) {
  const cacheKey = `drive:${fromLat.toFixed(4)},${fromLng.toFixed(4)}-${toLat.toFixed(4)},${toLng.toFixed(4)}`;
  if (_routeCache.has(cacheKey)) return _routeCache.get(cacheKey);

  const geoKey = getAmapGeoKey();
  if (!geoKey) return null;

  // 输入坐标已经是 GCJ-02 格式，直接传给高德 API
  try {
    const url = `https://restapi.amap.com/v3/direction/driving?origin=${fromLng.toFixed(6)},${fromLat.toFixed(6)}&destination=${toLng.toFixed(6)},${toLat.toFixed(6)}&strategy=0&key=${geoKey}`;
    const resp = await fetchWithTimeout(url, {}, 5000);
    const data = await resp.json();

    if (data.status === '1' && data.route?.paths?.length > 0) {
      const steps = data.route.paths[0].steps || [];
      const points = [];
      for (const step of steps) {
        if (step.polyline) {
          const coords = step.polyline.split(';').map(c => {
            const [lng, lat] = c.split(',').map(Number);
            // 直接返回 GCJ-02 坐标
            return [lat, lng];
          });
          points.push(...coords);
        }
      }
      _routeCache.set(cacheKey, points);
      if (_routeCache.size > _ROUTE_CACHE_MAX) {
        _routeCache.delete(_routeCache.keys().next().value);
      }
      return points;
    }
  } catch (e) {
    console.warn('[Map] 驾车路线规划失败:', e.message);
  }

  _routeCache.set(cacheKey, null);
  return null;
}

/**
 * 为同一天的相邻景点之间绘制路线连接
 * 优化：API 调用并行化，渲染顺序保持（动画效果）
 * @param {Array} attractions - 景点数组（需有 location）
 * @param {string} mode - 'walking' | 'driving'
 * @param {number} dayIdx - 天数索引（用于动画延迟）
 * @param {number} attrOffset - 景点起始编号偏移
 * @returns {Promise<number>} 绘制的路线数量
 */
async function drawInterAttractionRoutes(attractions, mode, dayIdx = 0, attrOffset = 0) {
  if (!pageMapInstance || attractions.length < 2) return 0;

  const validAttrs = attractions.filter(a =>
    a.location?.latitude && a.location?.longitude &&
    (a.location.latitude !== 0 || a.location.longitude !== 0)
  );
  if (validAttrs.length < 2) return 0;

  const fetchFn = mode === 'driving' ? fetchDrivingRoute : fetchWalkingRoute;

  // ── 阶段 1：并行获取所有路线 ──
  const segments = [];
  for (let i = 0; i < validAttrs.length - 1; i++) {
    const from = validAttrs[i];
    const to = validAttrs[i + 1];
    segments.push({ from, to, idx: i });
  }

  // 所有 API 调用并行发起
  const routeResults = await Promise.all(
    segments.map(({ from, to }) =>
      fetchFn(from.location.latitude, from.location.longitude, to.location.latitude, to.location.longitude)
    )
  );

  // ── 阶段 2：顺序渲染（保持动画时序） ──
  let routeCount = 0;
  for (let i = 0; i < segments.length; i++) {
    const { from, to } = segments[i];
    const points = routeResults[i];
    if (!points || points.length < 2) continue;

    // 坐标转换：GCJ-02 → 当前瓦片坐标系
    const tilePoints = points.map(([lat, lng]) => toTileCoords(lat, lng));

    // 绘制路线 polyline
    const polyline = L.polyline(tilePoints, {
      color: mode === 'driving' ? '#6366f1' : '#10b981',
      weight: 3,
      opacity: 0.7,
      lineJoin: 'round',
      lineCap: 'round',
      dashArray: mode === 'driving' ? null : '8,6',
    });
    polyline._dayIdx = dayIdx; // 标记所属天数，供筛选高亮使用
    polyline.addTo(pageMapInstance);

    // snakeIn 动画
    requestAnimationFrame(() => {
      const pathEl = polyline._path;
      if (pathEl && pathEl.getTotalLength) {
        const len = pathEl.getTotalLength();
        pathEl.style.strokeDasharray = len;
        pathEl.style.strokeDashoffset = len;
        pathEl.style.animation = `snakeIn 1s ease-out ${routeCount * 100 + dayIdx * 300}ms forwards`;
      }
    });

    // 路线弹窗：显示距离和时间
    const fromLoc = from.location;
    const toLoc = to.location;
    const midIdx = Math.floor(points.length / 2);
    const midPoint = points[midIdx];
    if (midPoint) {
      const dist = Math.round(calculateDistance(fromLoc.latitude, fromLoc.longitude, toLoc.latitude, toLoc.longitude));
      const walkMin = mode === 'walking' ? Math.ceil(dist / 80) : Math.ceil(dist / 500);
      const infoIcon = L.divIcon({
        className: 'route-info-icon',
        html: `<div class="route-info-badge">${mode === 'driving' ? '🚗' : '🚶'} ${walkMin}分钟</div>`,
        iconSize: [80, 24], iconAnchor: [40, 12],
      });
      const [midLat, midLng] = toTileCoords(midPoint[0], midPoint[1]);
      const infoMarker = L.marker([midLat, midLng], { icon: infoIcon, interactive: false, zIndexOffset: -50 }).addTo(pageMapInstance);
      pageMapLayers.push(infoMarker);
    }

    // 添加方向箭头（每 1/3 和 2/3 处）
    const arrowIndices = [
      Math.floor(points.length / 3),
      Math.floor(points.length * 2 / 3),
    ];
    for (const idx of arrowIndices) {
      if (idx > 0 && idx < points.length - 1) {
        const p1 = points[idx - 1];
        const p2 = points[idx + 1];
        const angle = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) * 180 / Math.PI;
        const arrowIcon = L.divIcon({
          className: 'route-arrow-icon',
          html: `<div class="route-arrow" style="transform: rotate(${90 - angle}deg)">${mode === 'driving' ? '▶' : '▷'}</div>`,
          iconSize: [12, 12], iconAnchor: [6, 6],
        });
        const [arrLat, arrLng] = toTileCoords(points[idx][0], points[idx][1]);
        const arrowMarker = L.marker([arrLat, arrLng], { icon: arrowIcon, interactive: false, zIndexOffset: -100 }).addTo(pageMapInstance);
        pageMapLayers.push(arrowMarker);
      }
    }

    pageMapLayers.push(polyline);
    routeCount++;
  }

  return routeCount;
}

/** 计算两点间的 Haversine 距离（米） */
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

window._drawInterAttractionRoutes = drawInterAttractionRoutes;

/** fetch 带超时 */
function fetchWithTimeout(url, opts = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(id));
}

// ─── 景点坐标补全（地理编码） ────────────────────────────
/** Session 级别强制重新地理编码标志（用于覆盖旧引擎坐标） */
let _forceGeocodeSession = false;

/** 通过高德地理编码 API 获取景点坐标
 * @param {boolean} force - 是否跳过缓存强制重新获取
 */
async function _geocodeOne(name, city, force = false) {
  const key = `${city}:${name}`;

  // 1. 先查持久化缓存（非强制模式）
  if (!force) {
    const cached = await getCachedCoord(city, name);
    if (cached) {
      console.log(`[Map] 坐标缓存命中: ${name}`);
      return cached;
    }
  }

  const geoKey = getAmapGeoKey();
  if (!geoKey) return null;

  try {
    const url = `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(name)}&city=${encodeURIComponent(city)}&key=${geoKey}&output=json`;
    const resp = await fetchWithTimeout(url, {}, 5000);
    const data = await resp.json();
    if (data.status === '1' && data.geocodes?.length > 0) {
      const [lng, lat] = data.geocodes[0].location.split(',').map(Number);
      // 直接返回 GCJ-02 坐标，无需转换
      const result = { latitude: lat, longitude: lng };

      // 2. 写入持久化缓存
      await setCachedCoord(city, name, result);
      console.log(`[Map] 坐标已缓存: ${name}`);

      return result;
    }
  } catch (e) {
    console.warn('[Map] 地理编码失败:', name, e.message);
  }
  return null;
}

/**
 * 批量补全 tripPlan 中缺失坐标的景点
 * 优先用高德 API，fallback 到 CITY_CENTERS 附近随机偏移
 * @param {object} tripPlan
 * @param {boolean} force - 是否强制重新获取所有坐标（覆盖旧引擎数据）
 * @returns {Promise<number>} 补全的景点数量
 */
async function geocodeAttractions(tripPlan, force = false) {
  if (!tripPlan?.days) return 0;

  let fixedCount = 0;
  const pending = [];
  const geoKey = getAmapGeoKey();
  // 如果显式传入了 force=true 且配置了高德 Key，强制重新获取（覆盖旧 Google/Nominatim 坐标）
  const shouldForce = force && geoKey;

  for (const day of tripPlan.days) {
    const city = day.city || tripPlan.city || '';
    for (const attr of day.attractions || []) {
      const loc = attr.location;
      const hasValidLoc = loc && loc.latitude && loc.longitude && (loc.latitude !== 0 || loc.longitude !== 0);
      if (!hasValidLoc || shouldForce) {
        pending.push({ attr, city });
      }
    }
  }

  if (pending.length === 0) return 0;

  // 并发地理编码（最多 5 个并发）
  const BATCH = 5;
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(({ attr, city }) => _geocodeOne(attr.nameZh || attr.name, city, shouldForce))
    );
    for (let j = 0; j < batch.length; j++) {
      const { attr, city } = batch[j];
      const geoResult = results[j];
      if (geoResult) {
        attr.location = geoResult;
        fixedCount++;
      } else {
        // fallback：使用城市中心 + 随机偏移（约 2km 范围）
        const center = CITY_CENTERS[city];
        if (center) {
          const jitter = () => (Math.random() - 0.5) * 0.03;
          attr.location = { latitude: center[0] + jitter(), longitude: center[1] + jitter() };
          fixedCount++;
        }
      }
    }
  }

  return fixedCount;
}

window._geocodeAttractions = geocodeAttractions;

// ─── 一键丰富补给详情 ─────────────────────────────────
document.getElementById("btn-enrich-supplies")?.addEventListener("click", async () => {
  if (!window._lastTripPlan) {
    showToast("暂无行程数据可丰富", 2500, 'warning');
    return;
  }

  const btn = document.getElementById("btn-enrich-supplies");
  btn.disabled = true;
  btn.textContent = "⏳ 丰富中...";
  showToast("🍴 正在丰富补给点详情...");

  try {
    let enrichedCount = 0;
    let cachedCount = 0;
    const tripPlan = window._lastTripPlan;

    for (const day of tripPlan.days) {
      for (const attr of day.attractions) {
        if (!attr.routes) continue;
        for (const route of attr.routes) {
          for (const wp of route.waypoints) {
            if (!wp.supplyPoints || wp.supplyPoints.length === 0) continue;
            const names = wp.supplyPoints.map(sp => sp.name);
            const cached = await loadSupplyPointsFromCache(day.city, names);
            const cachedNames = new Set(cached.map(c => c.name));
            const merged = wp.supplyPoints.map(sp => {
              if (cachedNames.has(sp.name)) {
                cachedCount++;
                return cached.find(c => c.name === sp.name);
              }
              return sp;
            });
            const needEnrich = merged.filter(sp => !sp.locationAccuracy || sp.locationAccuracy === "unknown");
            enrichedCount += needEnrich.length;
            wp.supplyPoints = merged;
          }
        }
      }
    }

    for (const day of tripPlan.days) {
      for (const attr of day.attractions) {
        if (!attr.routes) continue;
        for (const route of attr.routes) {
          for (const wp of route.waypoints) {
            if (wp.supplyPoints) {
              await saveSupplyPointsToCache(day.city, wp.supplyPoints);
            }
          }
        }
      }
    }

    // 刷新全屏地图
    if (pageMapInstance) {
      for (const layer of pageMapLayers) pageMapInstance.removeLayer(layer);
      pageMapLayers = [];
      renderTripOnPageMap(tripPlan);
    }

    if (cachedCount > 0) {
      showToast(`丰富完成：${cachedCount} 个来自缓存${enrichedCount > 0 ? "，" + enrichedCount + " 个待后端验证" : ""}`, 2500, 'success');
    } else if (enrichedCount > 0) {
      showToast(`已标记 ${enrichedCount} 个补给点待验证（需配置 API Key 获取精确数据）`, 2500, 'warning');
    } else {
      showToast("所有补给点已是最新状态", 2500, 'success');
    }
  } catch (err) {
    console.error("Enrich supplies failed:", err);
    showToast("丰富补给点失败", 2500, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = "🔄 丰富补给";
  }
});

// 全局引用供工具模块使用
window._renderTripOnMap = renderTripOnPageMap;
window._renderTripOnMapPanel = renderTripOnPageMap;
window._renderTripAnimated = renderTripAnimated;

// ─── 共享 POI 点击反查（节流 + 缓存） ────────────────────────
function _gridKey(lat, lng) {
  // 将经纬度对齐到约200m网格，同格复用缓存
  return Math.round(lat / _POI_GRID) + ',' + Math.round(lng / _POI_GRID);
}

async function _handleMapPoiClick(e, mapInstance) {
  // 跳过 marker/polyline 等已有元素的点击
  const target = e.originalEvent?.target;
  if (target && typeof target.closest === 'function') {
    if (target.closest('.leaflet-marker-icon, .leaflet-interactive, .supply-marker, .custom-marker, .attraction-marker, .waypoint-marker, .city-marker')) {
      return;
    }
  }

  const now = Date.now();
  if (now - _poiLastTime < _POI_THROTTLE_MS) return;
  _poiLastTime = now;

  const { lat, lng } = e.latlng;
  if (!lat || !lng) return;

  // 缩放级别太低时不查询
  if (mapInstance.getZoom() < 12) {
    showToast('请放大地图后再点击查询周边', 2000, 'warning');
    return;
  }

  const key = _gridKey(lat, lng);

  // ─── 缓存命中 ──────────────────────────────────────
  if (_poiCache.has(key)) {
    const cached = _poiCache.get(key);
    if (!cached) {
      // 空结果缓存也重试（5分钟后过期）
      if (now - cached?._ts < 300000) return;
      _poiCache.delete(key);
    } else {
      L.popup({ maxWidth: 320, className: 'poi-click-popup' })
        .setLatLng([lat, lng])
        .setContent(cached.html)
        .openOn(mapInstance);
      return;
    }
  }

  // ─── 请求 POI 数据 ─────────────────────────────────
  let html = '';
  let source = '';
  const geoKey = getAmapGeoKey();

  try {
    if (geoKey) {
      // 根据当前瓦片类型决定是否需要坐标转换
      // 高德瓦片：Leaflet 事件坐标已是 GCJ-02 数值，直接传
      // OSM 瓦片：Leaflet 事件坐标是 WGS-84，需转 GCJ-02
      const gcj = isUsingAmapTiles() ? { lat, lng } : wgs84ToGcj02(lat, lng);
      const resp = await fetchWithTimeout(
        `https://restapi.amap.com/v3/place/around?location=${gcj.lng.toFixed(6)},${gcj.lat.toFixed(6)}&radius=500&types=风景名胜|餐饮服务|住宿服务|体育休闲服务|购物服务&key=${geoKey}&offset=5&extensions=all`,
        {}, 8000
      );
      const data = await resp.json();
      if (data.status === '1' && data.pois?.length > 0) {
        source = '高德';
        html = data.pois.map(poi => {
          // ─── 防御性类型处理 ───
          const _str = (v) => typeof v === 'string' ? v : (Array.isArray(v) ? v.join(', ') : '');
          const _trim = (v) => _str(v).trim();

          const dist = poi.distance ? `${poi.distance}m` : '';
          const type = _trim(poi.type).split(';')[0];
          const telStr = _trim(poi.tel);
          const tel = telStr ? `<span style="color:#6366f1">📞 ${telStr}</span>` : '';
          const ratingVal = parseFloat(poi.biz_ext?.rating);
          const rating = (ratingVal > 0) ? `<span>⭐ ${ratingVal}</span>` : '';
          const costVal = parseFloat(poi.biz_ext?.cost);
          const cost = (costVal > 0) ? `<span>💰 ¥${costVal}/人</span>` : '';
          const rawOpenTime = poi.biz_ext?.open_time;
          const openTime = Array.isArray(rawOpenTime) ? rawOpenTime.join(' ') : (typeof rawOpenTime === 'string' ? rawOpenTime.trim() : '');
          const hours = openTime ? `<div style="color:#94a3b8;font-size:12px;margin-top:2px">🕐 ${openTime}</div>` : '';
          const photos = poi.photos?.[0]?.url
            ? `<div style="margin-top:4px"><img src="${poi.photos[0].url}" style="width:100%;border-radius:6px;max-height:120px;object-fit:cover" loading="lazy"></div>`
            : '';
          const name = _trim(poi.name) || '未知地点';
          const address = _trim(poi.address);

          return `<div style="padding:6px 0;border-bottom:1px solid #f1f5f9">
            <div style="font-weight:600;color:#1e293b;font-size:14px">${name}</div>
            <div style="font-size:12px;color:#64748b;margin-top:2px">${type}${dist ? ' · ' + dist : ''}${address ? ' · ' + address : ''}</div>
            <div style="font-size:12px;margin-top:2px;display:flex;gap:8px;flex-wrap:wrap">${rating}${cost}${tel}</div>
            ${hours}${photos}
          </div>`;
        }).join('');
        html = `<div style="max-height:280px;overflow-y:auto">${html}</div>`;
      } else if (data.info) {
        console.warn('[POI] 高德返回错误:', data.info);
      }
    }

    // 高德失败或无 Key 时，fallback 到 Nominatim
    if (!html) {
      const resp = await fetchWithTimeout(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1&accept-language=zh`,
        {}, 6000
      );
      const data = await resp.json();
      if (data && data.display_name && !data.error) {
        source = 'OSM';
        const name = data.name || data.address?.road || data.address?.suburb || '';
        html = `<div style="padding:4px 0">
          <div style="font-weight:600;color:#1e293b;font-size:14px">${name}</div>
          <div style="font-size:12px;color:#64748b;margin-top:4px">📍 ${data.display_name}</div>
          <div style="font-size:11px;color:#f59e0b;margin-top:4px">💡 配置高德地图 Key 可获取更丰富的 POI 信息</div>
        </div>`;
      }
    }

    if (html) {
      _poiCache.set(key, { html, _ts: now });
      if (_poiCache.size > 100) {
        const oldest = _poiCache.keys().next().value;
        _poiCache.delete(oldest);
      }
      L.popup({ maxWidth: 320, className: 'poi-click-popup' })
        .setLatLng([lat, lng])
        .setContent(html)
        .openOn(mapInstance);
    } else {
      // 空结果也缓存，但带时间戳以便过期重试
      _poiCache.set(key, { html: '', _ts: now });
      showToast('该位置暂未找到 POI 信息', 2500, 'warning');
    }
  } catch (err) {
    console.warn('[POI] 查询失败:', err?.message || err);
    // 网络错误不缓存，让用户可以重试
    showToast('查询失败，请检查网络或 API Key', 3000, 'error');
  }
}

// ─── 全屏地图页面 ────────────────────────────────────────
let pageMapInstance = null;
let pageMapLayers = [];
let pageMapCurrentLayer = 'standard';
let pageMapTileLayers = {};
let _poiPopup = null; // 地图点击 POI 反查弹窗
let _poiCache = new Map(); // 经纬度 → POI 结果缓存（避免重复请求）
let _poiLastTime = 0; // 上次 POI 请求时间（节流）
const _POI_THROTTLE_MS = 800; // 两次点击最短间隔
const _POI_GRID = 0.002; // 约200m 网格精度，同一格内复用缓存

/**
 * 判断当前是否使用高德瓦片
 * 通过检查实际瓦片 URL 判断，而非仅依赖 Key 存在
 */
function isUsingAmapTiles() {
  // 检查当前激活的瓦片图层是否来自高德
  const currentTileLayer = pageMapTileLayers[pageMapCurrentLayer];
  if (!currentTileLayer) return false;
  // 高德瓦片 URL 包含 autonavi.com
  const url = currentTileLayer._url || '';
  if (url.includes('autonavi.com')) return true;
  // fallback：检查 Key + 图层名
  const AMAP_KEY = getAmapKey();
  if (!AMAP_KEY) return false;
  return pageMapCurrentLayer === 'standard' || pageMapCurrentLayer === 'satellite';
}

/**
 * 将 WGS-84 坐标转换为当前瓦片所需的坐标系
 * - 高德瓦片：WGS-84 → GCJ-02
 * - OSM 瓦片：转换为 WGS-84
 */
function toTileCoords(lat, lng) {
  if (isUsingAmapTiles()) {
    // 高德瓦片：直接使用 GCJ-02 坐标（后端已存储 GCJ-02）
    return [lat, lng];
  }
  // OSM 瓦片：GCJ-02 → WGS-84
  const wgs = gcj02ToWgs84(lat, lng);
  return [wgs.lat, wgs.lng];
}

/**
 * 将 WGS-84 坐标数组转换为当前瓦片所需的坐标系
 */
function toTileCoordsArray(coords) {
  return coords.map(([lat, lng]) => toTileCoords(lat, lng));
}

export function initPageMap() {
  const container = document.getElementById('page-map-container');
  if (!container || !L) return;
  const emptyHint = document.getElementById('page-map-empty');

  if (!pageMapInstance) {
    let mapDiv = container.querySelector('#page-map-leaflet');
    if (!mapDiv) {
      mapDiv = document.createElement('div');
      mapDiv.id = 'page-map-leaflet';
      container.appendChild(mapDiv);
    }
    setTimeout(() => {
      pageMapInstance = L.map('page-map-leaflet', {
        zoomControl: false, attributionControl: false,
      });
      L.control.zoom({ position: 'bottomright' }).addTo(pageMapInstance);

      const AMAP_KEY = getAmapKey();
      pageMapTileLayers.standard = AMAP_KEY
        ? L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}&key=' + AMAP_KEY, {
            maxZoom: 18, subdomains: ['1','2','3','4'],
          })
        : L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19, attribution: '© OpenStreetMap',
          });

      pageMapTileLayers.satellite = AMAP_KEY
        ? L.tileLayer('https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}&key='+ AMAP_KEY, {
            maxZoom: 18, subdomains: ['1','2','3','4'],
          })
        : L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 18, subdomains: [],
          });

      pageMapTileLayers._satLabel = AMAP_KEY
        ? L.tileLayer('https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}&key='+ AMAP_KEY, {
            maxZoom: 18, subdomains: ['1','2','3','4'], opacity: 0.7,
          })
        : null;

      pageMapTileLayers.terrain = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 17, subdomains: ['a','b','c'],
      });

      pageMapTileLayers.standard.addTo(pageMapInstance);
      pageMapInstance.setView([35.86, 104.20], 5);
      setupMapInteractions();

      if (window._lastTripPlan) {
        if (emptyHint) emptyHint.style.display = 'none';
        // 先补全缺失坐标，再渲染
        geocodeAttractions(window._lastTripPlan, true).then(count => {
          if (count > 0) {
            console.log(`[Map] 补全了 ${count} 个景点坐标`);
            // 回写 IndexedDB，持久化补全后的坐标
            window._autoSaveTrip?.();
          }
          renderTripOnPageMap(window._lastTripPlan);
        });
      }
      pageMapInstance.invalidateSize();
    }, 80);
    return;
  }

  pageMapInstance.invalidateSize();
  if (window._lastTripPlan) {
    if (emptyHint) emptyHint.style.display = 'none';
    for (const layer of pageMapLayers) pageMapInstance.removeLayer(layer);
    pageMapLayers = [];
    // 先补全缺失坐标，再渲染
    geocodeAttractions(window._lastTripPlan, true).then(count => {
      if (count > 0) {
        console.log(`[Map] 补全了 ${count} 个景点坐标`);
        window._autoSaveTrip?.();
      }
      renderTripOnPageMap(window._lastTripPlan);
    });
  } else {
    if (emptyHint) emptyHint.style.display = 'flex';
  }
}

window._initPageMap = initPageMap;
// 通过 getter 暴露实时实例，避免模块加载时捕获 null
Object.defineProperty(window, '_pageMapInstance', {
  get() { return pageMapInstance; },
  configurable: true,
});

// ─── 实时规划指示器 ────────────────────────────────────
let _planningMarker = null;

export function showPlanningIndicator(text) {
  if (!pageMapInstance) return;
  hidePlanningIndicator();
  const center = pageMapInstance.getCenter();
  const icon = L.divIcon({
    className: 'planning-indicator',
    html: '<div class="planning-pulse"></div><div class="planning-text">' + (text || '正在规划行程...') + '</div>',
    iconSize: [220, 80],
    iconAnchor: [110, 40],
  });
  _planningMarker = L.marker(center, { icon, interactive: false, zIndexOffset: 1000 }).addTo(pageMapInstance);
}

export function hidePlanningIndicator() {
  if (_planningMarker && pageMapInstance) {
    pageMapInstance.removeLayer(_planningMarker);
    _planningMarker = null;
  }
}

// ─── 搜索框定位（带 TTL 缓存，降低外部 API 配额消耗） ────────
const POI_TTL_MS = 24 * 60 * 60 * 1000; // 高德 POI 搜索缓存 24h
const NOMINATIM_TTL_MS = 7 * 24 * 60 * 60 * 1000; // Nominatim 缓存 7 天

/**
 * 根据查询词返回地图定位结果（高德 POI 搜索 / Nominatim 备选）。
 * 结果写入 localStorage TTL 缓存；命中缓存时直接返回，不发起网络请求。
 * @param {string} query 查询词
 * @param {string} [geoKey] 高德 Geo Key（存在则走高德，否则走 Nominatim）
 * @returns {Promise<{source: string, lat: number, lng: number, name: string, address: string} | null>}
 */
export async function searchLocation(query, geoKey) {
  if (geoKey) {
    const cacheKey = `poi:${query}`;
    const cached = ttlGet(cacheKey);
    if (cached) return cached;

    const url = `https://restapi.amap.com/v3/place/text?keywords=${encodeURIComponent(query)}&types=风景名胜|餐饮服务|住宿服务&key=${geoKey}&offset=3`;
    const resp = await fetchWithTimeout(url, {}, 8000);
    const data = await resp.json();
    if (data.status === '1' && data.pois?.length > 0) {
      const poi = data.pois.find(p => p.type?.includes('风景名胜')) || data.pois[0];
      const loc = poi.location.split(',');
      const result = {
        source: 'amap',
        lat: parseFloat(loc[1]),
        lng: parseFloat(loc[0]),
        name: poi.name,
        address: poi.address || poi.cityname || '',
      };
      ttlSet(cacheKey, result, POI_TTL_MS);
      return result;
    }
    return null;
  }

  const cacheKey = `nominatim:${query}`;
  const cached = ttlGet(cacheKey);
  if (cached) return cached;

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
  const resp = await fetchWithTimeout(url, {}, 8000);
  const data = await resp.json();
  if (data.length > 0) {
    const result = {
      source: 'nominatim',
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      name: data[0].display_name || query,
      address: data[0].display_name || query,
    };
    ttlSet(cacheKey, result, NOMINATIM_TTL_MS);
    return result;
  }
  return null;
}

function setupMapInteractions() {
  // ─── 左侧面板拖拽调整宽度 ────────────────────────────
  (function initPanelResizer() {
    const resizer = document.getElementById('panel-resizer');
    const leftPanel = document.getElementById('map-chat-panel');
    if (!resizer || !leftPanel) return;

    // 恢复上次保存的宽度
    const savedWidth = localStorage.getItem('travel-map-chat-width');
    if (savedWidth) {
      const w = parseInt(savedWidth, 10);
      if (w >= 320 && w <= window.innerWidth * 0.6) {
        leftPanel.style.width = w + 'px';
      }
    }

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    resizer.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = leftPanel.offsetWidth;
      resizer.classList.add('resizing');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      // 防止 iframe/web component 内部捕获事件
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const dx = e.clientX - startX;
      let newWidth = startWidth + dx;
      const minW = 320;
      const maxW = Math.min(window.innerWidth * 0.6, window.innerWidth - 320);
      newWidth = Math.max(minW, Math.min(maxW, newWidth));
      leftPanel.style.width = newWidth + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (!isResizing) return;
      isResizing = false;
      resizer.classList.remove('resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem('travel-map-chat-width', String(leftPanel.offsetWidth));
      // 拖拽完成后通知 Leaflet 重绘
      if (pageMapInstance) pageMapInstance.invalidateSize();
    });
  })();

  document.getElementById('btn-map-routes')?.addEventListener('click', () => {
    document.getElementById('page-map-routes')?.classList.toggle('show');
    document.getElementById('btn-map-routes')?.classList.toggle('active');
  });
  // 路线面板最小化按钮
  document.getElementById('btn-minimize-routes')?.addEventListener('click', () => {
    document.getElementById('page-map-routes')?.classList.remove('show');
    document.getElementById('btn-map-routes')?.classList.remove('active');
  });
  document.getElementById('btn-map-layers')?.addEventListener('click', () => {
    document.getElementById('map-layer-switcher')?.classList.toggle('show');
  });

  document.querySelectorAll('.map-layer-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const layer = btn.dataset.layer;
      if (layer === pageMapCurrentLayer) return;
      pageMapTileLayers[pageMapCurrentLayer]?.remove();
      pageMapTileLayers._satLabel?.remove();
      pageMapTileLayers[layer]?.addTo(pageMapInstance);
      if (layer === 'satellite') pageMapTileLayers._satLabel?.addTo(pageMapInstance);
      pageMapCurrentLayer = layer;
      document.querySelectorAll('.map-layer-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('map-layer-switcher')?.classList.remove('show');

      const newLayer = pageMapTileLayers[layer];
      if (newLayer) {
        const loadingEl = document.getElementById('page-map-loading-hint');
        const onTileDone = () => {
          newLayer.off('tileload', onTileLoad);
          newLayer.off('load', onTileDone);
          newLayer.off('tileerror', onTileDone);
          if (loadingEl) loadingEl.textContent = '';
        };
        const onTileLoad = () => {};
        newLayer.on('tileload', onTileLoad);
        newLayer.on('load', onTileDone);
        newLayer.on('tileerror', onTileDone);
        if (loadingEl) loadingEl.textContent = '⏳ 地图瓦片加载中...';
      }
    });
  });

  document.getElementById('btn-map-locate')?.addEventListener('click', () => {
    if (pageMapLayers.length > 0 && pageMapInstance) {
      const bounds = L.featureGroup(pageMapLayers).getBounds();
      if (bounds.isValid()) pageMapInstance.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
    }
  });

  // ─── 移动端视图切换 ─────────────────────────────────
  document.getElementById('btn-mobile-toggle')?.addEventListener('click', () => {
    const pageMap = document.getElementById('page-map');
    if (!pageMap) return;
    if (pageMap.classList.contains('mobile-map-focused')) {
      pageMap.classList.remove('mobile-map-focused');
      pageMap.classList.add('mobile-chat-focused');
    } else if (pageMap.classList.contains('mobile-chat-focused')) {
      pageMap.classList.remove('mobile-chat-focused');
      pageMap.classList.add('mobile-map-focused');
    } else {
      // 默认切换到地图视图
      pageMap.classList.add('mobile-map-focused');
    }
    // 通知 Leaflet 重绘
    setTimeout(() => pageMapInstance?.invalidateSize(), 100);
  });

  // ─── 地图点击 POI 反查 ─────────────────────────────────
  pageMapInstance.on('click', async (e) => {
    document.getElementById('map-layer-switcher')?.classList.remove('show');
    await _handleMapPoiClick(e, pageMapInstance);
  });

  // 快捷提示点击
  document.querySelectorAll('#map-chat-welcome .quick-prompt').forEach(el => {
    el.addEventListener('click', async () => {
      let prompt = el.dataset.prompt;
      const isDiscover = el.dataset.action === 'discover';
      if (!prompt && !isDiscover) return;
      if (!chatPanel?.agentInterface) {
        showToast('聊天组件未初始化，请刷新页面', 3000, 'error');
        return;
      }
      if (!await requireAuth()) return;

      if (isDiscover) {
        try {
          showToast('正在获取您的位置...', 2000, 'info');
          const location = await getUserLocation();
          prompt = buildDiscoverPrompt(location, { maxTravelHours: 3, duration: 'weekend' });
        } catch (err) {
          console.error('[Discover] 失败:', err);
          showToast(err.message || '定位失败，请手动输入位置', 3000, 'error');
          return;
        }
      }

      // 1. 立即隐藏欢迎区
      const welcome = document.getElementById('map-chat-welcome');
      if (welcome) welcome.style.display = 'none';

      // 2. 在聊天面板中插入用户消息占位（即时视觉反馈）
      const chatBody = document.getElementById('map-chat-body');
      if (chatBody) {
        const userBubble = document.createElement('div');
        userBubble.className = 'quick-prompt-user-msg';
        userBubble.innerHTML = `<div class="qp-msg-content">${escapeHtml(prompt)}</div>`;
        chatBody.appendChild(userBubble);
        chatBody.scrollTop = chatBody.scrollHeight;
      }

      // 3. 发送消息给 Agent
      try {
        await chatPanel.agentInterface.sendMessage(prompt);
      } catch (err) {
        console.error('[QuickPrompt] 发送失败:', err);
        showToast(`发送失败: ${err.message}`, 3000, 'error');
      }
    });
  });

  document.getElementById('btn-map-back')?.addEventListener('click', () => {});

  // 地图搜索功能（高德 POI 搜索 + Nominatim 备选，带 TTL 缓存）
  const searchInput = document.getElementById('map-search-input');
  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const query = searchInput.value.trim();
        if (query && pageMapInstance) {
          const geoKey = getAmapGeoKey();
          searchLocation(query, geoKey)
            .then((result) => {
              if (!result) {
                showToast('未找到该地点', 2500, 'warning');
                return;
              }
              if (result.source === 'nominatim') {
                // WGS-84 需先转 GCJ-02，再通过 toTileCoords 转换
                const gcj = wgs84ToGcj02(result.lat, result.lng);
                const [tileLat, tileLng] = toTileCoords(gcj.lat, gcj.lng);
                pageMapInstance.setView([tileLat, tileLng], 14);
                const searchMarker = L.marker([tileLat, tileLng]).addTo(pageMapInstance)
                  .bindPopup(result.address || query)
                  .openPopup();
                pageMapLayers.push(searchMarker);
              } else {
                // 高德返回 GCJ-02 坐标，通过 toTileCoords 转换为当前瓦片坐标系
                const [tileLat, tileLng] = toTileCoords(result.lat, result.lng);
                pageMapInstance.setView([tileLat, tileLng], 15);
                const searchMarker = L.marker([tileLat, tileLng]).addTo(pageMapInstance)
                  .bindPopup(`<b>${result.name}</b><br>${result.address || ''}`)
                  .openPopup();
                pageMapLayers.push(searchMarker);
              }
            })
            .catch(() => showToast('搜索失败，请稍后重试', 3000, 'error'));
        }
      }
    });
  }
}

async function renderTripOnPageMap(tripPlan) {
  if (!tripPlan || !tripPlan.days || !pageMapInstance) return;

  // 检测缺失坐标并补全
  const hasMissingCoords = tripPlan.days.some(d =>
    (d.attractions || []).some(a => {
      const loc = a.location;
      return !loc || !loc.latitude || !loc.longitude || (loc.latitude === 0 && loc.longitude === 0);
    })
  );
  if (hasMissingCoords) {
    const fixed = await geocodeAttractions(tripPlan);
    if (fixed > 0) {
      console.log(`[Map] renderTripOnPageMap: 补全了 ${fixed} 个景点坐标`);
      window._autoSaveTrip?.();
    }
  }

  // 计算每天的起始序号偏移（全局连续编号）
  const dayAttrOffsets = [];
  let globalOffset = 0;
  for (const day of tripPlan.days) {
    dayAttrOffsets.push(globalOffset);
    globalOffset += (day.attractions || []).length;
  }

  const allCoords = [];
  let markerCount = 0, routeCount = 0, supplyPointCount = 0;
  const routePanelData = [];

  for (let dayIdx = 0; dayIdx < tripPlan.days.length; dayIdx++) {
    const day = tripPlan.days[dayIdx];
    const dayCity = day.city || tripPlan.city;
    const dayAttrItems = [];
    const attrOffset = dayAttrOffsets[dayIdx]; // 当前天的序号偏移

    for (let attrIdx = 0; attrIdx < (day.attractions || []).length; attrIdx++) {
      const attr = day.attractions[attrIdx];
      const loc = attr.location;
      const globalSeqNum = attrOffset + attrIdx + 1; // 全局连续序号

      if (loc && loc.latitude && loc.longitude && (loc.latitude !== 0 || loc.longitude !== 0)) {
        const icon = L.divIcon({
          className: 'custom-marker',
          html: '<div class="attraction-marker" data-day="' + (dayIdx + 1) + '" style="animation-delay:' + ((dayIdx * 4 + attrIdx) * 60) + 'ms">' + globalSeqNum + '</div>',
          iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -20],
        });
        const popupHtml = '<div class="map-popup">' +
          '<div class="popup-title">' + (attr.nameZh || attr.name || '景点') + '</div>' +
          (attr.description ? '<div class="popup-desc">' + attr.description + '</div>' : '') +
          (attr.images && attr.images.length > 0 ? '<div style="margin-top:4px"><img src="' + attr.images[0].url + '" style="width:100%;border-radius:6px;max-height:120px;object-fit:cover" loading="lazy"></div>' : '') +
          '<div class="popup-city">📍 ' + (attr.address || dayCity) + '</div>' +
          '<div class="popup-meta">' +
          (attr.visitDuration ? '<span>⏱ ' + attr.visitDuration + '分钟</span>' : '') +
          (attr.ticketPrice !== undefined ? '<span>🎫 ' + (attr.ticketPrice > 0 ? '¥' + attr.ticketPrice : '免费') + '</span>' : '') +
          '</div>' +
          (attr.tips ? '<div class="popup-tips">💡 ' + attr.tips + '</div>' : '') +
          '</div>';
        const attrName = attr.nameZh || attr.name || '景点';
        const [markerLat, markerLng] = toTileCoords(loc.latitude, loc.longitude);
        const marker = L.marker([markerLat, markerLng], { icon, interactive: true }).bindPopup(popupHtml, { maxWidth: 280 });
        marker.addTo(pageMapInstance);
        marker.on('click', () => scrollChatToAttraction(attrName));
        pageMapLayers.push(marker);
        allCoords.push([markerLat, markerLng]);
        markerCount++;

        // 注册到锚点系统
        registerMarker(attrName, marker, pageMapInstance);
      }

      dayAttrItems.push({ name: attr.nameZh || attr.name, duration: attr.visitDuration, lat: loc?.latitude, lng: loc?.longitude });

      if (attr.routes && attr.selectedRouteId) {
        const route = attr.routes.find(r => r.id === attr.selectedRouteId);
        if (route && route.waypoints && route.waypoints.length > 1) {
          const path = route.waypoints
            .filter(wp => wp.location && (wp.location.latitude !== 0 || wp.location.longitude !== 0))
            .map(wp => toTileCoords(wp.location.latitude, wp.location.longitude));
          if (path.length > 1) {
            const riskLevel = route.riskAssessment?.riskLevel || 1;
            const rc = RISK_COLORS[riskLevel] || RISK_COLORS[1];
            const polyline = L.polyline(path, {
              color: rc.stroke, weight: 4, opacity: 0.85,
              lineJoin: 'round', lineCap: 'round',
              dashArray: riskLevel === 3 ? '10,6' : null,
            });
            polyline._dayIdx = dayIdx; // 标记所属天数，供筛选高亮使用
            polyline.addTo(pageMapInstance);
            // 路线 snakeIn 画入动画
            requestAnimationFrame(() => {
              const pathEl = polyline._path;
              if (pathEl && pathEl.getTotalLength) {
                const len = pathEl.getTotalLength();
                pathEl.style.strokeDasharray = len;
                pathEl.style.strokeDashoffset = len;
                pathEl.style.animation = 'snakeIn 1.2s ease-out ' + (routeCount * 150) + 'ms forwards';
              }
            });
            pageMapLayers.push(polyline);
            routeCount++;

            route.waypoints.forEach((wp, i) => {
              if (wp.location && (wp.location.latitude !== 0 || wp.location.longitude !== 0)) {
                const wpIcon = L.divIcon({
                  className: 'custom-marker',
                  html: '<div class="waypoint-marker" style="animation-delay:' + ((dayIdx * 4 + attrIdx + i) * 40) + 'ms"></div>',
                  iconSize: [12, 12], iconAnchor: [6, 6],
                });
                let wpPopup = '<div class="map-popup"><div class="popup-title">' + (i+1) + '. ' + wp.name + '</div>';
                if (wp.elevation) wpPopup += '<div class="popup-meta"><span>⛰ ' + wp.elevation + 'm</span></div>';
                if (wp.visitDuration) wpPopup += '<div class="popup-meta"><span>⏱ ' + wp.visitDuration + '分钟</span></div>';

                if (wp.supplyPoints?.length) {
                  wpPopup += '<div class="popup-supply-list"><b>🍴 补给:</b>';
                  for (const sp of wp.supplyPoints) {
                    if (!sp.location) continue;
                    const cost = sp.estimatedCost > 0 ? '¥' + sp.estimatedCost : '免费';
                    wpPopup += '<div class="popup-supply-item">· ' + sp.name + ' (' + sp.type + ') ' + cost + '</div>';
                    const color = SUPPLY_COLORS[sp.type] || '#6b7280';
                    const accuracy = sp.locationAccuracy || 'unknown';
                    if (accuracy === 'unknown') continue;
                    const spIcon = L.divIcon({
                      className: 'custom-marker',
                      html: '<div class="supply-marker" style="width:12px;height:12px;border-radius:50%;background:' + color + ';border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);animation:markerPopIn 0.35s cubic-bezier(0.34,1.56,0.64,1) both;"></div>',
                      iconSize: [12, 12], iconAnchor: [6, 6],
                    });
                    const [spLat, spLng] = toTileCoords(sp.location.latitude, sp.location.longitude);
                    const spMarker = L.marker([spLat, spLng], { icon: spIcon, interactive: true })
                      .bindPopup('<div class="map-popup"><div class="popup-title">' + sp.name + '</div><div class="popup-meta"><span>' + sp.type + '</span><span>' + (sp.estimatedCost > 0 ? '¥'+sp.estimatedCost : '免费') + '</span></div></div>', { maxWidth: 240 });
                    spMarker.addTo(pageMapInstance);
                    pageMapLayers.push(spMarker);
                    allCoords.push([spLat, spLng]);
                    supplyPointCount++;
                  }
                  wpPopup += '</div>';
                }

                if (route.riskAssessment) {
                  const ra = route.riskAssessment;
                  const bs = 'background:' + rc.bg + ';color:' + rc.stroke;
                  wpPopup += '<div class="popup-route-info"><span class="risk-badge" style="' + bs + '">' + rc.label2 + '</span>';
                  if (ra.maxElevation > 0) wpPopup += ' <span style="font-size:12px;color:#888">最高 ' + ra.maxElevation + 'm</span>';
                  wpPopup += '</div>';
                }
                wpPopup += '</div>';
                const [wpLat, wpLng] = toTileCoords(wp.location.latitude, wp.location.longitude);
                const wpMarker = L.marker([wpLat, wpLng], { icon: wpIcon, interactive: true }).bindPopup(wpPopup, { maxWidth: 280 });
                wpMarker.addTo(pageMapInstance);
                pageMapLayers.push(wpMarker);
                allCoords.push([wpLat, wpLng]);
              }
            });
          }
        }
      }
    }
    // 餐厅标记
    let restaurantCount = 0;
    for (const meal of (day.meals || [])) {
      const r = meal.restaurant;
      if (r && r.location && r.location.latitude && r.location.longitude) {
        const { iconOptions, popupHtml } = markerRegistry.create('restaurant', r);
        const rIcon = L.divIcon(iconOptions);
        const [rLat, rLng] = toTileCoords(r.location.latitude, r.location.longitude);
        const rMarker = L.marker([rLat, rLng], { icon: rIcon, interactive: true }).bindPopup('<div class="map-popup">' + popupHtml + '</div>', { maxWidth: 260 });
        rMarker.addTo(pageMapInstance);
        pageMapLayers.push(rMarker);
        allCoords.push([rLat, rLng]);
        restaurantCount++;
      }
    }
    const dayMeals = (day.meals || []).map(m => ({
      type: m.type,
      name: m.name,
      description: m.description,
      estimatedCost: m.estimatedCost,
      restaurant: m.restaurant,
    }));
    routePanelData.push(buildRoutePanelDayData(day, dayIdx, tripPlan, dayAttrItems, dayMeals));

    // ── 酒店 marker ──────────────────────────────────
    const hotelLoc = day.hotel?.location;
    if (hotelLoc?.latitude && hotelLoc.longitude && (hotelLoc.latitude !== 0 || hotelLoc.longitude !== 0)) {
      const { iconOptions, popupHtml } = markerRegistry.create('hotel', day.hotel);
      const hIcon = L.divIcon(iconOptions);
      const [hLat, hLng] = toTileCoords(hotelLoc.latitude, hotelLoc.longitude);
      const hMarker = L.marker([hLat, hLng], { icon: hIcon, interactive: true }).bindPopup(popupHtml, { maxWidth: 260 });
      hMarker.addTo(pageMapInstance);
      pageMapLayers.push(hMarker);
      allCoords.push([hLat, hLng]);
    }

    // ── 绘制路线：酒店 → 景点1 → 景点2 → ... → 酒店 ──
    const validDayAttrs = (day.attractions || []).filter(a =>
      a.location?.latitude && a.location?.longitude &&
      (a.location.latitude !== 0 || a.location.longitude !== 0)
    );
    // 使用 route-planner 构建路线点
    const routePoints = routePlanner.planDayRoutes(day);
    if (routePoints.length >= 2) {
      const interRoutes = await drawInterAttractionRoutes(routePoints, 'walking', dayIdx, 0);
      routeCount += interRoutes;
    }
  }

  // 城市间连线
  if (tripPlan.cities && tripPlan.cities.length > 1) {
    const cityPath = tripPlan.cities.filter(c => CITY_CENTERS[c.city]).map(c => toTileCoordsArray([CITY_CENTERS[c.city]])[0]);
    if (cityPath.length > 1) {
      const cityLine = L.polyline(cityPath, { color: '#6366f1', weight: 3, opacity: 0.5, dashArray: '12,8' });
      cityLine.addTo(pageMapInstance);
      pageMapLayers.push(cityLine);
      tripPlan.cities.forEach((c, ci) => {
        const center = CITY_CENTERS[c.city];
        if (center) {
          const cityIcon = L.divIcon({
            className: 'custom-marker',
            html: '<div class="city-marker" style="animation-delay:' + (ci * 100) + 'ms">' + c.city + (c.days ? ' · '+c.days+'天' : '') + '</div>',
            iconSize: [100, 28], iconAnchor: [50, 14],
          });
          const [cityLat, cityLng] = toTileCoords(center[0], center[1]);
          const cityMarker = L.marker([cityLat, cityLng], { icon: cityIcon, interactive: true }).addTo(pageMapInstance);
          pageMapLayers.push(cityMarker);
          allCoords.push([cityLat, cityLng]);
        }
      });
    }
  }

  if (allCoords.length > 0) {
    pageMapInstance.fitBounds(allCoords, { padding: [60, 60], maxZoom: 14 });
  } else {
    const fbCenter = CITY_CENTERS[tripPlan.city || '上海'] || [31.23, 121.47];
    const [fbLat, fbLng] = toTileCoords(fbCenter[0], fbCenter[1]);
    pageMapInstance.setView([fbLat, fbLng], 12);
  }

  const statusBar = document.getElementById('page-map-statusbar');
  if (statusBar) statusBar.classList.add('show');
  const sa = document.getElementById('status-attractions');
  if (sa) sa.innerHTML = '📍 <span class="dot-label">景点</span> ' + markerCount;
  const sr = document.getElementById('status-routes');
  if (sr) sr.innerHTML = '🛤️ <span class="dot-label">路线</span> ' + routeCount;
  const ss = document.getElementById('status-supplies');
  if (ss) ss.innerHTML = '🍴 <span class="dot-label">补给</span> ' + supplyPointCount;
  const sd = document.getElementById('status-days');
  if (sd) sd.innerHTML = '📅 <span class="dot-label">天数</span> ' + (tripPlan.days?.length||0);

  if (markerCount > 0) document.getElementById('page-map-legend')?.classList.add('show');
  renderRoutePanel(routePanelData);
  renderDayFilters(tripPlan); // 渲染天数筛选按钮

  // 坐标完整性检查：有景点但 0 marker → 提示用户数据不完整
  const totalAttractions = tripPlan.days?.reduce((sum, d) => sum + (d.attractions?.length || 0), 0) || 0;
  if (markerCount === 0 && totalAttractions > 0) {
    showToast('行程数据不完整：' + totalAttractions + ' 个景点缺少坐标，建议重新生成行程', 6000, 'warning');
  }
}

// ─── 逐步动画渲染 ──────────────────────────────────────
let _animAbort = false; // 用于取消正在进行的动画
let _animRunning = false; // 动画是否正在执行（供跳过按钮轮询）

/**
 * 跳过当前巡游动画（外部调用）
 * 动画会尽快中断，并仍然执行收尾（fitBounds / 状态栏 / 路线面板）。
 */
window._skipTripAnimation = () => {
  _animAbort = true;
};

/** 巡游动画是否正在执行 */
window._isTripAnimationRunning = () => _animRunning;

/**
 * 逐步动画渲染行程到地图上
 * - 按天 → 按景点依次弹出 marker + panTo
 * - 路线 snakeIn 画入
 * - 餐厅 marker 延迟弹出
 * - 最后 fitBounds 适配全视图
 */
async function renderTripAnimated(tripPlan) {
  if (!tripPlan || !tripPlan.days || !pageMapInstance) return;

  // 补全缺失坐标
  const geoFixed = await geocodeAttractions(tripPlan);
  if (geoFixed > 0) console.log(`[Map] renderTripAnimated: 补全了 ${geoFixed} 个景点坐标`);

  // 取消上一次动画
  _animAbort = true;
  await delay(50);
  _animAbort = false;
  _animRunning = true;

  // 清除旧图层
  for (const layer of pageMapLayers) pageMapInstance.removeLayer(layer);
  pageMapLayers = [];

  // 计算每天的起始序号偏移（全局连续编号）
  const dayAttrOffsets = [];
  let globalOffset = 0;
  for (const day of tripPlan.days) {
    dayAttrOffsets.push(globalOffset);
    globalOffset += (day.attractions || []).length;
  }

  const allCoords = [];
  let markerCount = 0, routeCount = 0, supplyPointCount = 0;
  const routePanelData = [];

  // 大行程（7天+）自动压缩间隔，总时长不超过 15 秒
  const totalDays = tripPlan.days.length;
  const bigTrip = totalDays >= 7;
  const attrDelay = bigTrip ? 200 : 400;    // 景点 marker 间隔
  const routeDelay = bigTrip ? 300 : 600;    // 路线 snakeIn 延迟
  const restDelay = bigTrip ? 150 : 300;     // 餐厅 marker 间隔
  const dayTransitionDelay = bigTrip ? 800 : 1500; // 每天之间的过渡延迟

  // 先渲染城市间连线（背景层）
  if (tripPlan.cities && tripPlan.cities.length > 1) {
    const cityPath = tripPlan.cities.filter(c => CITY_CENTERS[c.city]).map(c => toTileCoordsArray([CITY_CENTERS[c.city]])[0]);
    if (cityPath.length > 1) {
      const cityLine = L.polyline(cityPath, { color: '#6366f1', weight: 3, opacity: 0.5, dashArray: '12,8' });
      cityLine.addTo(pageMapInstance);
      pageMapLayers.push(cityLine);
      tripPlan.cities.forEach((c, ci) => {
        const center = CITY_CENTERS[c.city];
        if (center) {
          const cityIcon = L.divIcon({
            className: 'custom-marker',
            html: '<div class="city-marker" style="animation-delay:' + (ci * 100) + 'ms">' + c.city + (c.days ? ' · '+c.days+'天' : '') + '</div>',
            iconSize: [100, 28], iconAnchor: [50, 14],
          });
          const [cityLat, cityLng] = toTileCoords(center[0], center[1]);
          const cityMarker = L.marker([cityLat, cityLng], { icon: cityIcon, interactive: true }).addTo(pageMapInstance);
          pageMapLayers.push(cityMarker);
          allCoords.push([cityLat, cityLng]);
        }
      });
    }
  }

  dayLoop: for (let dayIdx = 0; dayIdx < totalDays; dayIdx++) {
    if (_animAbort) break dayLoop;
    const day = tripPlan.days[dayIdx];
    const dayCity = day.city || tripPlan.city;
    const dayAttrItems = [];
    const attrOffset = dayAttrOffsets[dayIdx]; // 当前天的序号偏移

    // 每天开始时显示日期过渡标签
    if (dayIdx > 0) {
      await delay(dayTransitionDelay);
    }
    // 在地图上显示日期标签
    if (dayAttrItems.length === 0 && day.attractions?.length > 0) {
      const firstAttr = day.attractions[0];
      if (firstAttr.location?.latitude && firstAttr.location?.longitude) {
        const [labelLat, labelLng] = toTileCoords(firstAttr.location.latitude, firstAttr.location.longitude);
        const dayLabelIcon = L.divIcon({
          className: 'custom-marker',
          html: `<div class="day-transition-label">第 ${dayIdx + 1} 天 · ${dayCity}</div>`,
          iconSize: [120, 30], iconAnchor: [60, 15],
        });
        const dayLabelMarker = L.marker([labelLat, labelLng], { icon: dayLabelIcon, interactive: false, zIndexOffset: 1000 }).addTo(pageMapInstance);
        pageMapLayers.push(dayLabelMarker);
        // 1.5秒后移除标签
        setTimeout(() => {
          if (pageMapInstance) pageMapInstance.removeLayer(dayLabelMarker);
        }, 1500);
      }
    }

    // ── 景点 markers ────────────────────────────────────
    for (let attrIdx = 0; attrIdx < (day.attractions || []).length; attrIdx++) {
      if (_animAbort) break dayLoop;
      const attr = day.attractions[attrIdx];
      const loc = attr.location;
      const globalSeqNum = attrOffset + attrIdx + 1; // 全局连续序号

      if (loc && loc.latitude && loc.longitude && (loc.latitude !== 0 || loc.longitude !== 0)) {
        const icon = L.divIcon({
          className: 'custom-marker',
          html: '<div class="attraction-marker anim-highlight" data-day="' + (dayIdx + 1) + '">' + globalSeqNum + '</div>',
          iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -20],
        });
        const popupHtml = '<div class="map-popup">' +
          '<div class="popup-title">' + (attr.nameZh || attr.name || '景点') + '</div>' +
          (attr.description ? '<div class="popup-desc">' + attr.description + '</div>' : '') +
          (attr.images && attr.images.length > 0 ? '<div style="margin-top:4px"><img src="' + attr.images[0].url + '" style="width:100%;border-radius:6px;max-height:120px;object-fit:cover" loading="lazy"></div>' : '') +
          '<div class="popup-city">📍 ' + (attr.address || dayCity) + '</div>' +
          '<div class="popup-meta">' +
          (attr.visitDuration ? '<span>⏱ ' + attr.visitDuration + '分钟</span>' : '') +
          (attr.ticketPrice !== undefined ? '<span>🎫 ' + (attr.ticketPrice > 0 ? '¥' + attr.ticketPrice : '免费') + '</span>' : '') +
          '</div>' +
          (attr.tips ? '<div class="popup-tips">💡 ' + attr.tips + '</div>' : '') +
          '</div>';
        const attrName = attr.nameZh || attr.name || '景点';
        const [markerLat2, markerLng2] = toTileCoords(loc.latitude, loc.longitude);
        const marker = L.marker([markerLat2, markerLng2], { icon, interactive: true }).bindPopup(popupHtml, { maxWidth: 280 });
        marker.addTo(pageMapInstance);
        marker.on('click', () => scrollChatToAttraction(attrName));
        pageMapLayers.push(marker);
        allCoords.push([markerLat2, markerLng2]);
        markerCount++;

        // 平滑平移到新景点 + 自动弹窗
        pageMapInstance.panTo([markerLat2, markerLng2], { animate: true, duration: 0.5 });
        if (totalDays <= 5) {
          // 短行程：自动弹出景点信息卡（2秒后自动关闭）
          setTimeout(() => { marker.openPopup(); }, 300);
          setTimeout(() => { if (marker.isPopupOpen()) marker.closePopup(); }, 2300);
        }
        await delay(attrDelay);
      }

      dayAttrItems.push({ name: attr.nameZh || attr.name, duration: attr.visitDuration, lat: loc?.latitude, lng: loc?.longitude });

      // ── 路线 polyline + waypoints ────────────────────────
      if (attr.routes && attr.selectedRouteId) {
        if (_animAbort) break dayLoop;
        const route = attr.routes.find(r => r.id === attr.selectedRouteId);
        if (route && route.waypoints && route.waypoints.length > 1) {
          const path = route.waypoints
            .filter(wp => wp.location && (wp.location.latitude !== 0 || wp.location.longitude !== 0))
            .map(wp => toTileCoords(wp.location.latitude, wp.location.longitude));
          if (path.length > 1) {
            const riskLevel = route.riskAssessment?.riskLevel || 1;
            const rc = RISK_COLORS[riskLevel] || RISK_COLORS[1];
            const polyline = L.polyline(path, {
              color: rc.stroke, weight: 4, opacity: 0.85,
              lineJoin: 'round', lineCap: 'round',
              dashArray: riskLevel === 3 ? '10,6' : null,
            });
            polyline._dayIdx = dayIdx; // 标记所属天数，供筛选高亮使用
            polyline.addTo(pageMapInstance);
            requestAnimationFrame(() => {
              const pathEl = polyline._path;
              if (pathEl && pathEl.getTotalLength) {
                const len = pathEl.getTotalLength();
                pathEl.style.strokeDasharray = len;
                pathEl.style.strokeDashoffset = len;
                pathEl.style.animation = 'snakeIn 1.2s ease-out forwards';
              }
            });
            pageMapLayers.push(polyline);
            routeCount++;

            // waypoint markers
            route.waypoints.forEach((wp, i) => {
              if (wp.location && (wp.location.latitude !== 0 || wp.location.longitude !== 0)) {
                const wpIcon = L.divIcon({
                  className: 'custom-marker',
                  html: '<div class="waypoint-marker"></div>',
                  iconSize: [12, 12], iconAnchor: [6, 6],
                });
                let wpPopup = '<div class="map-popup"><div class="popup-title">' + (i+1) + '. ' + wp.name + '</div>';
                if (wp.elevation) wpPopup += '<div class="popup-meta"><span>⛰ ' + wp.elevation + 'm</span></div>';
                if (wp.visitDuration) wpPopup += '<div class="popup-meta"><span>⏱ ' + wp.visitDuration + '分钟</span></div>';

                if (wp.supplyPoints?.length) {
                  wpPopup += '<div class="popup-supply-list"><b>🍴 补给:</b>';
                  for (const sp of wp.supplyPoints) {
                    if (!sp.location) continue;
                    const cost = sp.estimatedCost > 0 ? '¥' + sp.estimatedCost : '免费';
                    wpPopup += '<div class="popup-supply-item">· ' + sp.name + ' (' + sp.type + ') ' + cost + '</div>';
                    const color = SUPPLY_COLORS[sp.type] || '#6b7280';
                    const accuracy = sp.locationAccuracy || 'unknown';
                    if (accuracy === 'unknown') continue;
                    const spIcon = L.divIcon({
                      className: 'custom-marker',
                      html: '<div class="supply-marker" style="width:12px;height:12px;border-radius:50%;background:' + color + ';border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>',
                      iconSize: [12, 12], iconAnchor: [6, 6],
                    });
                    const [spLat, spLng] = toTileCoords(sp.location.latitude, sp.location.longitude);
                    const spMarker = L.marker([spLat, spLng], { icon: spIcon, interactive: true })
                      .bindPopup('<div class="map-popup"><div class="popup-title">' + sp.name + '</div><div class="popup-meta"><span>' + sp.type + '</span><span>' + (sp.estimatedCost > 0 ? '¥'+sp.estimatedCost : '免费') + '</span></div></div>', { maxWidth: 240 });
                    spMarker.addTo(pageMapInstance);
                    pageMapLayers.push(spMarker);
                    allCoords.push([spLat, spLng]);
                    supplyPointCount++;
                  }
                  wpPopup += '</div>';
                }

                if (route.riskAssessment) {
                  const ra = route.riskAssessment;
                  const bs = 'background:' + rc.bg + ';color:' + rc.stroke;
                  wpPopup += '<div class="popup-route-info"><span class="risk-badge" style="' + bs + '">' + rc.label2 + '</span>';
                  if (ra.maxElevation > 0) wpPopup += ' <span style="font-size:12px;color:#888">最高 ' + ra.maxElevation + 'm</span>';
                  wpPopup += '</div>';
                }
                wpPopup += '</div>';
                const [wpLat, wpLng] = toTileCoords(wp.location.latitude, wp.location.longitude);
                const wpMarker = L.marker([wpLat, wpLng], { icon: wpIcon, interactive: true }).bindPopup(wpPopup, { maxWidth: 280 });
                wpMarker.addTo(pageMapInstance);
                pageMapLayers.push(wpMarker);
                allCoords.push([wpLat, wpLng]);
              }
            });

            await delay(routeDelay);
          }
        }
      }
    }

    // ── 餐厅 markers ─────────────────────────────────────
    let restaurantCount = 0;
    for (const meal of (day.meals || [])) {
      if (_animAbort) break dayLoop;
      const r = meal.restaurant;
      if (r && r.location && r.location.latitude && r.location.longitude) {
        const rIcon = L.divIcon({
          className: 'custom-marker',
          html: '<div class="restaurant-marker">🍴</div>',
          iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -16],
        });
        const rPopup = '<div class="map-popup">' +
          '<div class="popup-title">' + r.name + '</div>' +
          '<div class="popup-meta">' +
          (r.rating ? '<span>⭐ ' + r.rating + '</span>' : '') +
          (r.averageCost ? '<span>¥' + r.averageCost + '/人</span>' : '') +
          (r.cuisine ? '<span>' + r.cuisine + '</span>' : '') +
          '</div>' +
          (r.address ? '<div class="popup-city">📍 ' + r.address + '</div>' : '') +
          (r.signature ? '<div class="popup-tips">🍽️ 招牌：' + r.signature + '</div>' : '') +
          '</div>';
        const [rLat2, rLng2] = toTileCoords(r.location.latitude, r.location.longitude);
        const rMarker = L.marker([rLat2, rLng2], { icon: rIcon, interactive: true }).bindPopup(rPopup, { maxWidth: 260 });
        rMarker.addTo(pageMapInstance);
        pageMapLayers.push(rMarker);
        allCoords.push([rLat2, rLng2]);
        restaurantCount++;
        await delay(restDelay);
      }
    }

    const dayMeals = (day.meals || []).map(m => ({
      type: m.type, name: m.name, description: m.description,
      estimatedCost: m.estimatedCost, restaurant: m.restaurant,
    }));
    routePanelData.push(buildRoutePanelDayData(day, dayIdx, tripPlan, dayAttrItems, dayMeals));

    // ── 酒店 marker（动画模式）──
    const hotelLoc = day.hotel?.location;
    if (hotelLoc?.latitude && hotelLoc.longitude && (hotelLoc.latitude !== 0 || hotelLoc.longitude !== 0) && !_animAbort) {
      const hIcon = L.divIcon({
        className: 'custom-marker',
        html: '<div class="hotel-marker anim-highlight">🏨</div>',
        iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -16],
      });
      const hPopup = '<div class="popup-card">' +
        '<div class="popup-title">🏨 ' + (day.hotel.name || '住宿') + '</div>' +
        (day.hotel.address ? '<div class="popup-city">📍 ' + day.hotel.address + '</div>' : '') +
        (day.hotel.priceRange ? '<div class="popup-tips">💰 ' + day.hotel.priceRange + '</div>' : '') +
        '</div>';
      const [hLat2, hLng2] = toTileCoords(hotelLoc.latitude, hotelLoc.longitude);
      const hMarker = L.marker([hLat2, hLng2], { icon: hIcon, interactive: true }).bindPopup(hPopup, { maxWidth: 260 });
      hMarker.addTo(pageMapInstance);
      pageMapLayers.push(hMarker);
      allCoords.push([hLat2, hLng2]);
      await delay(attrDelay);
    }

    // ── 绘制路线（动画模式）──
    const routePoints = routePlanner.planDayRoutes(day);
    if (routePoints.length >= 2 && !_animAbort) {
      const interRoutes = await drawInterAttractionRoutes(routePoints, 'walking', dayIdx, 0);
      routeCount += interRoutes;
      await delay(routeDelay);
    }
  }

  // ── 动画结束标记（正常结束或被跳过都会走到这里）───────
  _animRunning = false;

  // ── 最终 fitBounds ─────────────────────────────────────
  if (allCoords.length > 0) {
    pageMapInstance.fitBounds(allCoords, { padding: [60, 60], maxZoom: 14 });
  } else {
    const fbCenter = CITY_CENTERS[tripPlan.city || '上海'] || [31.23, 121.47];
    const [fbLat, fbLng] = toTileCoords(fbCenter[0], fbCenter[1]);
    pageMapInstance.setView([fbLat, fbLng], 12);
  }

  // ── 状态栏 & 路线面板 ──────────────────────────────────
  const statusBar = document.getElementById('page-map-statusbar');
  if (statusBar) statusBar.classList.add('show');
  const sa = document.getElementById('status-attractions');
  if (sa) sa.innerHTML = '📍 <span class="dot-label">景点</span> ' + markerCount;
  const sr = document.getElementById('status-routes');
  if (sr) sr.innerHTML = '🛤️ <span class="dot-label">路线</span> ' + routeCount;
  const ss = document.getElementById('status-supplies');
  if (ss) ss.innerHTML = '🍴 <span class="dot-label">补给</span> ' + supplyPointCount;
  const sd = document.getElementById('status-days');
  if (sd) sd.innerHTML = '📅 <span class="dot-label">天数</span> ' + (tripPlan.days?.length||0);
  if (markerCount > 0) document.getElementById('page-map-legend')?.classList.add('show');
  renderRoutePanel(routePanelData);
  renderDayFilters(tripPlan); // 渲染天数筛选按钮

  // 坐标完整性检查：有景点但 0 marker → 提示用户数据不完整
  const totalAttractions = tripPlan.days?.reduce((sum, d) => sum + (d.attractions?.length || 0), 0) || 0;
  if (markerCount === 0 && totalAttractions > 0) {
    showToast('行程数据不完整：' + totalAttractions + ' 个景点缺少坐标，建议重新生成行程', 6000, 'warning');
  }
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Tool 级增量渲染 API（A2）────────────────────────────
let _previewLayers = []; // 半透明预览图层

/** 添加半透明景点预览 marker（tool 返回后立即显示） */
export function addAttractionPreview(attractions, city) {
  if (!pageMapInstance || !attractions) return;
  for (const attr of attractions) {
    const loc = attr.location;
    if (!loc || !loc.latitude || !loc.longitude) continue;
    const icon = L.divIcon({
      className: 'custom-marker',
      html: '<div class="attraction-marker" style="opacity:0.5;animation:markerPopIn 0.35s cubic-bezier(0.34,1.56,0.64,1) both;"></div>',
      iconSize: [32, 32], iconAnchor: [16, 16],
    });
    const [searchLat, searchLng] = toTileCoords(loc.latitude, loc.longitude);
    const marker = L.marker([searchLat, searchLng], { icon, interactive: true }).addTo(pageMapInstance);
    pageMapLayers.push(marker);
    _previewLayers.push(marker);
  }
}
window._addAttractionPreview = addAttractionPreview;

/** 将半透明预览 marker 变实 */
export function confirmPreviewMarkers() {
  for (const marker of _previewLayers) {
    const el = marker.getElement?.()?.querySelector('.attraction-marker');
    if (el) el.style.opacity = '1';
  }
  _previewLayers = [];
}
window._confirmPreviewMarkers = confirmPreviewMarkers;

/** 添加天气图标覆盖层 */
export function addWeatherOverlay(weatherInfo) {
  if (!pageMapInstance || !Array.isArray(weatherInfo)) return;
  const weatherIcons = { '晴': '\u2600\ufe0f', '多云': '\u26c5', '阴': '\u2601\ufe0f', '小雨': '\ud83c\udf27\ufe0f', '中雨': '\ud83c\udf27\ufe0f', '大雨': '\ud83c\udf27\ufe0f', '雪': '\u2744\ufe0f', '雾': '\ud83c\udf2b\ufe0f' };
  const firstForecastByCity = new Map();
  for (const forecast of weatherInfo) {
    if (forecast?.city && !firstForecastByCity.has(forecast.city)) firstForecastByCity.set(forecast.city, forecast);
  }
  for (const w of firstForecastByCity.values()) {
    if (!w.dayWeather) continue;
    const center = CITY_CENTERS[w.city];
    if (!center) continue;
    const temperature = Number(w.dayTemp);
    if (!Number.isFinite(temperature)) continue;
    const icon = L.divIcon({
      className: 'weather-overlay',
      html: '<div class="weather-badge">' + (weatherIcons[w.dayWeather] || '\ud83c\udf24\ufe0f') + ' ' + temperature + '\u00b0</div>',
      iconSize: [80, 28], iconAnchor: [40, 14],
    });
    const [weatherLat, weatherLng] = toTileCoords(center[0], center[1]);
    const marker = L.marker([weatherLat, weatherLng], { icon, interactive: false, zIndexOffset: -100 }).addTo(pageMapInstance);
    pageMapLayers.push(marker);
  }
}
window._addWeatherOverlay = addWeatherOverlay;

// ─── 流式文本实时渲染（A4 增强版）─────────────────────────
let _ghostLayers = []; // 幽灵 marker
let _pendingGeocodes = new Map(); // 待地理编码的地点

/** 添加幽灵 marker（从流式文本解析出的景点） */
export function addGhostMarker(name, lat, lng) {
  if (!pageMapInstance) return;
  const icon = L.divIcon({
    className: 'ghost-marker-container',
    html: '<div class="ghost-marker"><div class="ghost-pulse"></div></div>',
    iconSize: [24, 24], iconAnchor: [12, 12],
  });
  const [ghostLat, ghostLng] = toTileCoords(lat, lng);
  const marker = L.marker([ghostLat, ghostLng], { icon, interactive: false, zIndexOffset: 500 }).addTo(pageMapInstance);
  pageMapLayers.push(marker);
  _ghostLayers.push({ marker, name, lat, lng });
}
window._addGhostMarker = addGhostMarker;

/** 添加带标签的幽灵 marker（新发现的地点） */
function addLabeledGhostMarker(name, lat, lng, city) {
  if (!pageMapInstance) return;
  const icon = L.divIcon({
    className: 'ghost-marker-container',
    html: `<div class="ghost-marker-labeled"><div class="ghost-pulse"></div><div class="ghost-label">${name}</div></div>`,
    iconSize: [100, 40], iconAnchor: [50, 20],
  });
  const [ghostLat2, ghostLng2] = toTileCoords(lat, lng);
  const marker = L.marker([ghostLat2, ghostLng2], { icon, interactive: true, zIndexOffset: 500 })
    .bindPopup(`<div class="map-popup"><div class="popup-title">${name}</div><div class="popup-city">📍 ${city || 'AI推荐地点'}</div></div>`, { maxWidth: 200 })
    .addTo(pageMapInstance);
  pageMapLayers.push(marker);
  _ghostLayers.push({ marker, name, lat, lng, isNew: true });

  // 自动平移到新发现的地点
  pageMapInstance.panTo([ghostLat2, ghostLng2], { animate: true, duration: 0.5 });
}

/** 清除所有幽灵 marker */
export function clearGhostMarkers() {
  for (const g of _ghostLayers) {
    pageMapInstance?.removeLayer(g.marker);
  }
  _ghostLayers = [];
}
window._clearGhostMarkers = clearGhostMarkers;

/** 异步地理编码并添加标记（防抖处理） */
async function geocodeAndMark(name, city) {
  const key = `${city}:${name}`;
  if (_pendingGeocodes.has(key)) return;
  _pendingGeocodes.set(key, true);

  try {
    const geoKey = getAmapGeoKey();
    if (!geoKey) return;

    // 尝试地理编码
    const url = `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(name)}&city=${encodeURIComponent(city || '')}&key=${geoKey}&output=json`;
    const resp = await fetchWithTimeout(url, {}, 3000);
    const data = await resp.json();

    if (data.status === '1' && data.geocodes?.length > 0) {
      const [lng, lat] = data.geocodes[0].location.split(',').map(Number);
      // 直接使用 GCJ-02 坐标
      addLabeledGhostMarker(name, lat, lng, city);
    }
  } catch (e) {
    // 静默失败，不打扰用户
    console.debug('[Map] 流式地理编码失败:', name, e.message);
  } finally {
    _pendingGeocodes.delete(key);
  }
}

// ─── 流式文本解析器（A4 增强版）───────────────────────────
const _parsedAttractionNames = new Set();
const _geocodeDebounce = new Map(); // 防抖定时器

/** 从流式文本中提取景点名，匹配已知坐标后添加幽灵 marker */
export function streamingMapParser(textChunk) {
  // 1. 从已有行程数据中构建景点名→坐标映射
  const nameToCoord = {};
  const knownCities = new Set();
  if (window._lastTripPlan?.days) {
    for (const day of window._lastTripPlan.days) {
      if (day.city) knownCities.add(day.city);
      for (const attr of day.attractions) {
        if (attr.location?.latitude) {
          const names = [attr.nameZh, attr.name, attr.nameEn].filter(Boolean);
          for (const n of names) nameToCoord[n] = attr.location;
        }
      }
    }
  }
  // 获取当前城市（用于新地点地理编码）
  const currentCity = window._lastTripPlan?.city || [...knownCities][0] || '';

  // 2. 用《》标记和常见模式匹配景点名
  const patterns = [
    /《([^》]{2,20})》/g,
    /(?:前往|游览|参观|拜访|打卡|去|到)\s*([\u4e00-\u9fa5]{2,10})(?:景区|公园|寺庙|博物馆|故居|楼|塔|湖|山|寺|园|城|街|桥|广场|古镇|古村|老街|步行街|夜市|海滩|湾|岛|洞|峡谷|瀑布|温泉|度假区|纪念馆|美术馆|科技馆|动物园|植物园|海洋馆|游乐场|城堡|宫殿|教堂|清真寺|塔|碑|陵|墓|阁|亭|台|榭|廊|舫|斋|轩|馆|院|府|衙|关|隘|寨|营|堡|驿|站|码头|港口|机场|车站)/g,
    /(?:推荐|建议|可以去|值得去|必去|必游|必看)\s*(?:的?\s*)?([\u4e00-\u9fa5]{2,10})/g,
  ];

  for (const pat of patterns) {
    let match;
    while ((match = pat.exec(textChunk)) !== null) {
      const name = match[1]?.trim();
      if (!name || name.length < 2 || _parsedAttractionNames.has(name)) continue;
      _parsedAttractionNames.add(name);

      // 先查已知坐标
      const loc = nameToCoord[name];
      if (loc) {
        addGhostMarker(name, loc.latitude, loc.longitude);
      } else {
        // 新地点：异步地理编码（防抖 500ms）
        const debounceKey = `${currentCity}:${name}`;
        if (_geocodeDebounce.has(debounceKey)) {
          clearTimeout(_geocodeDebounce.get(debounceKey));
        }
        _geocodeDebounce.set(debounceKey, setTimeout(() => {
          geocodeAndMark(name, currentCity);
          _geocodeDebounce.delete(debounceKey);
        }, 500));
      }
    }
  }

  // 3. 检查纯景点名匹配（已知景点）
  for (const name of Object.keys(nameToCoord)) {
    if (textChunk.includes(name) && !_parsedAttractionNames.has(name)) {
      _parsedAttractionNames.add(name);
      addGhostMarker(name, nameToCoord[name].latitude, nameToCoord[name].longitude);
    }
  }

  // 4. 提取带编号的景点列表（如 "1. 西湖 2. 灵隐寺"）
  const listPattern = /(?:^|\n)\s*(?:\d+[.、)]\s*|[-•]\s*)([\u4e00-\u9fa5]{2,10})/gm;
  let listMatch;
  while ((listMatch = listPattern.exec(textChunk)) !== null) {
    const name = listMatch[1]?.trim();
    if (!name || name.length < 2 || _parsedAttractionNames.has(name)) continue;
    _parsedAttractionNames.add(name);

    const loc = nameToCoord[name];
    if (loc) {
      addGhostMarker(name, loc.latitude, loc.longitude);
    } else {
      const debounceKey = `${currentCity}:${name}`;
      if (_geocodeDebounce.has(debounceKey)) {
        clearTimeout(_geocodeDebounce.get(debounceKey));
      }
      _geocodeDebounce.set(debounceKey, setTimeout(() => {
        geocodeAndMark(name, currentCity);
        _geocodeDebounce.delete(debounceKey);
      }, 500));
    }
  }
}
window._streamingMapParser = streamingMapParser;

// turn_end 时重置解析状态
const _origConfirm = confirmPreviewMarkers;
export function resetStreamingParser() {
  _parsedAttractionNames.clear();
}
window._resetStreamingParser = resetStreamingParser;

// ─── 对话定位辅助函数 ──────────────────────────────────
function scrollChatToAttraction(name) {
  if (!name) return false;

  // 1. 尝试使用锚点系统
  const anchored = scrollToAttraction(name, { highlight: true, highlightDuration: 2000 });
  if (anchored) return true;

  // 2. Fallback: 文本匹配
  const chatBody = document.getElementById('map-chat-body');
  const messages = chatPanel?.shadowRoot?.querySelectorAll('chat-message')
                || chatBody?.querySelectorAll('chat-message')
                || document.querySelectorAll('chat-message');
  for (const msg of messages) {
    const text = msg.textContent || '';
    if (text.includes(name)) {
      msg.scrollIntoView({ behavior: 'smooth', block: 'center' });
      msg.style.transition = 'box-shadow 0.3s, background 0.3s';
      msg.style.boxShadow = 'inset 3px 0 0 var(--color-accent-primary)';
      msg.style.background = 'rgba(99,102,241,0.06)';
      setTimeout(() => {
        msg.style.boxShadow = '';
        msg.style.background = '';
      }, 2000);
      return true;
    }
  }
  return false;
}

function scrollChatToDay(dayNum) {
  const chatBody = document.getElementById('map-chat-body');
  const messages = chatPanel?.shadowRoot?.querySelectorAll('chat-message')
                || chatBody?.querySelectorAll('chat-message')
                || document.querySelectorAll('chat-message');
  const patterns = [
    new RegExp('第\\s*' + dayNum + '\\s*天'),
    new RegExp('Day\\s*' + dayNum + '\\b', 'i'),
    new RegExp('\\b' + dayNum + '\\s*日'),
  ];
  for (const msg of messages) {
    const text = msg.textContent || '';
    if (patterns.some(p => p.test(text))) {
      msg.scrollIntoView({ behavior: 'smooth', block: 'start' });
      msg.style.transition = 'box-shadow 0.3s, background 0.3s';
      msg.style.boxShadow = 'inset 3px 0 0 var(--color-accent-primary)';
      msg.style.background = 'rgba(99,102,241,0.06)';
      setTimeout(() => {
        msg.style.boxShadow = '';
        msg.style.background = '';
      }, 2000);
      return true;
    }
  }
  return false;
}

// ─── 天数筛选按钮 ────────────────────────────────────────
const DAY_COLORS = [
  '#e4e4e7', // 0 = 全部
  '#3b82f6', // 第1天
  '#8b5cf6', // 第2天
  '#ec4899', // 第3天
  '#f97316', // 第4天
  '#14b8a6', // 第5天
  '#6366f1', // 第6天
  '#ef4444', // 第7天
  '#10b981', // 第8-10天
];

let _activeDayFilter = 0; // 0 = 全部

/**
 * 渲染天数筛选按钮
 * @param {object} tripPlan - 行程数据
 */
function renderDayFilters(tripPlan) {
  const container = document.getElementById('page-map-day-filters');
  if (!container || !tripPlan?.days) return;

  const totalDays = tripPlan.days.length;
  if (totalDays <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = '<button class="day-filter-btn active" data-day="0">全部</button>';
  for (let i = 1; i <= totalDays; i++) {
    const colorIdx = i <= 7 ? i : 8;
    html += `<button class="day-filter-btn" data-day="${i}" style="--day-color: ${DAY_COLORS[colorIdx]}">第${i}天</button>`;
  }
  container.innerHTML = html;

  // 绑定点击事件
  container.querySelectorAll('.day-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const day = parseInt(btn.dataset.day);
      setDayFilter(day);
    });
  });

  // 恢复之前的激活状态
  if (_activeDayFilter > 0 && _activeDayFilter <= totalDays) {
    setDayFilter(_activeDayFilter);
  } else {
    _activeDayFilter = 0;
  }
}

/**
 * 设置天数筛选
 * @param {number} day - 天数（0=全部）
 */
function setDayFilter(day) {
  _activeDayFilter = day;

  // 更新按钮状态
  const container = document.getElementById('page-map-day-filters');
  if (container) {
    container.querySelectorAll('.day-filter-btn').forEach(btn => {
      const btnDay = parseInt(btn.dataset.day);
      btn.classList.toggle('active', btnDay === day);
    });
  }

  // 更新景点标记高亮状态
  document.querySelectorAll('.attraction-marker').forEach(marker => {
    const markerDay = parseInt(marker.dataset.day || '0');
    if (day === 0) {
      // 全部显示
      marker.classList.remove('dimmed');
    } else {
      // 高亮选中天数，淡化其他
      marker.classList.toggle('dimmed', markerDay !== day);
    }
  });

  // 高亮对应的路线
  document.querySelectorAll('.leaflet-interactive').forEach(el => {
    if (el._dayIdx !== undefined) {
      if (day === 0) {
        el.setStyle({ opacity: 0.7 });
      } else {
        el.setStyle({ opacity: el._dayIdx === day - 1 ? 0.9 : 0.15 });
      }
    }
  });
}

function weatherIcon(condition) {
  const value = typeof condition === 'string' ? condition.toLowerCase() : '';
  if (/雷|thunder|hail|冰雹/.test(value)) return '⛈️';
  if (/雪|snow/.test(value)) return '❄️';
  if (/雨|rain|shower|drizzle/.test(value)) return '🌧️';
  if (/雾|fog|mist/.test(value)) return '🌫️';
  if (/晴|clear|sun/.test(value)) return '☀️';
  if (/云|阴|cloud|overcast/.test(value)) return '☁️';
  return '🌤️';
}

function finiteWeatherNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatLocalizedTemplate(template, values) {
  return Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, String(value)), template);
}

function renderWeatherBlock(day, dict) {
  const weather = day.weather;
  const impact = day.weatherRisk;
  if (!weather) return '';
  if (impact?.level === 'unknown') {
    return '<div class="route-day-weather-block"><div class="route-day-weather route-day-weather-unavailable">' + escapeHtml(dict.weatherUnavailable) + '</div></div>';
  }

  const condition = typeof weather.dayWeather === 'string' ? weather.dayWeather.trim() : '';
  const high = finiteWeatherNumber(weather.dayTemp);
  const low = finiteWeatherNumber(weather.nightTemp);
  const precipitation = finiteWeatherNumber(weather.precipitationProbability);
  const temperature = high !== null && low !== null
    ? `${low}–${high}°C`
    : high !== null ? `${high}°C` : low !== null ? `${low}°C` : '';
  const windDirection = typeof weather.windDirection === 'string' ? weather.windDirection.trim() : '';
  const windPower = typeof weather.windPower === 'string' && !/^0(?:\D|$)/.test(weather.windPower.trim()) ? weather.windPower.trim() : '';
  const wind = [windDirection, windPower].filter(Boolean).join(' ');
  const summaryParts = [condition, temperature];
  if (precipitation !== null && precipitation >= 0 && precipitation <= 100) {
    summaryParts.push(`${dict.weatherPrecipitation} ${precipitation}%`);
  }
  if (wind) summaryParts.push(wind);
  const safeSummary = summaryParts.filter(Boolean);
  if (safeSummary.length === 0) {
    return '<div class="route-day-weather-block"><div class="route-day-weather route-day-weather-unavailable">' + escapeHtml(dict.weatherUnavailable) + '</div></div>';
  }

  const advice = Array.isArray(impact?.advice)
    ? impact.advice.map(key => dict[key]).filter(Boolean)
    : [];
  const reasons = Array.isArray(impact?.reasons)
    ? impact.reasons.map(key => dict[key]).filter(Boolean)
    : [];
  const riskKey = impact?.level === 'high' ? 'weatherRiskHigh' : impact?.level === 'medium' ? 'weatherRiskMedium' : '';
  const risk = riskKey
    ? '<span class="route-weather-risk route-weather-risk-' + impact.level + '">' + escapeHtml(dict[riskKey]) + '</span>'
    : '';
  const adviceText = advice.length > 0
    ? '<span class="route-weather-advice-text">' + escapeHtml(advice.join('；')) + '</span>'
    : '';
  const reasonText = reasons.length > 0
    ? '<span class="route-weather-reason-text">' + escapeHtml(reasons.join('、')) + '</span>'
    : '';
  const radarAria = formatLocalizedTemplate(dict.weatherRadarAria, { day: day.dayNum, city: day.city });
  const radar = day.radarUrl
    ? '<a class="route-weather-radar-link" href="' + escapeHtml(day.radarUrl) + '" target="_blank" rel="noopener noreferrer" aria-label="' + escapeHtml(radarAria) + '">' + escapeHtml(dict.weatherRadarLink) + '</a>'
    : '';
  const impactRow = risk || reasonText || adviceText || radar
    ? '<div class="route-day-weather-advice">' + risk + reasonText + adviceText + radar + '</div>'
    : '';
  return '<div class="route-day-weather-block"><div class="route-day-weather">' + weatherIcon(condition) + ' ' + escapeHtml(safeSummary.join(' · ')) + '</div>' + impactRow + '</div>';
}

function renderRoutePanel(data) {
  const body = document.getElementById('route-panel-body');
  if (!body) return;
  _routePanelData = Array.isArray(data) ? data : [];
  const dict = I18N[currentLang] || I18N.zh;
  body.innerHTML = data.map(day => '<div class="route-day-group">' +
    '<div class="route-day-label" data-day="' + day.dayNum + '">Day ' + day.dayNum + ' · ' + escapeHtml(day.city) + '</div>' +
    renderWeatherBlock(day, dict) +
    day.attractions.map(attr => '<div class="route-attr-item" data-lat="' + (attr.lat||'') + '" data-lng="' + (attr.lng||'') + '" data-name="' + escapeHtml(attr.name||'') + '">' +
      '<span class="attr-dot"></span><span>' + escapeHtml(attr.name) + '</span>' +
      (attr.duration ? '<span class="attr-duration">' + attr.duration + 'min</span>' : '') +
    '</div>').join('') +
    (day.meals && day.meals.length > 0 ? '<div class="route-meals-group">' + day.meals.map(meal => {
      const r = meal.restaurant;
      if (r) {
        return '<div class="route-meal-item" data-lat="' + (r.location?.latitude||'') + '" data-lng="' + (r.location?.longitude||'') + '" data-name="' + escapeHtml(r.name||'') + '">' +
          '<span class="meal-icon">' + (meal.type === 'breakfast' ? '🍳' : meal.type === 'lunch' ? '🍜' : meal.type === 'dinner' ? '🍽️' : '🧋') + '</span>' +
          '<span class="meal-name">' + escapeHtml(r.name) + '</span>' +
          (r.rating ? '<span class="meal-rating">⭐ ' + r.rating + '</span>' : '') +
          (r.averageCost ? '<span class="meal-cost">¥' + r.averageCost + '/人</span>' : '') +
          (r.walkMinutes ? '<span class="meal-walk">🚶 ' + r.walkMinutes + 'min</span>' : '') +
        '</div>';
      }
      return '<div class="route-meal-item plain">' +
        '<span class="meal-icon">' + (meal.type === 'breakfast' ? '🍳' : meal.type === 'lunch' ? '🍜' : meal.type === 'dinner' ? '🍽️' : '🧋') + '</span>' +
        '<span class="meal-name">' + escapeHtml(meal.name) + '</span>' +
      '</div>';
    }).join('') + '</div>' : '') +
  '</div>').join('');

  // Day 标题点击 → 对话定位到对应天
  body.querySelectorAll('.route-day-label').forEach(label => {
    label.style.cursor = 'pointer';
    label.addEventListener('click', () => {
      const dayNum = parseInt(label.dataset.day, 10);
      scrollChatToDay(dayNum);
    });
  });

  body.querySelectorAll('.route-weather-radar-link').forEach(link => {
    link.addEventListener('click', event => event.stopPropagation());
  });

  body.querySelectorAll('.route-attr-item, .route-meal-item').forEach(item => {
    item.addEventListener('click', () => {
      const rawLat = parseFloat(item.dataset.lat);
      const rawLng = parseFloat(item.dataset.lng);
      const name = item.dataset.name;
      if (rawLat && rawLng && pageMapInstance) {
        const [viewLat, viewLng] = toTileCoords(rawLat, rawLng);
        pageMapInstance.setView([viewLat, viewLng], 16, { animate: true });
        pageMapLayers.forEach(layer => {
          if (layer.getLatLng) {
            const pos = layer.getLatLng();
            if (Math.abs(pos.lat - viewLat) < 0.0001 && Math.abs(pos.lng - viewLng) < 0.0001) layer.openPopup();
          }
        });
      }
      if (name) scrollChatToAttraction(name);
    });
  });
}

document.addEventListener('travelmap-language-changed', () => {
  if (_routePanelData.length > 0) renderRoutePanel(_routePanelData);
});
// force redeploy 2026年 05月 25日 星期一 16:04:15 CST
