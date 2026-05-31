import { setCurrentUser, setQuotaRemaining, setIsProxyMode, showToast, LLM_HOSTS, currentLang } from '../infra/context.js';
import { I18N } from '../i18n.js';
import { addTraceHeaders, extractTraceId } from '../trace.js';
import { createLogger } from '../logger.js';
import { traceAsync } from '../perf-trace.js';

const logger = createLogger('auth');

const PROXY_BASE = '/api/chat';

export const authOverlay = document.getElementById('auth-overlay');
export const quotaBar = document.getElementById('quota-bar');

export async function checkAuth() {
  // 不检查登录，直接返回
  return false;
}

export async function requireAuth() {
  return true;
}

export function onAuthenticated() {}

export function updateQuota() {}

export async function detectProxyMode() {
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (isLocal) return;
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

    // 代理到后端 API，但不覆盖 _provider（让用户选择的 provider 保持不变）
    console.log(`[Proxy] → /api/chat (host: ${matchedProvider})`);
    logger.info(`代理请求: ${matchedProvider}`);
    const traceHeaders = addTraceHeaders({ 'Content-Type': 'application/json' });
    const resp = await traceAsync('api-chat-proxy', async () => {
      return await origFetch.call(this, PROXY_BASE, {
        ...init,
        method: 'POST',
        headers: traceHeaders,
        body: init?.body,
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
    return resp;
  };
}
