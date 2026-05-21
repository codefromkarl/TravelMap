import { showToast, getAmapKey, getAmapGeoKey, SUPPLY_COLORS, CITY_CENTERS, RISK_COLORS, isDomesticCityForMap, chatPanel, currentLang } from './context.js';
import { I18N } from './i18n.js';
import { loadSupplyPointsFromCache, saveSupplyPointsToCache } from './db.js';

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
function gcj02ToWgs84(lat, lng) {
  if (_outOfChina(lat, lng)) return { lat, lng };
  const d = wgs84ToGcj02(lat, lng);
  return { lat: lat - (d.lat - lat), lng: lng - (d.lng - lng) };
}

/** fetch 带超时 */
function fetchWithTimeout(url, opts = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(id));
}

// ─── 景点坐标补全（地理编码） ────────────────────────────
// 当 tripPlan 中的景点缺少 location 时，通过高德地理编码 API 补全
const _geoCache = new Map();

/**
 * 通过高德地理编码 API 获取景点坐标
 * @param {string} name - 景点名称
 * @param {string} city - 城市名
 * @returns {{latitude:number,longitude:number}|null}
 */
async function _geocodeOne(name, city) {
  const key = `${city}:${name}`;
  if (_geoCache.has(key)) return _geoCache.get(key);

  const geoKey = getAmapGeoKey();
  if (!geoKey) { _geoCache.set(key, null); return null; }

  try {
    const url = `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(name)}&city=${encodeURIComponent(city)}&key=${geoKey}&output=json`;
    const resp = await fetchWithTimeout(url, {}, 5000);
    const data = await resp.json();
    if (data.status === '1' && data.geocodes?.length > 0) {
      const [lng, lat] = data.geocodes[0].location.split(',').map(Number);
      const result = { latitude: lat, longitude: lng };
      _geoCache.set(key, result);
      return result;
    }
  } catch (e) {
    console.warn('[Map] 地理编码失败:', name, e.message);
  }
  _geoCache.set(key, null);
  return null;
}

/**
 * 批量补全 tripPlan 中缺失坐标的景点
 * 优先用高德 API，fallback 到 CITY_CENTERS 附近随机偏移
 * @param {object} tripPlan
 * @returns {Promise<number>} 补全的景点数量
 */
