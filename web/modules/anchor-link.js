/**
 * 地图-聊天双向锚定模块
 *
 * 实现地图 marker 与聊天区景点文本的双向联动：
 *   1. 聊天区景点文本添加锚点（id + data 属性）
 *   2. 地图 marker 点击 → 滚动到聊天区对应景点
 *   3. 聊天区景点点击 → 聚焦到地图对应 marker
 */

import { showToast } from './context.js?v=7';

// ─── 锚点 ID 生成 ─────────────────────────────────────

/**
 * 生成景点锚点 ID
 * @param {string} name - 景点名
 * @returns {string} 锚点 ID
 */
export function makeAnchorId(name) {
  return `attr-${name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\u4e00-\u9fa5-]/g, '')}`;
}

// ─── 聊天区锚点注入 ─────────────────────────────────────

/**
 * 为聊天区 HTML 中的景点名添加锚点
 * @param {string} html - 原始 HTML
 * @param {string[]} attractionNames - 景点名列表
 * @returns {string} 添加锚点后的 HTML
 */
export function injectAttractionAnchors(html, attractionNames) {
  if (!html || !attractionNames?.length) return html;

  let result = html;

  for (const name of attractionNames) {
    if (!name) continue;

    const anchorId = makeAnchorId(name);
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // 匹配纯文本中的景点名（不匹配已在标签内的）
    const regex = new RegExp(`(?<![<"'${escapedName}])${escapedName}(?![>"'])`, 'g');

    result = result.replace(regex, (match) => {
      // 避免重复添加锚点
      if (result.includes(`id="${anchorId}"`)) return match;
      return `<span id="${anchorId}" class="attraction-anchor" data-name="${name}">${match}</span>`;
    });
  }

  return result;
}

/**
 * 为聊天消息元素添加景点锚点
 * @param {HTMLElement} messageEl - 聊天消息元素
 * @param {string[]} attractionNames - 景点名列表
 */
export function addAnchorsToMessage(messageEl, attractionNames) {
  if (!messageEl || !attractionNames?.length) return;

  // 只处理 assistant 消息
  if (!messageEl.classList.contains('assistant') && !messageEl.dataset.role !== 'assistant') {
    return;
  }

  const textNodes = [];

  // 收集文本节点
  const walker = document.createTreeWalker(
    messageEl,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  let node;
  while (node = walker.nextNode()) {
    textNodes.push(node);
  }

  // 为包含景点名的文本节点添加锚点
  for (const textNode of textNodes) {
    const text = textNode.textContent;
    let hasAttraction = false;

    for (const name of attractionNames) {
      if (text.includes(name)) {
        hasAttraction = true;
        break;
      }
    }

    if (hasAttraction) {
      const span = document.createElement('span');
      span.innerHTML = injectAttractionAnchors(text, attractionNames);
      textNode.parentNode.replaceChild(span, textNode);
    }
  }
}

// ─── 滚动到景点 ─────────────────────────────────────────

/**
 * 滚动聊天区到指定景点
 * @param {string} attractionName - 景点名
 * @param {object} options - 选项
 * @param {boolean} options.highlight - 是否高亮
 * @param {number} options.highlightDuration - 高亮持续时间（ms）
 */
export function scrollToAttraction(attractionName, options = {}) {
  const { highlight = true, highlightDuration = 2000 } = options;

  const anchorId = makeAnchorId(attractionName);
  const anchor = document.getElementById(anchorId);

  if (!anchor) {
    console.warn(`[Anchor] 未找到景点锚点: ${attractionName}`);
    return false;
  }

  // 滚动到锚点
  anchor.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  });

  // 高亮效果
  if (highlight) {
    anchor.classList.add('attraction-highlight');
    setTimeout(() => {
      anchor.classList.remove('attraction-highlight');
    }, highlightDuration);
  }

  return true;
}

// ─── 地图 Marker 聚焦 ─────────────────────────────────

// 存储 marker 引用
const markerRegistry = new Map();

/**
 * 注册 marker
 * @param {string} name - 景点名
 * @param {object} marker - Leaflet marker
 * @param {object} map - Leaflet map
 */
export function registerMarker(name, marker, map) {
  markerRegistry.set(name, { marker, map });
}

/**
 * 清除所有注册的 marker
 */
export function clearMarkerRegistry() {
  markerRegistry.clear();
}

/**
 * 聚焦到指定景点的 marker
 * @param {string} attractionName - 景点名
 * @param {object} options - 选项
 * @param {number} options.zoom - 缩放级别
 * @param {boolean} options.openPopup - 是否打开 popup
 */
export function focusMarker(attractionName, options = {}) {
  const { zoom = 15, openPopup = true } = options;

  const entry = markerRegistry.get(attractionName);
  if (!entry) {
    console.warn(`[Anchor] 未找到景点 marker: ${attractionName}`);
    return false;
  }

  const { marker, map } = entry;

  // 移动地图到 marker
  map.setView(marker.getLatLng(), zoom);

  // 打开 popup
  if (openPopup) {
    marker.openPopup();
  }

  return true;
}

// ─── 事件监听 ─────────────────────────────────────────

/**
 * 初始化聊天区景点点击事件
 */
export function initChatAttractionClick() {
  document.addEventListener('click', (e) => {
    const anchor = e.target.closest('.attraction-anchor');
    if (!anchor) return;

    const name = anchor.dataset.name;
    if (!name) return;

    e.preventDefault();
    e.stopPropagation();

    // 聚焦到地图 marker
    const focused = focusMarker(name);

    if (focused) {
      showToast(`📍 已定位到 ${name}`, 1500, 'info');
    }
  });
}

/**
 * 初始化地图 marker 点击事件（需要在创建 marker 时调用）
 * @param {object} marker - Leaflet marker
 * @param {string} attractionName - 景点名
 */
export function initMarkerClick(marker, attractionName) {
  marker.on('click', () => {
    scrollToAttraction(attractionName);
  });
}

// ─── CSS 样式注入 ─────────────────────────────────────

/**
 * 注入锚点相关 CSS 样式
 */
export function injectAnchorStyles() {
  if (document.getElementById('attraction-anchor-styles')) return;

  const style = document.createElement('style');
  style.id = 'attraction-anchor-styles';
  style.textContent = `
    .attraction-anchor {
      cursor: pointer;
      color: var(--accent-color, #6366f1);
      text-decoration: underline;
      text-decoration-style: dotted;
      text-underline-offset: 2px;
      transition: all 0.2s ease;
    }

    .attraction-anchor:hover {
      color: var(--accent-hover, #4f46e5);
      text-decoration-style: solid;
    }

    .attraction-highlight {
      animation: attraction-pulse 2s ease-out;
      background: var(--accent-bg, rgba(99, 102, 241, 0.1));
      border-radius: 4px;
      padding: 2px 4px;
      margin: -2px -4px;
    }

    @keyframes attraction-pulse {
      0% {
        background: var(--accent-bg, rgba(99, 102, 241, 0.3));
      }
      100% {
        background: transparent;
      }
    }
  `;

  document.head.appendChild(style);
}

// ─── 自动初始化 ─────────────────────────────────────────

// 初始化样式和事件
if (typeof document !== 'undefined') {
  injectAnchorStyles();
  initChatAttractionClick();
}
