/**
 * Feedback 模块 — 统一的用户反馈接口
 *
 * 把散落在 context.js (showToast)、chat-init.js (showErrorToast, planning indicator)
 * 中的反馈逻辑收敛到一个模块。
 *
 * 接口：
 *   feedback.loading(msg)           → 显示加载指示器
 *   feedback.success(msg)           → 绿色成功提示
 *   feedback.warning(msg)           → 黄色警告
 *   feedback.error(err)             → 自动分类错误 + 重试按钮
 *   feedback.quotaExceeded()        → 登录引导
 *   feedback.done()                 → 清除 loading 状态
 *   feedback.toast(msg, opts)       → 底层 toast（向后兼容）
 */

// 运行时读取当前语言，避免与 context.js 形成循环依赖
function _getLang() {
  return localStorage.getItem('travel-agent-lang') || 'zh';
}

// ─── 内部状态 ─────────────────────────────────────────
let _loadingEl = null;
let _loadingTimeout = null;

// ─── Toast 基础实现 ───────────────────────────────────
function _showToast(msg, duration = 2500, type = 'default', action = null) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.innerHTML = '';
  const textNode = document.createElement('span');
  textNode.textContent = msg;
  el.appendChild(textNode);
  el.className = 'show';
  if (type !== 'default') el.classList.add(type);
  if (action && action.label && action.onClick) {
    el.classList.add('has-action');
    const btn = document.createElement('button');
    btn.textContent = action.label;
    btn.className = 'toast-action-btn';
    btn.addEventListener('click', () => {
      el.className = '';
      action.onClick();
    });
    el.appendChild(btn);
    if (duration <= 2500) duration = 6000;
  }
  clearTimeout(el._hide);
  el._hide = setTimeout(() => el.className = '', duration);
}

// ─── 错误分类 ─────────────────────────────────────────
function _classifyError(errMsg) {
  const m = errMsg.toLowerCase();
  if (m.includes('fetch') || m.includes('network') || m.includes('failed to fetch')
    || m.includes('networkerror') || m.includes('err_connection')) {
    return {
      icon: '🌐',
      zh: '网络连接失败，请检查网络后重试',
      en: 'Network error, please check your connection',
      ja: 'ネットワーク接続に失敗しました',
      retryable: true,
    };
  }
  if (m.includes('401') || m.includes('unauthorized') || m.includes('incorrect api key') || m.includes('invalid_api_key')) {
    return {
      icon: '🔑',
      zh: 'API Key 无效，请在设置中检查',
      en: 'Invalid API Key, please check settings',
      ja: 'API Key が無効です',
      retryable: false,
    };
  }
  if (m.includes('429') || m.includes('rate') || m.includes('rate limit') || m.includes('too many requests')) {
    return {
      icon: '⏳',
      zh: '请求过于频繁，请稍后重试',
      en: 'Rate limited, please try again later',
      ja: 'リクエストが多すぎます',
      retryable: false,
    };
  }
  if (m.includes('timeout') || m.includes('timed out')) {
    return {
      icon: '⏱️',
      zh: '请求超时，请稍后重试',
      en: 'Request timed out, please try again',
      ja: 'リクエストがタイムアウトしました',
      retryable: true,
    };
  }
  if (m.includes('500') || m.includes('502') || m.includes('503') || m.includes('server error')) {
    return {
      icon: '🔧',
      zh: '服务器错误，请稍后重试',
      en: 'Server error, please try again later',
      ja: 'サーバーエラーです',
      retryable: true,
    };
  }
  return {
    icon: '❌',
    zh: `规划失败：${errMsg.slice(0, 60)}`,
    en: `Error: ${errMsg.slice(0, 60)}`,
    ja: `エラー: ${errMsg.slice(0, 60)}`,
    retryable: false,
  };
}

function _isRetryable(errMsg) {
  const m = errMsg.toLowerCase();
  return m.includes('fetch') || m.includes('network') || m.includes('failed to fetch')
    || m.includes('networkerror') || m.includes('err_connection') || m.includes('timeout')
    || m.includes('timed out') || m.includes('500') || m.includes('502')
    || m.includes('503') || m.includes('server error');
}