async function geocodeAttractions(tripPlan) {
  if (!tripPlan?.days) return 0;

  let fixedCount = 0;
  const pending = [];

  for (const day of tripPlan.days) {
    const city = day.city || tripPlan.city || '';
    for (const attr of day.attractions || []) {
      const loc = attr.location;
      const hasValidLoc = loc && loc.latitude && loc.longitude && (loc.latitude !== 0 || loc.longitude !== 0);
      if (!hasValidLoc) {
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
      batch.map(({ attr, city }) => _geocodeOne(attr.nameZh || attr.name, city))
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
      // 高德需要 GCJ-02 坐标，Leaflet 给的是 WGS-84，必须转换
      const gcj = wgs84ToGcj02(lat, lng);
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
        geocodeAttractions(window._lastTripPlan).then(count => {
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
    geocodeAttractions(window._lastTripPlan).then(count => {
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
window._showPlanningIndicator = showPlanningIndicator;
window._hidePlanningIndicator = hidePlanningIndicator;

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
      if (w >= 280 && w <= window.innerWidth * 0.6) {
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
      const minW = 280;
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

  // ─── 地图点击 POI 反查 ─────────────────────────────────
  pageMapInstance.on('click', async (e) => {
    document.getElementById('map-layer-switcher')?.classList.remove('show');
    await _handleMapPoiClick(e, pageMapInstance);
  });

  // 快捷提示点击
  document.querySelectorAll('#map-chat-welcome .quick-prompt').forEach(el => {
    el.addEventListener('click', async () => {
      const prompt = el.dataset.prompt;
      if (!prompt) {
        showToast('提示内容为空', 2500, 'warning');
        return;
      }
      if (!chatPanel?.agentInterface) {
        showToast('聊天组件未初始化，请刷新页面', 3000, 'error');
        return;
      }

      // 1. 立即隐藏欢迎区
      const welcome = document.getElementById('map-chat-welcome');
      if (welcome) welcome.style.display = 'none';

      // 2. 在聊天面板中插入用户消息占位（即时视觉反馈）
      const chatBody = document.getElementById('map-chat-body');
      if (chatBody) {
        const userBubble = document.createElement('div');
        userBubble.className = 'quick-prompt-user-msg';
        userBubble.innerHTML = `<div class="qp-msg-content">${prompt}</div>`;
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

  // 出行人群按钮（地图页面版）
  document.getElementById('travelers-btn-map')?.addEventListener('click', () => {
    const panel = document.getElementById('travelers-panel');
    if (panel) panel.classList.toggle('open');
  });

  // 历史行程（地图页面版）
  document.getElementById('btn-history-map')?.addEventListener('click', () => {
    const panel = document.getElementById('history-panel');
    if (panel) {
      if (panel.classList.contains('open')) {
        panel.classList.remove('open');
      } else {
        panel.classList.add('open');
        if (window._renderHistory) window._renderHistory();
      }
    }
  });

  document.getElementById('btn-map-back')?.addEventListener('click', () => {});

  // 地图搜索功能（高德 POI 搜索 + Nominatim 备选）
  const searchInput = document.getElementById('map-search-input');
  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const query = searchInput.value.trim();
        if (query && pageMapInstance) {
          const geoKey = getAmapGeoKey();
          if (geoKey) {
            // 使用高德 POI 搜索（返回 GCJ-02 坐标，需转 WGS-84）
            fetchWithTimeout(`https://restapi.amap.com/v3/place/text?keywords=${encodeURIComponent(query)}&types=风景名胜|餐饮服务|住宿服务&key=${geoKey}&offset=3`, {}, 8000)
              .then(r => r.json())
              .then(data => {
                if (data.status === '1' && data.pois?.length > 0) {
                  const poi = data.pois.find(p => p.type?.includes('风景名胜')) || data.pois[0];
                  const loc = poi.location.split(',');
                  const gcjLng = parseFloat(loc[0]);
                  const gcjLat = parseFloat(loc[1]);
                  const wgs = gcj02ToWgs84(gcjLat, gcjLng);
                  pageMapInstance.setView([wgs.lat, wgs.lng], 15);
                  L.marker([wgs.lat, wgs.lng]).addTo(pageMapInstance)
                    .bindPopup(`<b>${poi.name}</b><br>${poi.address || poi.cityname || ''}`)
                    .openPopup();
                } else {
                  showToast('未找到该地点', 2500, 'warning');
                }
              })
              .catch(() => showToast('搜索失败，请稍后重试', 3000, 'error'));
          } else {
            // 无高德 Key 时使用 Nominatim
            fetchWithTimeout(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`, {}, 8000)
              .then(r => r.json())
              .then(data => {
                if (data.length > 0) {
                  const lat = parseFloat(data[0].lat);
                  const lon = parseFloat(data[0].lon);
                  pageMapInstance.setView([lat, lon], 14);
                  L.marker([lat, lon]).addTo(pageMapInstance)
                    .bindPopup(data[0].display_name || query)
                    .openPopup();
                } else {
                  showToast('未找到该地点', 2500, 'warning');
                }
              })
              .catch(() => showToast('搜索失败，请稍后重试', 3000, 'error'));
          }
        }
      }
    });
  }
}

function renderTripOnPageMap(tripPlan) {
  if (!tripPlan || !tripPlan.days || !pageMapInstance) return;
  const allCoords = [];
  let markerCount = 0, routeCount = 0, supplyPointCount = 0;
  const routePanelData = [];

  for (let dayIdx = 0; dayIdx < tripPlan.days.length; dayIdx++) {
    const day = tripPlan.days[dayIdx];
    const dayCity = day.city || tripPlan.city;
    const dayAttrItems = [];

    for (let attrIdx = 0; attrIdx < (day.attractions || []).length; attrIdx++) {
      const attr = day.attractions[attrIdx];
      const loc = attr.location;

      if (loc && loc.latitude && loc.longitude && (loc.latitude !== 0 || loc.longitude !== 0)) {
        const icon = L.divIcon({
          className: 'custom-marker',
          html: '<div class="attraction-marker" style="animation-delay:' + ((dayIdx * 4 + attrIdx) * 60) + 'ms">' + (attrIdx + 1) + '</div>',
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
        const marker = L.marker([loc.latitude, loc.longitude], { icon, interactive: true }).bindPopup(popupHtml, { maxWidth: 280 });
        marker.addTo(pageMapInstance);
        marker.on('click', () => scrollChatToAttraction(attrName));
        pageMapLayers.push(marker);
        allCoords.push([loc.latitude, loc.longitude]);
        markerCount++;
      }

      dayAttrItems.push({ name: attr.nameZh || attr.name, duration: attr.visitDuration, lat: loc?.latitude, lng: loc?.longitude });

      if (attr.routes && attr.selectedRouteId) {
        const route = attr.routes.find(r => r.id === attr.selectedRouteId);
        if (route && route.waypoints && route.waypoints.length > 1) {
          const path = route.waypoints
            .filter(wp => wp.location && (wp.location.latitude !== 0 || wp.location.longitude !== 0))
            .map(wp => [wp.location.latitude, wp.location.longitude]);
          if (path.length > 1) {
            const riskLevel = route.riskAssessment?.riskLevel || 1;
            const rc = RISK_COLORS[riskLevel] || RISK_COLORS[1];
            const polyline = L.polyline(path, {
              color: rc.stroke, weight: 4, opacity: 0.85,
              lineJoin: 'round', lineCap: 'round',
              dashArray: riskLevel === 3 ? '10,6' : null,
            });
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
                    const spMarker = L.marker([sp.location.latitude, sp.location.longitude], { icon: spIcon, interactive: true })
                      .bindPopup('<div class="map-popup"><div class="popup-title">' + sp.name + '</div><div class="popup-meta"><span>' + sp.type + '</span><span>' + (sp.estimatedCost > 0 ? '¥'+sp.estimatedCost : '免费') + '</span></div></div>', { maxWidth: 240 });
                    spMarker.addTo(pageMapInstance);
                    pageMapLayers.push(spMarker);
                    allCoords.push([sp.location.latitude, sp.location.longitude]);
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
                const wpMarker = L.marker([wp.location.latitude, wp.location.longitude], { icon: wpIcon, interactive: true }).bindPopup(wpPopup, { maxWidth: 280 });
                wpMarker.addTo(pageMapInstance);
                pageMapLayers.push(wpMarker);
                allCoords.push([wp.location.latitude, wp.location.longitude]);
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
        const rIcon = L.divIcon({
          className: 'custom-marker',
          html: '<div class="restaurant-marker" style="animation-delay:' + ((dayIdx * 4 + restaurantCount) * 60) + 'ms">🍴</div>',
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
        const rMarker = L.marker([r.location.latitude, r.location.longitude], { icon: rIcon, interactive: true }).bindPopup(rPopup, { maxWidth: 260 });
        rMarker.addTo(pageMapInstance);
        pageMapLayers.push(rMarker);
        allCoords.push([r.location.latitude, r.location.longitude]);
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
    routePanelData.push({ dayNum: dayIdx + 1, city: dayCity, attractions: dayAttrItems, meals: dayMeals });
  }

  // 城市间连线
  if (tripPlan.cities && tripPlan.cities.length > 1) {
    const cityPath = tripPlan.cities.filter(c => CITY_CENTERS[c.city]).map(c => CITY_CENTERS[c.city]);
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
          const cityMarker = L.marker(center, { icon: cityIcon, interactive: true }).addTo(pageMapInstance);
          pageMapLayers.push(cityMarker);
          allCoords.push(center);
        }
      });
    }
  }

  if (allCoords.length > 0) {
    pageMapInstance.fitBounds(allCoords, { padding: [60, 60], maxZoom: 14 });
  } else {
    const center = CITY_CENTERS[tripPlan.city || '上海'] || [31.23, 121.47];
    pageMapInstance.setView(center, 12);
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

  // 坐标完整性检查：有景点但 0 marker → 提示用户数据不完整
  const totalAttractions = tripPlan.days?.reduce((sum, d) => sum + (d.attractions?.length || 0), 0) || 0;
  if (markerCount === 0 && totalAttractions > 0) {
    showToast('行程数据不完整：' + totalAttractions + ' 个景点缺少坐标，建议重新生成行程', 6000, 'warning');
  }
}

// ─── 逐步动画渲染 ──────────────────────────────────────
let _animAbort = false; // 用于取消正在进行的动画

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

  // 清除旧图层
  for (const layer of pageMapLayers) pageMapInstance.removeLayer(layer);
  pageMapLayers = [];

  const allCoords = [];
  let markerCount = 0, routeCount = 0, supplyPointCount = 0;
  const routePanelData = [];

  // 大行程（7天+）自动压缩间隔，总时长不超过 15 秒
  const totalDays = tripPlan.days.length;
  const bigTrip = totalDays >= 7;
  const attrDelay = bigTrip ? 200 : 400;    // 景点 marker 间隔
  const routeDelay = bigTrip ? 300 : 600;    // 路线 snakeIn 延迟
  const restDelay = bigTrip ? 150 : 300;     // 餐厅 marker 间隔

  // 先渲染城市间连线（背景层）
  if (tripPlan.cities && tripPlan.cities.length > 1) {
    const cityPath = tripPlan.cities.filter(c => CITY_CENTERS[c.city]).map(c => CITY_CENTERS[c.city]);
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
          const cityMarker = L.marker(center, { icon: cityIcon, interactive: true }).addTo(pageMapInstance);
          pageMapLayers.push(cityMarker);
          allCoords.push(center);
        }
      });
    }
  }

  for (let dayIdx = 0; dayIdx < totalDays; dayIdx++) {
    if (_animAbort) return;
    const day = tripPlan.days[dayIdx];
    const dayCity = day.city || tripPlan.city;
    const dayAttrItems = [];

    // ── 景点 markers ────────────────────────────────────
    for (let attrIdx = 0; attrIdx < (day.attractions || []).length; attrIdx++) {
      if (_animAbort) return;
      const attr = day.attractions[attrIdx];
      const loc = attr.location;

      if (loc && loc.latitude && loc.longitude && (loc.latitude !== 0 || loc.longitude !== 0)) {
        const icon = L.divIcon({
          className: 'custom-marker',
          html: '<div class="attraction-marker anim-highlight">' + (attrIdx + 1) + '</div>',
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
        const marker = L.marker([loc.latitude, loc.longitude], { icon, interactive: true }).bindPopup(popupHtml, { maxWidth: 280 });
        marker.addTo(pageMapInstance);
        marker.on('click', () => scrollChatToAttraction(attrName));
        pageMapLayers.push(marker);
        allCoords.push([loc.latitude, loc.longitude]);
        markerCount++;

        // 平滑平移到新景点 + 自动弹窗
        pageMapInstance.panTo([loc.latitude, loc.longitude], { animate: true, duration: 0.5 });
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
        if (_animAbort) return;
        const route = attr.routes.find(r => r.id === attr.selectedRouteId);
        if (route && route.waypoints && route.waypoints.length > 1) {
          const path = route.waypoints
            .filter(wp => wp.location && (wp.location.latitude !== 0 || wp.location.longitude !== 0))
            .map(wp => [wp.location.latitude, wp.location.longitude]);
          if (path.length > 1) {
            const riskLevel = route.riskAssessment?.riskLevel || 1;
            const rc = RISK_COLORS[riskLevel] || RISK_COLORS[1];
            const polyline = L.polyline(path, {
              color: rc.stroke, weight: 4, opacity: 0.85,
              lineJoin: 'round', lineCap: 'round',
              dashArray: riskLevel === 3 ? '10,6' : null,
            });
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
                    const spMarker = L.marker([sp.location.latitude, sp.location.longitude], { icon: spIcon, interactive: true })
                      .bindPopup('<div class="map-popup"><div class="popup-title">' + sp.name + '</div><div class="popup-meta"><span>' + sp.type + '</span><span>' + (sp.estimatedCost > 0 ? '¥'+sp.estimatedCost : '免费') + '</span></div></div>', { maxWidth: 240 });
                    spMarker.addTo(pageMapInstance);
                    pageMapLayers.push(spMarker);
                    allCoords.push([sp.location.latitude, sp.location.longitude]);
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
                const wpMarker = L.marker([wp.location.latitude, wp.location.longitude], { icon: wpIcon, interactive: true }).bindPopup(wpPopup, { maxWidth: 280 });
                wpMarker.addTo(pageMapInstance);
                pageMapLayers.push(wpMarker);
                allCoords.push([wp.location.latitude, wp.location.longitude]);
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
      if (_animAbort) return;
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
        const rMarker = L.marker([r.location.latitude, r.location.longitude], { icon: rIcon, interactive: true }).bindPopup(rPopup, { maxWidth: 260 });
        rMarker.addTo(pageMapInstance);
        pageMapLayers.push(rMarker);
        allCoords.push([r.location.latitude, r.location.longitude]);
        restaurantCount++;
        await delay(restDelay);
      }
    }

    const dayMeals = (day.meals || []).map(m => ({
      type: m.type, name: m.name, description: m.description,
      estimatedCost: m.estimatedCost, restaurant: m.restaurant,
    }));
    routePanelData.push({ dayNum: dayIdx + 1, city: dayCity, attractions: dayAttrItems, meals: dayMeals });
  }

  // ── 最终 fitBounds ─────────────────────────────────────
  if (allCoords.length > 0) {
    pageMapInstance.fitBounds(allCoords, { padding: [60, 60], maxZoom: 14 });
  } else {
    const center = CITY_CENTERS[tripPlan.city || '上海'] || [31.23, 121.47];
    pageMapInstance.setView(center, 12);
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
    const marker = L.marker([loc.latitude, loc.longitude], { icon, interactive: true }).addTo(pageMapInstance);
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
  if (!pageMapInstance || !weatherInfo) return;
  const weatherIcons = { '晴': '\u2600\ufe0f', '多云': '\u26c5', '阴': '\u2601\ufe0f', '小雨': '\ud83c\udf27\ufe0f', '中雨': '\ud83c\udf27\ufe0f', '大雨': '\ud83c\udf27\ufe0f', '雪': '\u2744\ufe0f', '雾': '\ud83c\udf2b\ufe0f' };
  for (const w of weatherInfo) {
    if (!w.dayWeather) continue;
    const center = CITY_CENTERS[w.city];
    if (!center) continue;
    const icon = L.divIcon({
      className: 'weather-overlay',
      html: '<div class="weather-badge">' + (weatherIcons[w.dayWeather] || '\ud83c\udf24\ufe0f') + ' ' + w.dayTemp + '\u00b0</div>',
      iconSize: [80, 28], iconAnchor: [40, 14],
    });
    const marker = L.marker(center, { icon, interactive: false, zIndexOffset: -100 }).addTo(pageMapInstance);
    pageMapLayers.push(marker);
  }
}
window._addWeatherOverlay = addWeatherOverlay;

// ─── 流式文本实时渲染（A4）─────────────────────────────────
let _ghostLayers = []; // 幽灵 marker

/** 添加幽灵 marker（从流式文本解析出的景点） */
export function addGhostMarker(name, lat, lng) {
  if (!pageMapInstance) return;
  const icon = L.divIcon({
    className: 'ghost-marker-container',
    html: '<div class="ghost-marker"><div class="ghost-pulse"></div></div>',
    iconSize: [24, 24], iconAnchor: [12, 12],
  });
  const marker = L.marker([lat, lng], { icon, interactive: false, zIndexOffset: 500 }).addTo(pageMapInstance);
  pageMapLayers.push(marker);
  _ghostLayers.push({ marker, name, lat, lng });
}
window._addGhostMarker = addGhostMarker;

/** 清除所有幽灵 marker */
export function clearGhostMarkers() {
  for (const g of _ghostLayers) {
    pageMapInstance?.removeLayer(g.marker);
  }
  _ghostLayers = [];
}
window._clearGhostMarkers = clearGhostMarkers;

// ─── 流式文本解析器（A4）───────────────────────────────────
const _parsedAttractionNames = new Set();

/** 从流式文本中提取景点名，匹配已知坐标后添加幽灵 marker */
export function streamingMapParser(textChunk) {
  if (!window._lastTripPlan?.days) return;
  // 从已有行程数据中构建景点名→坐标映射
  const nameToCoord = {};
  for (const day of window._lastTripPlan.days) {
    for (const attr of day.attractions) {
      if (attr.location?.latitude) {
        const names = [attr.nameZh, attr.name, attr.nameEn].filter(Boolean);
        for (const n of names) nameToCoord[n] = attr.location;
      }
    }
  }
  // 用《》标记和常见模式匹配景点名
  const patterns = [/《([^》]{2,20})》/g, /(?:前往|游览|参观|游览)\s*([\u4e00-\u9fa5]{2,10})(?:景区|公园|寺庙|博物馆|故居|楼|塔|湖|山|寺|园|城|街|桥)/g];
  for (const pat of patterns) {
    let match;
    while ((match = pat.exec(textChunk)) !== null) {
      const name = match[1];
      if (!name || _parsedAttractionNames.has(name)) continue;
      _parsedAttractionNames.add(name);
      const loc = nameToCoord[name];
      if (loc) {
        addGhostMarker(name, loc.latitude, loc.longitude);
      }
    }
  }
  // 也检查纯景点名匹配
  for (const name of Object.keys(nameToCoord)) {
    if (textChunk.includes(name) && !_parsedAttractionNames.has(name)) {
      _parsedAttractionNames.add(name);
      addGhostMarker(name, nameToCoord[name].latitude, nameToCoord[name].longitude);
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

function renderRoutePanel(data) {
  const body = document.getElementById('route-panel-body');
  if (!body) return;
  body.innerHTML = data.map(day => '<div class="route-day-group">' +
    '<div class="route-day-label" data-day="' + day.dayNum + '">Day ' + day.dayNum + ' · ' + day.city + '</div>' +
    day.attractions.map(attr => '<div class="route-attr-item" data-lat="' + (attr.lat||'') + '" data-lng="' + (attr.lng||'') + '" data-name="' + (attr.name||'') + '">' +
      '<span class="attr-dot"></span><span>' + attr.name + '</span>' +
      (attr.duration ? '<span class="attr-duration">' + attr.duration + 'min</span>' : '') +
    '</div>').join('') +
    (day.meals && day.meals.length > 0 ? '<div class="route-meals-group">' + day.meals.map(meal => {
      const r = meal.restaurant;
      if (r) {
        return '<div class="route-meal-item" data-lat="' + (r.location?.latitude||'') + '" data-lng="' + (r.location?.longitude||'') + '" data-name="' + (r.name||'') + '">' +
          '<span class="meal-icon">' + (meal.type === 'breakfast' ? '🍳' : meal.type === 'lunch' ? '🍜' : meal.type === 'dinner' ? '🍽️' : '🧋') + '</span>' +
          '<span class="meal-name">' + r.name + '</span>' +
          (r.rating ? '<span class="meal-rating">⭐ ' + r.rating + '</span>' : '') +
          (r.averageCost ? '<span class="meal-cost">¥' + r.averageCost + '/人</span>' : '') +
          (r.walkMinutes ? '<span class="meal-walk">🚶 ' + r.walkMinutes + 'min</span>' : '') +
        '</div>';
      }
      return '<div class="route-meal-item plain">' +
        '<span class="meal-icon">' + (meal.type === 'breakfast' ? '🍳' : meal.type === 'lunch' ? '🍜' : meal.type === 'dinner' ? '🍽️' : '🧋') + '</span>' +
        '<span class="meal-name">' + meal.name + '</span>' +
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

  body.querySelectorAll('.route-attr-item, .route-meal-item').forEach(item => {
    item.addEventListener('click', () => {
      const lat = parseFloat(item.dataset.lat);
      const lng = parseFloat(item.dataset.lng);
      const name = item.dataset.name;
      if (lat && lng && pageMapInstance) {
        pageMapInstance.setView([lat, lng], 16, { animate: true });
        pageMapLayers.forEach(layer => {
          if (layer.getLatLng) {
            const pos = layer.getLatLng();
            if (Math.abs(pos.lat - lat) < 0.0001 && Math.abs(pos.lng - lng) < 0.0001) layer.openPopup();
          }
        });
      }
      if (name) scrollChatToAttraction(name);
    });
  });
}