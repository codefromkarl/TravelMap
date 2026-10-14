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
import { initTripSync, syncTrips, pauseTripSync, resumeTripSync } from '../infra/trip-sync.js';

const logger = createLogger('auth');

const PROXY_BASE = '/api/chat';
const AUTH_STATUS_TIMEOUT_MS = 5000;
let _authEpoch = 0;
let _pendingStatus = null;
let _signedOut = false;

function validUser(user) {
  return typeof user?.id === 'string' && user.id.trim().length > 0;
}

function invalidateStatusChecks() {
  _authEpoch++;
  const pending = _pendingStatus;
  _pendingStatus = null;
  if (pending) {
    pending.cancelled = true;
    pending.controller.abort();
    pending.cancel();
  }
}

function pendingStatusCheck() {
  if (_pendingStatus) return _pendingStatus;
  const entry = { epoch: _authEpoch, controller: new AbortController(), cancelled: false, cancel: null, promise: null, decisionEpoch: null };
  _pendingStatus = entry;
  entry.promise = readStatus(entry);
  return entry;
}

async function readStatus(entry) {
  let timeout;
  const interruption = new Promise(resolve => {
    entry.cancel = () => resolve(null);
    timeout = setTimeout(() => { entry.controller.abort(); resolve(null); }, AUTH_STATUS_TIMEOUT_MS);
  });
  // Keep the complete fetch/body operation pure: late or uncancellable responses cannot hydrate UI.
  const request = (async () => {
    const response = await fetch('/api/auth/status', {
      credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' },
      signal: entry.controller.signal,
    });
    const data = await response.json();
    return { ok: response.ok, data };
  })().catch(() => {
    if (!entry.controller.signal.aborted) logger.warn('认证状态检查失败');
    return null;
  });
  try {
    const result = await Promise.race([request, interruption]);
    if (entry.cancelled || entry.epoch !== _authEpoch) return false;
    // A completed check owns its decision; transition invalidation must only cancel other checks.
    if (_pendingStatus === entry) _pendingStatus = null;
    const authenticated = result?.ok === true && result.data?.authenticated === true && validUser(result.data.user);
    if (authenticated) onAuthenticated(result.data);
    else onGuest();
    entry.decisionEpoch = _authEpoch;
    return authenticated;
  } finally {
    clearTimeout(timeout);
    if (_pendingStatus === entry) _pendingStatus = null;
  }
}

function isLocalHost() {
  return ['localhost', '127.0.0.1'].includes(location.hostname);
}

export const authOverlay = document.getElementById('auth-overlay');
export const quotaBar = document.getElementById('quota-bar');

/** Refresh identity through a shared, bounded status request. */
export function checkAuth() {
  if (isLocalHost()) {
    onGuest();
    return Promise.resolve(false);
  }
  if (_signedOut) return Promise.resolve(false);
  return pendingStatusCheck().promise;
}

/** Gate a new AI action; superseded actions are denied without reopening an old sign-in prompt. */
export async function requireAuth() {
  if (isLocalHost()) return true;
  if (_signedOut) {
    const message = I18N[currentLang]?.loginRequired || '请先登录后再使用 AI 旅行规划';
    showToast(message, 3000, 'warning');
    showAuthOverlay();
    return false;
  }
  if (validUser(currentUser)) return true;
  const entry = pendingStatusCheck();
  const authenticated = await entry.promise;
  if (entry.cancelled || entry.decisionEpoch !== _authEpoch) return false;
  if (!authenticated) {
    const message = I18N[currentLang]?.loginRequired || '请先登录后再使用 AI 旅行规划';
    showToast(message, 3000, 'warning');
    showAuthOverlay();
  }
  return authenticated;
}

export function showAuthOverlay() {
  const overlay = document.getElementById('auth-overlay');
  if (!overlay) return;
  const redirect = `${location.pathname || '/'}${location.search || ''}${location.hash || ''}`;
  overlay.querySelectorAll('.oauth-btn').forEach(link => {
    const url = new URL(link.getAttribute('href'), location.origin);
    url.searchParams.set('redirect', redirect);
    link.setAttribute('href', `${url.pathname}${url.search}`);
  });
  overlay.style.display = 'flex';
  overlay.classList.add('visible');
  overlay.querySelector('.oauth-btn')?.focus();
}

export function hideAuthOverlay() {
  const overlay = document.getElementById('auth-overlay');
  if (!overlay) return;
  overlay.classList.remove('visible');
  overlay.style.display = 'none';
}

export function onGuest() {
  invalidateStatusChecks();
  pauseTripSync();
  updateQuota(0);
  setCurrentUser(null);
  hideAuthOverlay();
  document.getElementById('quota-bar')?.classList.remove('visible');
  document.getElementById('guest-banner')?.classList.add('visible');
}

export function onAuthenticated(data) {
  if (!validUser(data?.user)) { onGuest(); return; }
  invalidateStatusChecks();
  _signedOut = false;
  resumeTripSync();
  const user = data?.user || null;
  const remaining = Number(data?.quota?.remaining ?? 0);
  setCurrentUser(user);
  updateQuota(remaining);

  hideAuthOverlay();
  document.getElementById('guest-banner')?.classList.remove('visible');

  const avatar = document.getElementById('quota-avatar');
  if (avatar && user?.avatar) avatar.src = user.avatar;
  const name = document.getElementById('quota-name');
  if (name) name.textContent = user?.name || '';
  const bar = document.getElementById('quota-bar');
  bar?.classList.add('visible');

  // 登录成功后异步触发行程云同步（不阻塞认证 UI；游客/本地由 trip-sync 内部 isLocalHost 守卫）。
  initTripSync();
  void syncTrips();
}

document.getElementById('btn-login')?.addEventListener('click', showAuthOverlay);
document.getElementById('btn-close-auth')?.addEventListener('click', hideAuthOverlay);
document.getElementById('btn-continue-demo')?.addEventListener('click', () => {
  hideAuthOverlay();
  document.getElementById('btn-guest-demo')?.click();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.getElementById('auth-overlay')?.classList.contains('visible')) {
    hideAuthOverlay();
  }
});

document.getElementById('btn-logout')?.addEventListener('click', async () => {
  _signedOut = true;
  onGuest();
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } catch {
    logger.warn('退出请求失败，已切换到本地游客界面');
  }
});

export function updateQuota(remaining) {
  const normalized = Number.isFinite(remaining) ? Math.max(0, remaining) : 0;
  setQuotaRemaining(normalized);
  const count = document.getElementById('quota-count');
  if (count) count.textContent = String(normalized);
}

export async function detectProxyMode() {
  if (isLocalHost()) return;

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

    const requestEpoch = _authEpoch;
    const requestUserId = currentUser?.id || null;
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
    if (requestEpoch !== _authEpoch || requestUserId !== (currentUser?.id || null)) return resp;
    const remaining = resp.headers.get('X-Quota-Remaining');
    if (remaining) {
      updateQuota(parseInt(remaining, 10));
    }
    if (resp.status === 401) {
      onGuest();
      showAuthOverlay();
    }
    return resp;
  };
}