// ─── Planning Indicator ───────────────────────────────
function _showPlanningIndicator(msg = '正在规划行程...') {
  // 如果已有指示器，先移除
  _hidePlanningIndicator();

  const indicator = document.createElement('div');
  indicator.id = 'planning-indicator';
  indicator.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: var(--color-bg-elevated, #1e1e2e); color: var(--color-text-primary);
    padding: 20px 32px; border-radius: 12px; font-size: 15px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3); z-index: 1000;
    display: flex; align-items: center; gap: 12px;
    animation: feedbackFadeIn 0.2s ease-out;
  `;
  indicator.innerHTML = `
    <div style="width:20px;height:20px;border:2px solid var(--color-border-default);border-top-color:var(--color-accent-primary);border-radius:50%;animation:spin 1s linear infinite"></div>
    <span>${msg}</span>
  `;

  // 注入 spin 动画（如果不存在）
  if (!document.getElementById('feedback-spin-style')) {
    const style = document.createElement('style');
    style.id = 'feedback-spin-style';
    style.textContent = `
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes feedbackFadeIn { from { opacity: 0; transform: translate(-50%,-50%) scale(0.95); } to { opacity: 1; transform: translate(-50%,-50%) scale(1); } }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(indicator);
  _loadingEl = indicator;

  // 超时保护：60 秒后自动移除
  _loadingTimeout = setTimeout(() => {
    _hidePlanningIndicator();
    _showToast('请求超时，请重试', 4000, 'warning');
  }, 60000);
}

function _hidePlanningIndicator() {
  if (_loadingTimeout) { clearTimeout(_loadingTimeout); _loadingTimeout = null; }
  if (_loadingEl) { _loadingEl.remove(); _loadingEl = null; }
}

// ─── Public API ───────────────────────────────────────

export const feedback = {
  /**
   * 显示加载状态（规划中、搜索中等）
   */
  loading(msg) {
    _showPlanningIndicator(msg);
  },

  /**
   * 清除加载状态
   */
  done() {
    _hidePlanningIndicator();
  },

  /**
   * 成功提示（绿色）
   */
  success(msg, duration = 2500) {
    _showToast(msg, duration, 'success');
  },

  /**
   * 警告提示（黄色）
   */
  warning(msg, duration = 5000) {
    _showToast(msg, duration, 'warning');
  },

  /**
   * 信息提示（默认样式）
   */
  info(msg, duration = 2500) {
    _showToast(msg, duration, 'default');
  },

  /**
   * 错误提示 — 自动分类 + 可选重试
   * @param {string|Error} err - 错误对象或消息
   * @param {Function} [onRetry] - 重试回调（可选）
   */
  error(err, onRetry = null) {
    const errMsg = String(err?.message || err || '');
    const classified = _classifyError(errMsg);
    const lang = _getLang();
    const msg = `${classified.icon} ${classified[lang] || classified.zh}`;

    const action = (classified.retryable && onRetry) ? {
      label: lang === 'zh' ? '重试' : lang === 'ja' ? '再試行' : 'Retry',
      onClick: onRetry,
    } : null;

    _showToast(msg, action ? 6000 : 5000, 'error', action);
  },

  /**
   * 配额耗尽 — 引导登录
   */
  quotaExceeded() {
    const lang = _getLang();
    const msg = lang === 'zh' ? '免费体验次数已用完，登录后可获得更多次数'
      : lang === 'ja' ? '無料体験回数が終了しました'
      : 'Free trial exhausted, please log in';
    _showToast(msg, 6000, 'warning', {
      label: lang === 'zh' ? '去登录' : 'Log in',
      onClick: () => document.getElementById('auth-overlay')?.classList.add('visible'),
    });
  },

  /**
   * 发送失败
   */
  sendFailed(errMsg) {
    _showToast(`发送失败: ${errMsg}`, 5000, 'error');
  },

  /**
   * 底层 toast — 向后兼容 showToast()
   */
  toast(msg, duration, type, action) {
    _showToast(msg, duration, type, action);
  },
};

/**
 * 向后兼容的 showToast（供 context.js re-export）
 */
export function showToast(msg, duration, type, action) {
  _showToast(msg, duration, type, action);
}
