/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { marked } from 'marked';
import { server } from '../../../src/__tests__/mocks/server.js';
import { searchAttractionsTool } from '../tools/attractions.js';

const _poi = {
  id: 'B000A8UIN8',
  name: '故宫博物院',
  address: '景山前街4号',
  cityname: '北京市',
  type: '风景名胜;公园广场',
  location: '116.3972,39.9163',
  biz_ext: { cost: '60' }, // Provider cost is not a verified attraction ticket price.
};

function _provider(data, status = 200) {
  server.use(http.post('*/api/amap', () => HttpResponse.json(data, { status })));
}

function _pendingFetch(_url, options) {
  return new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });
}

describe('real browser attraction lookup', () => {
  beforeEach(() => {
    // Node fetch needs an absolute URL; production still sends the same-origin path.
    const nativeFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn((url, options) => nativeFetch(new URL(url, window.location.href), options)));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('queries the credentialed same-origin proxy and preserves provider GCJ-02 coordinates', async () => {
    let requestBody;
    server.use(http.post('*/api/amap', async ({ request }) => {
      requestBody = await request.json();
      return HttpResponse.json({ status: '1', pois: [_poi] });
    }));
    const result = await searchAttractionsTool.execute('id', { city: ' 北京 ', keywords: ' 博物馆 ' });
    expect(fetch).toHaveBeenCalledWith('/api/amap', expect.objectContaining({
      method: 'POST', credentials: 'same-origin', signal: expect.any(AbortSignal),
    }));
    expect(requestBody).toEqual({
      endpoint: 'place/text',
      params: { city: '北京', citylimit: 'true', types: '110000', offset: '20', extensions: 'all', keywords: '博物馆' },
    });
    expect(result.details).toMatchObject({ city: '北京', status: 'available', source: 'amap', coordinateSystem: 'gcj02', isSynthetic: false, rejectedCount: 0 });
    expect(result.details.attractions).toHaveLength(1);
    expect(result.details.attractions[0]).toMatchObject({
      id: _poi.id, name: _poi.name, location: { latitude: 39.9163, longitude: 116.3972 },
      ticketPrice: null, visitDuration: null, source: 'amap', coordinateSystem: 'gcj02', isSynthetic: false,
    });
    expect(Number.isNaN(Date.parse(result.details.queriedAt))).toBe(false);
    expect(result.details.attractions[0].queriedAt).toBe(result.details.queriedAt);
    expect(result.content[0].text).not.toContain('¥0');
  });

  it('treats provider names, addresses and city text as plain Markdown rather than active links or HTML', async () => {
    const attack = '[click](javascript:alert(1)) <img src=x onerror=alert(2)>';
    _provider({ status: '1', pois: [{ ..._poi, name: attack, address: attack }] });
    const result = await searchAttractionsTool.execute('id', { city: attack });
    const html = marked.parse(result.content[0].text);
    expect(html).not.toMatch(/<a\b|<img\b/);
    expect(result.details.attractions[0].name).toBe(attack);
    expect(result.details.attractions[0].address).toBe(attack);
  });

  it('returns empty provider data without inventing attractions for an unknown city', async () => {
    _provider({ status: '1', pois: [] });
    const result = await searchAttractionsTool.execute('id', { city: '未知城市' });
    expect(result.details).toMatchObject({ status: 'empty', attractions: [], isSynthetic: false });
    expect(result.content[0].text).not.toMatch(/未知城市(?:博物馆|老街|公园)/);
  });

  it('filters invalid POIs while keeping exact coordinates of valid POIs', async () => {
    _provider({ status: '1', pois: [_poi, { ..._poi, location: 'NaN,39' }, { ..._poi, location: [116, 39] }, { ..._poi, location: undefined }, { ..._poi, name: '' }, null] });
    const result = await searchAttractionsTool.execute('id', { city: '北京' });
    expect(result.details.attractions).toHaveLength(1);
    expect(result.details.rejectedCount).toBe(5);
  });

  it.each(['', '0,0', '181,30', '116,91', ',30', '116,', '0x74,30', '116,30,99'])('rejects unusable provider coordinates %j without fallback', async (location) => {
    _provider({ status: '1', pois: [{ ..._poi, location }] });
    const result = await searchAttractionsTool.execute('id', { city: '北京' });
    expect(result.details).toMatchObject({ status: 'unavailable', attractions: [], error: { code: 'NO_VALID_POIS' } });
  });

  it.each([
    { status: '0', info: 'INVALID_USER_KEY', pois: [_poi] },
    { status: '1', pois: {} },
    { pois: [_poi] },
    null,
  ])('rejects invalid or failed provider responses %j', async (data) => {
    _provider(data);
    const result = await searchAttractionsTool.execute('id', { city: '北京' });
    expect(result.details).toMatchObject({ status: 'unavailable', attractions: [], error: { code: 'INVALID_PROVIDER_RESPONSE' } });
    expect(result.content[0].text).not.toContain('INVALID_USER_KEY');
  });

  it.each([[401, 'AUTH_REQUIRED'], [503, 'SOURCE_UNAVAILABLE'], [429, 'RATE_LIMITED'], [502, 'HTTP_ERROR']])('returns unavailable for proxy HTTP %i', async (status, code) => {
    _provider({ error: 'sensitive-provider-detail' }, status);
    const result = await searchAttractionsTool.execute('id', { city: '北京' });
    expect(result.details).toMatchObject({ status: 'unavailable', attractions: [], error: { code } });
    expect(result.content[0].text).not.toContain('sensitive-provider-detail');
  });

  it('returns unavailable on network failure', async () => {
    server.use(http.post('*/api/amap', () => HttpResponse.error()));
    const result = await searchAttractionsTool.execute('id', { city: '北京' });
    expect(result.details).toMatchObject({ status: 'unavailable', attractions: [], error: { code: 'FETCH_ERROR' } });
  });

  it('returns unavailable on malformed JSON', async () => {
    server.use(http.post('*/api/amap', () => new HttpResponse('{')));
    const result = await searchAttractionsTool.execute('id', { city: '北京' });
    expect(result.details).toMatchObject({ status: 'unavailable', attractions: [], error: { code: 'FETCH_ERROR' } });
  });

  it.each([{}, { city: '' }, { city: 'x'.repeat(101) }, { city: '北京', keywords: 123 }, { city: '北京', keywords: 'x'.repeat(201) }])('rejects invalid input without contacting the proxy: %j', async (params) => {
    const result = await searchAttractionsTool.execute('id', params);
    expect(result.details.error.code).toBe('INVALID_REQUEST');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not contact the proxy for a cancelled tool', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await searchAttractionsTool.execute('id', { city: '北京' }, controller.signal);
    expect(result.details.error.code).toBe('CANCELLED');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('cancels an in-flight request and returns no partial attractions', async () => {
    vi.stubGlobal('fetch', vi.fn(_pendingFetch));
    const controller = new AbortController();
    const resultPromise = searchAttractionsTool.execute('id', { city: '北京' }, controller.signal);
    controller.abort();
    expect((await resultPromise).details).toMatchObject({ attractions: [], error: { code: 'CANCELLED' } });
  });

  it('aborts hung requests after the bounded timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(_pendingFetch));
    const resultPromise = searchAttractionsTool.execute('id', { city: '北京' });
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await resultPromise).details).toMatchObject({ attractions: [], error: { code: 'TIMEOUT' } });
    expect(vi.getTimerCount()).toBe(0);
  });
});
