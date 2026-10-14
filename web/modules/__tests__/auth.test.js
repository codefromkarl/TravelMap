/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const contextMocks = vi.hoisted(() => ({ user: null, setCurrentUser: vi.fn(), setQuotaRemaining: vi.fn(), setIsProxyMode: vi.fn(), showToast: vi.fn() }));
const syncMocks = vi.hoisted(() => ({ initTripSync: vi.fn(), syncTrips: vi.fn(), pauseTripSync: vi.fn(), resumeTripSync: vi.fn() }));
vi.mock('../infra/context.js', () => ({
  get currentUser() { return contextMocks.user; },
  setCurrentUser: contextMocks.setCurrentUser, setQuotaRemaining: contextMocks.setQuotaRemaining,
  setIsProxyMode: contextMocks.setIsProxyMode, showToast: contextMocks.showToast,
  LLM_HOSTS: { 'api.openai.com': 'openai' }, currentLang: 'zh',
}));
vi.mock('../infra/trip-sync.js', () => syncMocks);
vi.mock('../i18n.js', () => ({ I18N: { zh: { loginRequired: '请先登录' } } }));
vi.mock('../trace.js', () => ({ addTraceHeaders: vi.fn(() => ({ 'Content-Type': 'application/json' })), extractTraceId: vi.fn() }));
vi.mock('../logger.js', () => ({ createLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })) }));
vi.mock('../perf-trace.js', () => ({ traceAsync: vi.fn((_name, fn) => fn()) }));

