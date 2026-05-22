import { currentUser, setCurrentUser, setQuotaRemaining, isProxyMode, setIsProxyMode, showToast, LLM_HOSTS, currentLang } from './context.js?v=5';
import { I18N } from './i18n.js?v=5';
import { addTraceHeaders, extractTraceId } from './trace.js?v=5';
import { createLogger } from './logger.js?v=5';
import { traceAsync } from './perf-trace.js?v=5';

const logger = createLogger('auth');

// ─── 代理模式常量 ──────────────────────────────────────
const PROXY_BASE = '/api/chat';

// ─── 认证系统 ──────────────────────────────────────────
export const authOverlay = document.getElementById('auth-overlay');
export const quotaBar = document.getElementById('quota-bar');

let quotaRemainingInternal = 0;

export async function checkAuth() {
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (isLocal) return false;
  try {
    const resp = await fetch('/api/auth/status', { credentials: 'include', signal: AbortSignal.timeout(3000) });
    const data = await resp.json();
    if (data.authenticated) {
      setCurrentUser(data.user);
      setQuotaRemaining(data.quota.remaining);
      onAuthenticated(data);
      return true;
    }
  } catch {}
  // 未登录 → 显示登录弹窗
  authOverlay?.classList.add('visible');
  logger.info('未登录，显示登录弹窗');
  return false;
}

export async function requireAuth() {
  if (currentUser) return true;
  authOverlay?.classList.add('visible');
  return false;
}

export function onAuthenticated(data) {
  authOverlay?.classList.remove('visible');
  const avatarEl = document.getElementById('quota-avatar');
  const nameEl = document.getElementById('quota-name');
  const countEl = document.getElementById('quota-count');
  if (avatarEl) { avatarEl.src = data.user.avatar || ''; avatarEl.style.display = ''; }
  if (nameEl) nameEl.textContent = data.user.name;
  if (countEl) countEl.textContent = data.quota.remaining;
  quotaBar?.classList.add('visible');
  // 恢复退出按钮
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) logoutBtn.style.display = '';
  document.querySelectorAll('.oauth-btn').forEach(btn => {
    if (btn.tagName === 'A') {
      const url = new URL(btn.href);
      url.searchParams.set('redirect', window.location.pathname);
      btn.href = url.toString();
    }
  });
}

export function updateQuota(remaining) {
  quotaRemainingInternal = remaining;
  setQuotaRemaining(remaining);
  const countEl = document.getElementById('quota-count');
  if (countEl) countEl.textContent = remaining;
}

// 登出
document.getElementById('btn-logout')?.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  setCurrentUser(null);
  setQuotaRemaining(0);
  quotaBar?.classList.remove('visible');
  // 登出后显示登录弹窗
  authOverlay?.classList.add('visible');
});

// ─── 代理模式检测 ──────────────────────────────────────
export async function detectProxyMode() {
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (isLocal) return;

  // 生产环境强制启用代理模式（API Key 由后端环境变量提供，前端不接触）
  setIsProxyMode(true);
  installFetchProxy();
  document.getElementById('connection-mode')?.style.setProperty('display', 'flex');
  console.log('[Proxy] Production mode: all LLM requests routed through backend');
}

// ─── Fetch 拦截器 ──────────────────────────────────────
function installFetchProxy() {
  const origFetch = window.fetch;
  window.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    let matchedProvider = null;
    try {
      const host = new URL(url).hostname;
      matchedProvider = LLM_HOSTS[host] || null;
    } catch {}
    if (!matchedProvider) {
      return origFetch.call(this, input, init);
    }

    // 未登录 → 弹出登录框，不发送请求
    if (!currentUser) {
      authOverlay?.classList.add('visible');
      showToast(I18N[currentLang]?.loginRequired || '请先登录后再使用', 5000);
      return new Response(JSON.stringify({ error: { message: 'Login required' }, code: 'AUTH_REQUIRED' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let body = init?.body;
    if (body && typeof body === 'string') {
      try {
        const parsed = JSON.parse(body);
        parsed._provider = matchedProvider;
        body = JSON.stringify(parsed);
      } catch {}
    }
    console.log(`[Proxy] → /api/chat (${matchedProvider})`);
    logger.info(`代理请求: ${matchedProvider}`);
    const traceHeaders = addTraceHeaders({ 'Content-Type': 'application/json' });
    const resp = await traceAsync('api-chat-proxy', async () => {
      return await origFetch.call(this, PROXY_BASE, {
        ...init,
        method: 'POST',
        headers: traceHeaders,
        body,
        credentials: 'include',
      });
    });

    // 提取响应中的 traceId
    const responseTraceId = extractTraceId(resp);
    if (responseTraceId) {
      logger.info('traceId 确认', { responseTraceId });
    }
    if (resp.status === 401) {
      setCurrentUser(null);
      authOverlay?.classList.add('visible');
      return resp;
    }
    if (resp.status === 403) {
      const data = await resp.clone().json().catch(() => ({}));
      if (data.code === 'QUOTA_EXCEEDED') {
        authOverlay?.classList.add('visible');
        showToast(I18N[currentLang]?.quotaExhausted || '免费体验次数已用完，登录后可获得更多次数', 5000);
      }
      return resp;
    }
    const remaining = resp.headers.get('X-Quota-Remaining');
    if (remaining) {
      updateQuota(parseInt(remaining, 10));
      logger.debug('配额更新', { remaining });
    }
    return resp;
  };
}
