import { showToast, getAmapKey, SUPPLY_COLORS, CITY_CENTERS, RISK_COLORS, isDomesticCityForMap, chatPanel } from './context.js';
import { I18N, currentLang } from './i18n.js';
import { loadSupplyPointsFromCache, saveSupplyPointsToCache } from './db.js';

let leafletMap = null;
let leafletLayers = [];

function clearMapLayers() {
  if (!leafletMap) return;
  for (const layer of leafletLayers) {
    leafletMap.removeLayer(layer);
  }
  leafletLayers = [];
}

// ─── 地图面板（弹窗） ──────────────────────────────────
const mapPanel = document.getElementById("map-panel");
const mapStatus = document.getElementById("map-status");

function renderTripOnMap(tripPlan) {
  if (!tripPlan || !tripPlan.days || !L) {
    if (mapStatus) mapStatus.textContent = "无法加载地图库";
    return;
  }

  const container = document.getElementById("map-container");
  if (!container) return;

  if (!leafletMap) {
    leafletMap = L.map("map-container");
    const AMAP_KEY = getAmapKey();
    const tileUrl = AMAP_KEY
      ? `https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}&key=${AMAP_KEY}`
      : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
    const tileOpts = AMAP_KEY
      ? { maxZoom: 18, subdomains: ['1','2','3','4'] }
      : { attribution: '© OpenStreetMap contributors', maxZoom: 18 };
    L.tileLayer(tileUrl, tileOpts).addTo(leafletMap);
  }
  clearMapLayers();

  const allCoords = [];
  let markerCount = 0, routeCount = 0, supplyPointCount = 0;
  const warnings = [];
  const riskSummary = [];

  for (const day of tripPlan.days) {
    const dayCity = day.city || tripPlan.city;
    for (const attr of day.attractions || []) {
      const loc = attr.location;
      if (loc && loc.latitude && loc.longitude && (loc.latitude !== 0 || loc.longitude !== 0)) {
        const popup = `<b>${attr.nameZh || attr.name || "景点"}</b><br>${dayCity}<br>建议游览 ${attr.visitDuration || "?"} 分钟`;
        const marker = L.marker([loc.latitude, loc.longitude]).bindPopup(popup);
        marker.addTo(leafletMap);
        leafletLayers.push(marker);
        allCoords.push([loc.latitude, loc.longitude]);
        markerCount++;
      }

      if (attr.routes && attr.selectedRouteId) {
        const route = attr.routes.find(r => r.id === attr.selectedRouteId);
        if (route && route.waypoints && route.waypoints.length > 1) {
          const path = route.waypoints
            .filter(wp => wp.location && (wp.location.latitude !== 0 || wp.location.longitude !== 0))
            .map(wp => [wp.location.latitude, wp.location.longitude]);
          if (path.length > 1) {
            const riskLevel = route.riskAssessment?.riskLevel || 1;
            const riskColor = RISK_COLORS[riskLevel] || RISK_COLORS[1];
            const polyline = L.polyline(path, {
              color: riskColor.stroke, weight: riskLevel === 3 ? 5 : 4,
              opacity: 0.9, lineJoin: "round",
              dashArray: riskLevel === 3 ? "8,6" : null,
            });
            polyline.addTo(leafletMap);
            leafletLayers.push(polyline);
            routeCount++;

            if (route.riskAssessment) {
              const ra = route.riskAssessment;
              const gain = ra.totalElevationGain > 0 ? ` ↑${ra.totalElevationGain}m` : "";
              const loss = ra.totalElevationLoss > 0 ? ` ↓${ra.totalElevationLoss}m` : "";
              const maxEl = ra.maxElevation > 0 ? ` 最高${ra.maxElevation}m` : "";
              riskSummary.push({
                name: attr.nameZh || attr.name, routeName: route.name, level: riskLevel,
                label: riskColor.label, gain, loss, maxEl,
                calories: ra.estimatedCalories, steps: ra.estimatedSteps,
                factors: ra.riskFactors || [], suitability: ra.suitability,
              });
            }

            if (route.supplyStrategy?.warnings?.length) {
              warnings.push(...route.supplyStrategy.warnings.map(w => `【${attr.nameZh || attr.name}】${w}`));
            }

            route.waypoints.forEach((wp, i) => {
              if (wp.location && (wp.location.latitude !== 0 || wp.location.longitude !== 0)) {
                let popupHtml = `<b>${i + 1}. ${wp.name}</b>`;
                if (wp.elevation !== undefined && wp.elevation !== 0) popupHtml += ` <span style="color:#94a3b8;font-size:12px">⛰ ${wp.elevation}m</span>`;
                popupHtml += `<br>${wp.visitDuration || ""}分钟`;
                if (wp.terrainType) {
                  const terrainLabels = { flat: "平地", slope: "缓坡", stairs: "台阶", trail: "山路", paved: "铺装", water: "水域" };
                  popupHtml += ` · ${terrainLabels[wp.terrainType] || wp.terrainType}`;
                }
                if (wp.supplyPoints && wp.supplyPoints.length > 0) {
                  popupHtml += "<br><b>🍴 补给:</b>";
                  for (const sp of wp.supplyPoints) {
                    const cost = sp.estimatedCost > 0 ? `¥${sp.estimatedCost}` : "免费";
                    popupHtml += `<br>· ${sp.name} (${sp.type}) — ${cost}`;
                  }
                }
                const dot = L.circleMarker([wp.location.latitude, wp.location.longitude], {
                  radius: 5, color: riskColor.stroke, fillColor: riskColor.fill, fillOpacity: 0.9, weight: 2
                }).bindPopup(popupHtml);
                dot.addTo(leafletMap);
                leafletLayers.push(dot);
                allCoords.push([wp.location.latitude, wp.location.longitude]);

                if (wp.supplyPoints) {
                  for (const sp of wp.supplyPoints) {
                    if (!sp.location) continue;
                    const color = SUPPLY_COLORS[sp.type] || "#6b7280";
                    const accuracy = sp.locationAccuracy || "unknown";
                    if (accuracy === "unknown") continue;
                    const opacity = accuracy === "exact" ? "1" : "0.6";
                    const borderStyle = accuracy === "exact" ? "2px solid white" : "2px dashed rgba(255,255,255,0.6)";
                    const spIcon = L.divIcon({
                      className: "supply-marker",
                      html: `<div style="width:10px;height:10px;border-radius:50%;background:${color};opacity:${opacity};border:${borderStyle};box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>`,
                      iconSize: [14, 14], iconAnchor: [7, 7],
                    });
                    const accuracyLabel = accuracy === "exact" ? "📍 精确坐标" : "📍 估算坐标";
                    const priceLabel = sp.priceConfidence === "api" ? "💰 实时价格" : "💰 估算价格";
                    const updateLabel = sp.lastUpdated ? `（${sp.lastUpdated}）` : "";
                    let staleLabel = "";
                    if (sp.lastUpdated) {
                      const days = Math.floor((Date.now() - new Date(sp.lastUpdated).getTime()) / (1000 * 60 * 60 * 24));
                      if (days > 90) staleLabel = `<br><span style="color:#f59e0b">⏰ 数据已过期（${days}天前）</span>`;
                      else if (days > 30) staleLabel = `<br><span style="color:#94a3b8">📅 ${days}天前更新</span>`;
                    }
                    const hoursLabel = sp.businessHours ? `<br>🕐 营业: ${sp.businessHours}` : "";
                    const spMarker = L.marker([sp.location.latitude, sp.location.longitude], { icon: spIcon })
                      .bindPopup(`<b>${sp.name}</b><br>类型: ${sp.type}<br>${sp.description}<br>${accuracyLabel} · ${priceLabel}${updateLabel}${staleLabel}${hoursLabel}<br>人均: ${sp.estimatedCost > 0 ? "¥" + sp.estimatedCost : "免费"}${sp.isRecommended ? "<br>⭐ 推荐休息点" : ""}`);
                    spMarker.addTo(leafletMap);
                    leafletLayers.push(spMarker);
                    allCoords.push([sp.location.latitude, sp.location.longitude]);
                    supplyPointCount++;
                  }
                }
              }
            });
          }
        }
      }
    }
  }

  if (allCoords.length > 0) {
    leafletMap.fitBounds(allCoords, { padding: [40, 40], maxZoom: 15 });
    if (mapStatus) mapStatus.textContent = `${markerCount} 个景点 · ${routeCount} 条路线${supplyPointCount > 0 ? ` · ${supplyPointCount} 个补给点` : ""}`;
  } else {
    const city = tripPlan.city || "上海";
    const center = CITY_CENTERS[city] || [31.23, 121.47];
    leafletMap.setView(center, 11);
    if (mapStatus) mapStatus.textContent = "未获取到景点坐标，显示城市中心";
  }

  // 风险摘要
  const riskEl = document.getElementById("map-risk-summary");
  if (riskEl) {
    if (riskSummary.length > 0) {
      const riskHtml = riskSummary.map(r => {
        const badgeClass = r.level === 3 ? "high" : r.level === 2 ? "medium" : "low";
        const factors = r.factors.length > 0 ? `<div class="risk-detail">⚠️ ${r.factors.map(f => f.description).join("；")}</div>` : "";
        const suit = r.suitability;
        const suitParts = [];
        if (suit?.seniors === "not_recommended") suitParts.push("老人❌");
        else if (suit?.seniors === "caution") suitParts.push("老人⚠️");
        if (suit?.children === "not_recommended") suitParts.push("儿童❌");
        else if (suit?.children === "caution") suitParts.push("儿童⚠️");
        if (suit?.pregnant === "not_recommended") suitParts.push("孕妇❌");
        else if (suit?.pregnant === "caution") suitParts.push("孕妇⚠️");
        if (suit?.mobilityImpaired === "not_recommended") suitParts.push("行动不便❌");
        else if (suit?.mobilityImpaired === "caution") suitParts.push("行动不便⚠️");
        const suitHtml = suitParts.length > 0 ? `<div class="risk-suitability">👥 不适宜人群: ${suitParts.map(s => `<span class="not-rec">${s}</span>`).join(" ")}</div>` : "";
        return `<div class="risk-item">
          <div class="risk-title"><span class="risk-badge ${badgeClass}">${r.label}</span>${r.name} · ${r.routeName}</div>
          <div class="risk-detail">${r.gain}${r.loss}${r.maxEl} · 🔥 ${r.calories}千卡 · 👣 ${r.steps}步</div>
          ${factors}${suitHtml}
        </div>`;
      }).join("");
      riskEl.innerHTML = riskHtml;
      riskEl.style.display = "block";
    } else {
      riskEl.style.display = "none";
    }
  }

  const warnEl = document.getElementById("map-warnings");
  if (warnEl) {
    if (warnings.length > 0) {
      warnEl.innerHTML = warnings.map(w => `<div>⚠️ ${w}</div>`).join("");
      warnEl.style.display = "block";
    } else {
      warnEl.style.display = "none";
    }
  }
}

