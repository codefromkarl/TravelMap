import {
  currentUser,
  setCurrentUser,
  setQuotaRemaining,
  setIsProxyMode,
  showToast,
  LLM_HOSTS,
  currentLang,
} from '../infra/context.js';
import { I18N } from '../i18n.js';
import { addTraceHeaders, extractTraceId } from '../trace.js';
import { createLogger } from '../logger.js';
import { traceAsync } from '../perf-trace.js';

const logger = createLogger('auth');

const PROXY_BASE = '/api/chat';

export const authOverlay = document.getElementById('auth-overlay');
export const quotaBar = document.getElementById('quota-bar');

export async function checkAuth() {
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (isLocal) return false;

  try {
    const response = await fetch('/api/auth/status', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok && data.authenticated) {
      onAuthenticated(data);
      return true;
    }
  } catch {
    logger.warn('认证状态检查失败');
  }

  showAuthOverlay();
  return false;
}

export async function requireAuth() {
  if (currentUser) return true;
  const authenticated = await checkAuth();
  if (!authenticated) {
    const message = I18N[currentLang]?.authRequired || '请先登录后再使用 AI 旅行规划';
    showToast(message, 3000, 'warning');
  }
  return authenticated;
}

function showAuthOverlay() {
  const overlay = document.getElementById('auth-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  overlay.classList.add('visible');
}

export function onAuthenticated(data) {
  const user = data?.user || null;
  const remaining = Number(data?.quota?.remaining ?? 0);
  setCurrentUser(user);
  updateQuota(remaining);

  const overlay = document.getElementById('auth-overlay');
  if (overlay) {
    overlay.classList.remove('visible');
    overlay.style.display = 'none';
  }

  const avatar = document.getElementById('quota-avatar');
  if (avatar && user?.avatar) avatar.src = user.avatar;
  const name = document.getElementById('quota-name');
  if (name) name.textContent = user?.name || '';
  const bar = document.getElementById('quota-bar');
  bar?.classList.add('visible');
}

export function updateQuota(remaining) {
  const normalized = Number.isFinite(remaining) ? Math.max(0, remaining) : 0;
  setQuotaRemaining(normalized);
  const count = document.getElementById('quota-count');
  if (count) count.textContent = String(normalized);
}

export async function detectProxyMode() {
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (isLocal) return;

  // Production never keeps user-provided API credentials in browser storage.
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('api-key-')) localStorage.removeItem(key);
  }
  setIsProxyMode(true);
  installFetchProxy();
  document.getElementById('connection-mode')?.style.setProperty('display', 'flex');
  console.log('[Proxy] Production mode: all LLM requests routed through backend');
}

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

    logger.info('通过同源代理发起模型请求');
    const traceHeaders = addTraceHeaders({ 'Content-Type': 'application/json' });
    const resp = await traceAsync('api-chat-proxy', async () => {
      return await origFetch.call(this, PROXY_BASE, {
        ...init,
        method: 'POST',
        headers: traceHeaders,
        body: init?.body,
        credentials: 'same-origin',
      });
    });

    const responseTraceId = extractTraceId(resp);
    if (responseTraceId) {
      logger.info('traceId 确认', { responseTraceId });
    }
    const remaining = resp.headers.get('X-Quota-Remaining');
    if (remaining) {
      updateQuota(parseInt(remaining, 10));
    }
    if (resp.status === 401) {
      setCurrentUser(null);
      showAuthOverlay();
    }
    return resp;
  };
}