let auth;
let checkAuth, hideAuthOverlay, onAuthenticated, requireAuth, showAuthOverlay, updateQuota;
let fetchMock;
function setHostname(hostname) {
  Object.defineProperty(window, 'location', { value: { hostname, origin: `https://${hostname}`, pathname: '/trip', search: '?source=test', hash: '#day-2' }, configurable: true });
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function identity(id = 'user-a', remaining = 100) {
  return { authenticated: true, user: { id, name: '测试用户', avatar: 'https://example.com/avatar.jpg' }, quota: { remaining } };
}
const response = data => ({ ok: true, json: async () => data });
const proxyResponse = (status, remaining) => ({ status, headers: new Headers({ 'X-Quota-Remaining': String(remaining) }) });

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  contextMocks.user = null;
  contextMocks.setCurrentUser.mockImplementation(user => { contextMocks.user = user; });
  setHostname('example.com');
  document.body.innerHTML = `<div id="auth-overlay" style="display:none"></div><div id="guest-banner"></div><div id="quota-bar"></div><img id="quota-avatar"><span id="quota-name"></span><span id="quota-count">0</span><button id="btn-logout"></button>`;
  localStorage.clear();
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;
  auth = await import('../auth.js');
  ({ checkAuth, hideAuthOverlay, onAuthenticated, requireAuth, showAuthOverlay, updateQuota } = auth);
});
afterEach(async () => {
  auth.onGuest();
  await Promise.resolve();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('production authentication UI', () => {
  it('does not call the production auth endpoint on localhost', async () => {
    setHostname('localhost');
    expect(await checkAuth()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('hydrates the user and quota after a successful status response', async () => {
    fetchMock.mockResolvedValue(response(identity()));
    expect(await checkAuth()).toBe(true);
    expect(contextMocks.user.id).toBe('user-a');
    expect(document.getElementById('quota-count').textContent).toBe('100');
    expect(document.getElementById('auth-overlay').style.display).toBe('none');
    expect(syncMocks.resumeTripSync).toHaveBeenCalledTimes(1);
    expect(syncMocks.syncTrips).toHaveBeenCalledTimes(1);
  });
  it('enters non-blocking guest mode when unauthenticated', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ authenticated: false }) });
    expect(await checkAuth()).toBe(false);
    expect(document.getElementById('auth-overlay').style.display).toBe('none');
    expect(document.getElementById('guest-banner').classList.contains('visible')).toBe(true);
  });
  it('fails closed and shows the overlay on a network error', async () => {
    fetchMock.mockRejectedValue(new Error('network'));
    expect(await requireAuth()).toBe(false);
    expect(contextMocks.showToast).toHaveBeenCalled();
    expect(document.getElementById('auth-overlay').style.display).toBe('flex');
  });
  it('keeps local development AI requests available without production auth', async () => {
    setHostname('localhost');
    expect(await requireAuth()).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('adds only the current same-origin path to OAuth redirects', () => {
    document.getElementById('auth-overlay').innerHTML = '<a class="oauth-btn" href="/api/auth/login?provider=github">GitHub</a>';
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
    hideAuthOverlay();
  });
  it('updates user-facing elements without rendering HTML', () => {
    onAuthenticated({ ...identity(), user: { id: 'a', name: '<img src=x>', avatar: 'https://example.com/avatar.jpg' }, quota: { remaining: 50 } });
    expect(document.getElementById('quota-name').textContent).toBe('<img src=x>');
    expect(document.getElementById('quota-name').children).toHaveLength(0);
    expect(document.getElementById('quota-count').textContent).toBe('50');
  });
  it('normalizes quota values', () => {
    updateQuota(-10);
    expect(document.getElementById('quota-count').textContent).toBe('0');
    expect(contextMocks.setQuotaRemaining).toHaveBeenCalledWith(0);
  });
  it.each([null, {}, { id: '' }, { id: '  ' }, { id: 123 }])('fails closed on malformed authenticated identity %j', async user => {
    fetchMock.mockResolvedValue(response({ authenticated: true, user, quota: { remaining: 100 } }));
    expect(await requireAuth()).toBe(false);
    expect(contextMocks.user).toBeNull();
    expect(document.getElementById('quota-count').textContent).toBe('0');
    expect(syncMocks.resumeTripSync).not.toHaveBeenCalled();
  });
  it('cached valid identity avoids another status request', async () => {
    onAuthenticated(identity());
    expect(await requireAuth()).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('bounded shared status reads', () => {
  it('startup and concurrent AI actions share one request and one result', async () => {
    const pending = deferred();
    fetchMock.mockReturnValue(pending.promise);
    const startup = checkAuth();
    const first = requireAuth();
    const second = requireAuth();
    expect(checkAuth()).toBe(startup);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    pending.resolve(response(identity()));
    expect(await Promise.all([startup, first, second])).toEqual([true, true, true]);
    expect(contextMocks.setCurrentUser).toHaveBeenCalledTimes(1);
  });
  it.each(['headers', 'body'])('the 5000ms deadline bounds hung %s even when cancellation is ignored', async stage => {
    vi.useFakeTimers();
    const hanging = deferred();
    fetchMock.mockReturnValue(stage === 'headers' ? hanging.promise : Promise.resolve({ ok: true, json: () => hanging.promise }));
    let settled = false;
    const checked = checkAuth().then(value => { settled = true; return value; });
    await vi.advanceTimersByTimeAsync(4999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await checked).toBe(false);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(document.getElementById('auth-overlay').style.display).toBe('none');
    expect(document.getElementById('guest-banner').classList.contains('visible')).toBe(true);
  });
  it('late timed-out success cannot replace a successful newer retry', async () => {
    vi.useFakeTimers();
    const old = deferred();
    fetchMock.mockReturnValueOnce(old.promise).mockResolvedValueOnce(response(identity('user-b', 77)));
    const first = checkAuth();
    await vi.advanceTimersByTimeAsync(5000);
    expect(await first).toBe(false);
    expect(await checkAuth()).toBe(true);
    old.resolve(response(identity('user-a', 1)));
    await vi.advanceTimersByTimeAsync(0);
    expect(contextMocks.user.id).toBe('user-b');
    expect(document.getElementById('quota-count').textContent).toBe('77');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('malformed JSON fails closed and a later retry can authenticate', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => { throw new Error('bad JSON'); } }).mockResolvedValueOnce(response(identity()));
    expect(await requireAuth()).toBe(false);
    expect(await checkAuth()).toBe(true);
    expect(document.getElementById('auth-overlay').style.display).toBe('none');
  });
  it('invalidated old teardown does not clear a new pending status entry', async () => {
    const old = deferred();
    const current = deferred();
    fetchMock.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const first = checkAuth();
    auth.onGuest();
    const next = checkAuth();
    expect(await first).toBe(false);
    expect(checkAuth()).toBe(next);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    current.resolve(response(identity('user-b', 77)));
    expect(await next).toBe(true);
    old.resolve(response(identity('user-a', 1)));
    await Promise.resolve();
    await Promise.resolve();
    expect(contextMocks.user.id).toBe('user-b');
  });
  it('a new login supersedes an old AI gate without reopening its sign-in prompt', async () => {
    const old = deferred();
    fetchMock.mockReturnValue(old.promise);
    const gate = requireAuth();
    onAuthenticated(identity('user-b', 77));
    expect(await gate).toBe(false);
    old.resolve(response({ authenticated: false }));
    await Promise.resolve();
    expect(contextMocks.user.id).toBe('user-b');
    expect(document.getElementById('auth-overlay').style.display).toBe('none');
    expect(contextMocks.showToast).not.toHaveBeenCalled();
  });
});

describe('logout and proxy identity fences', () => {
  it('logout immediately clears local identity/quota and cancels old status/gates before its request settles', async () => {
    const old = deferred();
    const logout = deferred();
    fetchMock.mockImplementation(url => url === '/api/auth/status' ? old.promise : logout.promise);
    updateQuota(87);
    const gate = requireAuth();
    document.getElementById('btn-logout').click();
    expect(contextMocks.user).toBeNull();
    expect(document.getElementById('quota-count').textContent).toBe('0');
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(await gate).toBe(false);
    expect(document.getElementById('auth-overlay').style.display).toBe('none');
    old.resolve(response(identity()));
    logout.resolve({ ok: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(contextMocks.user).toBeNull();
    expect(contextMocks.showToast).not.toHaveBeenCalled();
  });
  it.each(['pending', 'failed', 'successful'])('fresh auth checks cannot restore the old cookie after %s logout', async state => {
    const logout = deferred();
    fetchMock.mockReturnValue(logout.promise);
    onAuthenticated(identity());
    document.getElementById('btn-logout').click();
    if (state === 'failed') logout.reject(new Error('logout unavailable'));
    if (state === 'successful') logout.resolve({ ok: true });
    await Promise.resolve();
    expect(await checkAuth()).toBe(false);
    expect(await requireAuth()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(contextMocks.user).toBeNull();
    expect(document.getElementById('auth-overlay').style.display).toBe('flex');
    if (state === 'pending') logout.resolve({ ok: true });
  });
  it('an explicit valid new login reopens auth after logout, and old logout completion does not clear it', async () => {
    const logout = deferred();
    fetchMock.mockReturnValue(logout.promise);
    document.getElementById('btn-logout').click();
    onAuthenticated(identity('user-b', 77));
    logout.resolve({ ok: true });
    await Promise.resolve();
    expect(contextMocks.user.id).toBe('user-b');
    expect(await requireAuth()).toBe(true);
    expect(document.getElementById('quota-count').textContent).toBe('77');
    fetchMock.mockResolvedValueOnce(response(identity('user-b', 77)));
    expect(await checkAuth()).toBe(true);
  });
  it.each([200, 401])('old proxy %s cannot update a newer identity quota or sign-in UI', async status => {
    const old = deferred();
    fetchMock.mockReturnValue(old.promise);
    onAuthenticated(identity('user-a', 100));
    await auth.detectProxyMode();
    const request = window.fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', body: '{}' });
    onAuthenticated(identity('user-b', 77));
    old.resolve(proxyResponse(status, 1));
    expect((await request).status).toBe(status);
    expect(contextMocks.user.id).toBe('user-b');
    expect(document.getElementById('quota-count').textContent).toBe('77');
    expect(document.getElementById('auth-overlay').style.display).toBe('none');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/chat');
  });
  it('current proxy 401 cancels pending status and late success cannot hydrate or reopen a dismissed overlay', async () => {
    const status = deferred();
    fetchMock.mockImplementation(url => url === '/api/auth/status' ? status.promise : Promise.resolve(proxyResponse(401, 1)));
    onAuthenticated(identity());
    await auth.detectProxyMode();
    const refresh = checkAuth();
    await window.fetch('https://api.openai.com/v1/chat/completions', { body: '{}' });
    expect(await refresh).toBe(false);
    expect(contextMocks.user).toBeNull();
    expect(document.getElementById('quota-count').textContent).toBe('0');
    expect(document.getElementById('auth-overlay').style.display).toBe('flex');
    hideAuthOverlay();
    status.resolve(response(identity()));
    await Promise.resolve();
    await Promise.resolve();
    expect(contextMocks.user).toBeNull();
    expect(document.getElementById('auth-overlay').style.display).toBe('none');
  });
  it('current proxy success updates only the current identity quota', async () => {
    fetchMock.mockResolvedValue(proxyResponse(200, 42));
    onAuthenticated(identity());
    await auth.detectProxyMode();
    await window.fetch('https://api.openai.com/v1/chat/completions', { body: '{}' });
    expect(contextMocks.user.id).toBe('user-a');
    expect(document.getElementById('quota-count').textContent).toBe('42');
  });
});