// ─── 地图面板按钮事件 ─────────────────────────────────
document.getElementById("btn-map")?.addEventListener("click", () => {
  const { activePanel, openPanel, closePanel } = window._panels || {};
  if (activePanel === "map-panel") {
    closePanel?.("map-panel");
  } else {
    openPanel?.("map-panel");
    if (window._lastTripPlan) {
      setTimeout(() => renderTripOnMap(window._lastTripPlan), 300);
    }
  }
});

document.getElementById("btn-close-map")?.addEventListener("click", () => {
  const { closePanel } = window._panels || {};
  closePanel?.("map-panel");
});

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

    renderTripOnMap(tripPlan);

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
window._renderTripOnMap = renderTripOnMap;
window._renderTripOnMapPanel = renderTripOnMap;

// ─── 全屏地图页面 ────────────────────────────────────────
let pageMapInstance = null;
let pageMapLayers = [];
let pageMapCurrentLayer = 'standard';
let pageMapTileLayers = {};

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

      pageMapTileLayers.terrain = L.tileLayer('https://tile{s}.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
        maxZoom: 17, subdomains: ['a','b','c'],
      });

      pageMapTileLayers.standard.addTo(pageMapInstance);
      pageMapInstance.setView([35.86, 104.20], 5);
      setupMapInteractions();

      if (window._lastTripPlan) {
        if (emptyHint) emptyHint.style.display = 'none';
        renderTripOnPageMap(window._lastTripPlan);
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
    renderTripOnPageMap(window._lastTripPlan);
  } else {
    if (emptyHint) emptyHint.style.display = 'flex';
  }
}

