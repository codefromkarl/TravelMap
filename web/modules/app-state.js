/**
 * App State 模块 — Welcome → Chat 状态机
 *
 * 把散落在 welcome.js、session.js、chat-init.js 中的状态转换逻辑
 * 收敛到一个明确的状态机。
 *
 * 状态：
 *   loading   → 页面加载中
 *   welcome   → 欢迎页（快捷提示卡片）
 *   planning  → Agent 正在规划
 *   result    → 行程结果展示
 *   history   → 恢复旧行程
 *
 * 接口：
 *   appState.current        → 当前状态
 *   appState.transition(to) → 状态转换
 *   appState.subscribe(cb)  → 订阅状态变化
 */

// ─── 状态定义 ──────────────────────────────────────────

const VALID_STATES = ['loading', 'welcome', 'planning', 'result', 'history'];

// ─── 内部状态 ──────────────────────────────────────────

let _current = 'loading';
const _listeners = new Set();

// ─── DOM 元素引用 ──────────────────────────────────────

function _getWelcomeEl() {
  return document.getElementById('map-chat-welcome');
}

function _getExportToolbar() {
  return document.getElementById('export-toolbar');
}

// ─── 状态转换副作用 ────────────────────────────────────

function _applyState(state) {
  const welcomeEl = _getWelcomeEl();
  const toolbar = _getExportToolbar();

  switch (state) {
    case 'welcome':
      if (welcomeEl) welcomeEl.style.display = '';
      if (toolbar) toolbar.classList.remove('visible');
      break;

    case 'planning':
      if (welcomeEl) welcomeEl.style.display = 'none';
      if (toolbar) toolbar.classList.remove('visible');
      // 禁用工具栏按钮
      _setToolbarDisabled(true);
      break;

    case 'result':
      if (welcomeEl) welcomeEl.style.display = 'none';
      if (toolbar) toolbar.classList.add('visible');
      _setToolbarDisabled(false);
      break;

    case 'history':
      if (welcomeEl) welcomeEl.style.display = 'none';
      if (toolbar) toolbar.classList.add('visible');
      _setToolbarDisabled(false);
      break;

    case 'loading':
      // loading 状态不改变 DOM
      break;
  }
}

function _setToolbarDisabled(disabled) {
  const ids = ['btn-export-md', 'btn-export-pdf', 'btn-share-image', 'btn-share-link-new',
    'btn-share-qr', 'btn-map', 'btn-tts', 'btn-poster', 'btn-voice-companion'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (disabled) el.classList.add('disabled-ghost');
      else el.classList.remove('disabled-ghost');
    }
  });
}

// ─── Public API ────────────────────────────────────────

export const appState = {
  /**
   * 获取当前状态
   */
  get current() {
    return _current;
  },

  /**
   * 状态转换
   * @param {string} to - 目标状态
   * @returns {boolean} 是否转换成功
   */
  transition(to) {
    if (!VALID_STATES.includes(to)) {
      console.warn(`[AppState] Invalid state: ${to}`);
      return false;
    }
    if (to === _current) return true; // 幂等

    const from = _current;
    _current = to;

    // 应用 DOM 副作用
    _applyState(to);

    // 通知订阅者
    for (const cb of _listeners) {
      try { cb(to, from); } catch (e) { console.error('[AppState] Listener error:', e); }
    }

    return true;
  },

  /**
   * 订阅状态变化
   * @param {Function} cb - (to, from) => void
   * @returns {Function} 取消订阅
   */
  subscribe(cb) {
    _listeners.add(cb);
    return () => _listeners.delete(cb);
  },

  /**
   * 检查是否处于某个状态
   */
  is(state) {
    return _current === state;
  },

  /**
   * 检查是否处于多个状态之一
   */
  isOneOf(...states) {
    return states.includes(_current);
  },
};

// ─── 便捷函数 ──────────────────────────────────────────

/**
 * 初始化欢迎状态（替代 welcome.js 的 initWelcome）
 */
export function initWelcomeState() {
  const welcomeEl = _getWelcomeEl();
  if (!welcomeEl) return;

  // 点击快捷卡片 → 进入 planning
  welcomeEl.querySelectorAll('.quick-prompt[data-prompt]').forEach(card => {
    card.addEventListener('click', () => {
      appState.transition('planning');
    });
  });

  // 发现模式按钮
  const discoverBtn = welcomeEl.querySelector('.quick-prompt[data-action="discover"]');
  if (discoverBtn) {
    discoverBtn.addEventListener('click', () => {
      appState.transition('planning');
    });
  }
}
