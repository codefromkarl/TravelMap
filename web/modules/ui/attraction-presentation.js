import { escapeHtml, safeHttpUrl } from '../infra/content-safety.js';

/** Unknown values never imply free admission. @param {unknown} value @param {object} dictionary */
export function formatAttractionPrice(value, dictionary) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return dictionary.attractionPriceUnknown;
  return value === 0 ? dictionary.attractionPriceFree : `¥${value}`;
}

/** Validate coordinates before mutating itinerary data or rendering a marker. */
export function isValidAttractionLocation(location) {
  return typeof location?.latitude === 'number' && typeof location?.longitude === 'number'
    && Number.isFinite(location.latitude) && Number.isFinite(location.longitude)
    && Math.abs(location.latitude) <= 90 && Math.abs(location.longitude) <= 180
    && (location.latitude !== 0 || location.longitude !== 0);
}

/** Shared safe popup for static, animated and tool-preview attraction markers. */
export function buildAttractionPopup(attraction, city, dictionary) {
  const attr = attraction || {};
  const imageUrl = safeHttpUrl(Array.isArray(attr.images) ? attr.images[0]?.url : null);
  const duration = typeof attr.visitDuration === 'number' && Number.isFinite(attr.visitDuration)
    && attr.visitDuration > 0 ? `<span>⏱ ${attr.visitDuration}分钟</span>` : '';
  return '<div class="map-popup">'
    + `<div class="popup-title">${escapeHtml(attr.nameZh || attr.name || dictionary.statsAttractions)}</div>`
    + (attr.description ? `<div class="popup-desc">${escapeHtml(attr.description)}</div>` : '')
    + (imageUrl ? `<div style="margin-top:4px"><img src="${escapeHtml(imageUrl)}" style="width:100%;border-radius:6px;max-height:120px;object-fit:cover" loading="lazy"></div>` : '')
    + `<div class="popup-city">📍 ${escapeHtml(attr.address || city)}</div>`
    + `<div class="popup-meta">${duration}<span>🎫 ${escapeHtml(formatAttractionPrice(attr.ticketPrice, dictionary))}</span></div>`
    + (attr.tips ? `<div class="popup-tips">💡 ${escapeHtml(attr.tips)}</div>` : '')
    + '</div>';
}