window._initPageMap = initPageMap;

function setupMapInteractions() {
  document.getElementById('btn-map-routes')?.addEventListener('click', () => {
    document.getElementById('page-map-routes')?.classList.toggle('show');
    document.getElementById('btn-map-routes')?.classList.toggle('active');
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

  pageMapInstance.on('click', () => {
    document.getElementById('map-layer-switcher')?.classList.remove('show');
  });

  // 快捷提示点击
  document.querySelectorAll('#map-chat-welcome .quick-prompt').forEach(el => {
    el.addEventListener('click', () => {
      const prompt = el.dataset.prompt;
      if (chatPanel?.agentInterface && prompt) {
        chatPanel.agentInterface.sendMessage(prompt);
        document.getElementById('map-chat-welcome').style.display = 'none';
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
          html: '<div class="attraction-marker">' + (attrIdx + 1) + '</div>',
          iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -20],
        });
        const popupHtml = '<div class="map-popup">' +
          '<div class="popup-title">' + (attr.nameZh || attr.name || '景点') + '</div>' +
          '<div class="popup-city">📍 ' + dayCity + '</div>' +
          '<div class="popup-meta">' +
          (attr.visitDuration ? '<span>⏱ ' + attr.visitDuration + '分钟</span>' : '') +
          (attr.ticketPrice ? '<span>🎫 ¥' + attr.ticketPrice + '</span>' : '') +
          '</div></div>';
        const marker = L.marker([loc.latitude, loc.longitude], { icon }).bindPopup(popupHtml, { maxWidth: 280 });
        marker.addTo(pageMapInstance);
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
            pageMapLayers.push(polyline);
            routeCount++;

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
                      html: '<div style="width:12px;height:12px;border-radius:50%;background:' + color + ';border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>',
                      iconSize: [12, 12], iconAnchor: [6, 6],
                    });
                    const spMarker = L.marker([sp.location.latitude, sp.location.longitude], { icon: spIcon })
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
                const wpMarker = L.marker([wp.location.latitude, wp.location.longitude], { icon: wpIcon }).bindPopup(wpPopup, { maxWidth: 280 });
                wpMarker.addTo(pageMapInstance);
                pageMapLayers.push(wpMarker);
                allCoords.push([wp.location.latitude, wp.location.longitude]);
              }
            });
          }
        }
      }
    }
    routePanelData.push({ dayNum: dayIdx + 1, city: dayCity, attractions: dayAttrItems });
  }

  // 城市间连线
  if (tripPlan.cities && tripPlan.cities.length > 1) {
    const cityPath = tripPlan.cities.filter(c => CITY_CENTERS[c.city]).map(c => CITY_CENTERS[c.city]);
    if (cityPath.length > 1) {
      const cityLine = L.polyline(cityPath, { color: '#6366f1', weight: 3, opacity: 0.5, dashArray: '12,8' });
      cityLine.addTo(pageMapInstance);
      pageMapLayers.push(cityLine);
      tripPlan.cities.forEach(c => {
        const center = CITY_CENTERS[c.city];
        if (center) {
          const cityIcon = L.divIcon({
            className: 'custom-marker',
            html: '<div class="city-marker">' + c.city + (c.days ? ' · '+c.days+'天' : '') + '</div>',
            iconSize: [100, 28], iconAnchor: [50, 14],
          });
          pageMapLayers.push(L.marker(center, { icon: cityIcon }).addTo(pageMapInstance));
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
  if (sa) sa.textContent = markerCount + ' 景点';
  const sr = document.getElementById('status-routes');
  if (sr) sr.textContent = routeCount + ' 路线';
  const ss = document.getElementById('status-supplies');
  if (ss) ss.textContent = supplyPointCount + ' 补给点';
  const sd = document.getElementById('status-days');
  if (sd) sd.textContent = (tripPlan.days?.length||0) + ' 天';

  if (markerCount > 0) document.getElementById('page-map-legend')?.classList.add('show');
  renderRoutePanel(routePanelData);
}

function renderRoutePanel(data) {
  const body = document.getElementById('route-panel-body');
  if (!body) return;
  body.innerHTML = data.map(day => '<div class="route-day-group">' +
    '<div class="route-day-label">Day ' + day.dayNum + ' · ' + day.city + '</div>' +
    day.attractions.map(attr => '<div class="route-attr-item" data-lat="' + (attr.lat||'') + '" data-lng="' + (attr.lng||'') + '">' +
      '<span class="attr-dot"></span><span>' + attr.name + '</span>' +
      (attr.duration ? '<span class="attr-duration">' + attr.duration + 'min</span>' : '') +
    '</div>').join('') +
  '</div>').join('');

  body.querySelectorAll('.route-attr-item').forEach(item => {
    item.addEventListener('click', () => {
      const lat = parseFloat(item.dataset.lat);
      const lng = parseFloat(item.dataset.lng);
      if (lat && lng && pageMapInstance) {
        pageMapInstance.setView([lat, lng], 16, { animate: true });
        pageMapLayers.forEach(layer => {
          if (layer.getLatLng) {
            const pos = layer.getLatLng();
            if (Math.abs(pos.lat - lat) < 0.0001 && Math.abs(pos.lng - lng) < 0.0001) layer.openPopup();
          }
        });
      }
    });
  });
}