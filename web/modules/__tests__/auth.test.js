/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const contextMocks = vi.hoisted(() => ({
  setCurrentUser: vi.fn(),
  setQuotaRemaining: vi.fn(),
  setIsProxyMode: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../infra/context.js', () => ({
  currentUser: null,
  setCurrentUser: contextMocks.setCurrentUser,
  setQuotaRemaining: contextMocks.setQuotaRemaining,
  setIsProxyMode: contextMocks.setIsProxyMode,
  showToast: contextMocks.showToast,
  LLM_HOSTS: { 'api.openai.com': 'openai' },
  currentLang: 'zh',
}));
vi.mock('../i18n.js', () => ({ I18N: { zh: { loginRequired: '请先登录' } } }));
vi.mock('../trace.js', () => ({
  addTraceHeaders: vi.fn(() => ({ 'Content-Type': 'application/json' })),
  extractTraceId: vi.fn(),
}));
vi.mock('../logger.js', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
}));
vi.mock('../perf-trace.js', () => ({ traceAsync: vi.fn((_name, fn) => fn()) }));

import { checkAuth, hideAuthOverlay, onAuthenticated, requireAuth, showAuthOverlay, updateQuota } from '../auth.js';

function setHostname(hostname) {
  Object.defineProperty(window, 'location', {
    value: {
      hostname,
      origin: `https://${hostname}`,
      pathname: '/trip',
      search: '?source=test',
      hash: '#day-2',
    },
    configurable: true,
  });
}

describe('production authentication UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = `
      <div id="auth-overlay" style="display:none"></div>
      <div id="guest-banner"></div>
      <div id="quota-bar"></div>
      <img id="quota-avatar" />
      <span id="quota-name"></span>
      <span id="quota-count">0</span>
    `;
    global.fetch = vi.fn();
  });

  afterEach(() => vi.restoreAllMocks());

  it('does not call the production auth endpoint on localhost', async () => {
    setHostname('localhost');
    expect(await checkAuth()).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('hydrates the user and quota after a successful status response', async () => {
    setHostname('example.com');
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        authenticated: true,
        user: { name: '测试用户', avatar: 'https://example.com/avatar.jpg' },
        quota: { remaining: 100 },
      }),
    });

    expect(await checkAuth()).toBe(true);
    expect(contextMocks.setCurrentUser).toHaveBeenCalledWith(expect.objectContaining({ name: '测试用户' }));
    expect(document.getElementById('quota-count').textContent).toBe('100');
    expect(document.getElementById('auth-overlay').style.display).toBe('none');
  });

  it('enters non-blocking guest mode when unauthenticated', async () => {
    setHostname('example.com');
    global.fetch.mockResolvedValue({ ok: false, json: async () => ({ authenticated: false }) });

    expect(await checkAuth()).toBe(false);
    expect(document.getElementById('auth-overlay').style.display).toBe('none');
    expect(document.getElementById('guest-banner').classList.contains('visible')).toBe(true);
  });

  it('fails closed and shows the overlay on a network error', async () => {
    setHostname('example.com');
    global.fetch.mockRejectedValue(new Error('network'));
    expect(await requireAuth()).toBe(false);
    expect(contextMocks.showToast).toHaveBeenCalled();
    expect(document.getElementById('auth-overlay').style.display).toBe('flex');
  });

  it('keeps local development AI requests available without production auth', async () => {
    setHostname('localhost');
    expect(await requireAuth()).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('adds only the current same-origin path to OAuth redirects', () => {
    setHostname('example.com');
    document.getElementById('auth-overlay').innerHTML = `
      <a class="oauth-btn" href="/api/auth/login?provider=github">GitHub</a>`;
    showAuthOverlay();
    const href = document.querySelector('.oauth-btn').getAttribute('href');
    expect(href).toContain('redirect=%2Ftrip%3Fsource%3Dtest%23day-2');
    expect(href).not.toContain('https%3A%2F%2Fexample.com');
  });

  it('lets a keyboard user dismiss the sign-in prompt', () => {
    showAuthOverlay();
    expect(document.getElementById('auth-overlay').classList).toContain('visible');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.getElementById('auth-overlay').classList).not.toContain('visible');
    expect(document.getElementById('auth-overlay').style.display).toBe('none');
    hideAuthOverlay();
  });

  it('updates user-facing elements without rendering HTML', () => {
    onAuthenticated({
      user: { name: '<img src=x>', avatar: 'https://example.com/avatar.jpg' },
      quota: { remaining: 50 },
    });
    expect(document.getElementById('quota-name').textContent).toBe('<img src=x>');
    expect(document.getElementById('quota-name').children).toHaveLength(0);
    expect(document.getElementById('quota-count').textContent).toBe('50');
  });

  it('normalizes quota values', () => {
    updateQuota(-10);
    expect(document.getElementById('quota-count').textContent).toBe('0');
    expect(contextMocks.setQuotaRemaining).toHaveBeenCalledWith(0);
  });
});
