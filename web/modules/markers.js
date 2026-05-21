/**
 * Marker Registry — 地图标记类型的可扩展接口
 *
 * 把散落在 map.js 中的 marker 创建逻辑（景点、餐厅、酒店、城市）
 * 收敛到一个注册表，新增类型只需注册一次。
 *
 * 接口：
 *   registry.register(type, { createIcon, createPopup })
 *   registry.create(type, data) → { icon, popup }
 */

// ─── 内置 Marker 类型 ─────────────────────────────────

const _types = new Map();

_types.set('attraction', {
  createIcon(data, options = {}) {
    const { dayIdx = 0, attrIdx = 0, animated = false } = options;
    const className = animated ? 'attraction-marker anim-highlight' : 'attraction-marker';
    const delay = animated ? '' : ` style="animation-delay:${(dayIdx * 4 + attrIdx) * 60}ms"`;
    return {
      className: 'custom-marker',
      html: `<div class="${className}"${delay}>${attrIdx + 1}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -20],
    };
  },
  createPopup(data) {
    const attr = data;
    return '<div class="popup-card">' +
      '<div class="popup-title">' + (attr.nameZh || attr.name || '景点') + '</div>' +
      (attr.description ? '<div class="popup-desc">' + attr.description + '</div>' : '') +
      (attr.visitDuration ? '<div class="popup-meta">⏱️ ' + attr.visitDuration + '</div>' : '') +
      (attr.ticketPrice ? '<div class="popup-meta">🎫 ¥' + attr.ticketPrice + '</div>' : '') +
      (attr.tips ? '<div class="popup-tips">💡 ' + attr.tips + '</div>' : '') +
      '</div>';
  },
});

_types.set('restaurant', {
  createIcon() {
    return {
      className: 'custom-marker',
      html: '<div class="restaurant-marker">🍴</div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -16],
    };
  },
  createPopup(data) {
    const r = data;
    return '<div class="popup-card">' +
      '<div class="popup-title">' + r.name + '</div>' +
      '<div class="popup-meta">' +
      (r.rating ? '<span>⭐ ' + r.rating + '</span>' : '') +
      (r.averageCost ? '<span>¥' + r.averageCost + '/人</span>' : '') +
      (r.cuisine ? '<span>' + r.cuisine + '</span>' : '') +
      '</div>' +
      (r.address ? '<div class="popup-city">📍 ' + r.address + '</div>' : '') +
      (r.signature ? '<div class="popup-tips">🍽️ 招牌：' + r.signature + '</div>' : '') +
      '</div>';
  },
});

_types.set('hotel', {
  createIcon() {
    return {
      className: 'custom-marker',
      html: '<div class="hotel-marker">🏨</div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -16],
    };
  },
  createPopup(data) {
    const h = data;
    return '<div class="popup-card">' +
      '<div class="popup-title">🏨 ' + (h.name || '住宿') + '</div>' +
      (h.address ? '<div class="popup-city">📍 ' + h.address + '</div>' : '') +
      (h.priceRange ? '<div class="popup-tips">💰 ' + h.priceRange + '</div>' : '') +
      (h.rating ? '<div class="popup-tips">⭐ ' + h.rating + '</div>' : '') +
      '</div>';
  },
});

_types.set('city', {
  createIcon(data) {
    const c = data;
    return {
      className: 'custom-marker',
      html: '<div class="city-marker">' + c.city + (c.days ? ' · ' + c.days + '天' : '') + '</div>',
      iconSize: [100, 28],
      iconAnchor: [50, 14],
    };
  },
  createPopup() { return ''; },
});

_types.set('supply', {
  createIcon() {
    return {
      className: 'custom-marker',
      html: '<div class="supply-marker" style="width:20px;height:20px;border-radius:50%;background:#22c55e;display:flex;align-items:center;justify-content:center;font-size:11px;color:white">🍴</div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    };
  },
  createPopup(data) {
    const sp = data;
    return '<div class="popup-card">' +
      '<div class="popup-title">' + (sp.name || '补给点') + '</div>' +
      (sp.type ? '<div class="popup-meta">' + sp.type + '</div>' : '') +
      '</div>';
  },
});

_types.set('waypoint', {
  createIcon() {
    return {
      className: 'custom-marker',
      html: '<div style="width:16px;height:16px;border-radius:50%;background:#6366f1;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    };
  },
  createPopup(data) {
    const wp = data;
    return '<div class="popup-card"><div class="popup-title">' + (wp.name || '途经点') + '</div></div>';
  },
});

// ─── Public API ────────────────────────────────────────

export const markerRegistry = {
  /**
   * 注册新的 marker 类型
   * @param {string} type - 类型名称
   * @param {object} config - { createIcon, createPopup }
   */
  register(type, config) {
    _types.set(type, config);
  },

  /**
   * 创建 marker 的 icon 和 popup
   * @param {string} type - 类型名称
   * @param {object} data - 景点/餐厅/酒店等数据
   * @param {object} [options] - 额外选项（如 dayIdx, attrIdx, animated）
   * @returns {{ iconOptions: object, popupHtml: string }}
   */
  create(type, data, options = {}) {
    const handler = _types.get(type);
    if (!handler) {
      console.warn(`[MarkerRegistry] Unknown type: ${type}`);
      return { iconOptions: {}, popupHtml: '' };
    }
    return {
      iconOptions: handler.createIcon(data, options),
      popupHtml: handler.createPopup(data),
    };
  },

  /**
   * 检查类型是否已注册
   */
  has(type) {
    return _types.has(type);
  },

  /**
   * 列出所有已注册类型
   */
  types() {
    return [..._types.keys()];
  },
};
