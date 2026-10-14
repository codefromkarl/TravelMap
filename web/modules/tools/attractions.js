import { Type } from '@earendil-works/pi-ai';
import { currentLang } from '../context.js?v=4';
import { I18N } from '../i18n.js';

const _LOOKUP_TIMEOUT_MS = 10_000;

/** Parse Amap's longitude,latitude pair without converting GCJ-02 coordinates. */
function _parseLocation(value) {
  if (typeof value !== 'string' || !/^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/.test(value)) return null;
  const [longitude, latitude] = value.split(',').map(Number);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)
    || Math.abs(longitude) > 180 || Math.abs(latitude) > 90
    || (longitude === 0 && latitude === 0)) return null;
  return { latitude, longitude };
}

function _text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function _markdownText(value) {
  return String(value ?? '').replace(/[\\`*_{}\[\]()#+.!|<>]/g, '\\$&').replace(/[\r\n]/g, ' ');
}

function _result(city, queriedAt, attractions, status, error, rejectedCount = 0) {
  const t = I18N[currentLang] || I18N.zh;
  const title = t.attractionSearchTitle.replace('{city}', _markdownText(city));
  const source = t.attractionSearchSource.replace('{time}', queriedAt);
  const lines = attractions.map((attraction, index) =>
    `${index + 1}. ${_markdownText(attraction.name)} — ${t.attractionPriceUnknown}\n   ${_markdownText(attraction.address)}`,
  );
  const summary = status === 'available' ? lines.join('\n\n')
    : status === 'empty' ? t.attractionSearchEmpty : t.attractionSearchUnavailable;
  return {
    content: [{ type: 'text', text: `## ${title}\n\n${source}\n\n${summary}` }],
    details: {
      city,
      attractions,
      status,
      source: 'amap',
      coordinateSystem: 'gcj02',
      queriedAt,
      fetchedAt: queriedAt,
      isSynthetic: false,
      rejectedCount,
      ...(error ? { error: { code: error } } : {}),
    },
  };
}

// Guest presets do not execute this tool; only custom generation requests do.
export const searchAttractionsTool = {
  name: 'search_attractions',
  label: '景点搜索',
  description: '搜索指定城市的真实景点；仅使用高德返回的位置，门票与游览时间需另行核实',
  parameters: Type.Object({
    city: Type.String({ description: '城市名称' }),
    preferences: Type.Optional(Type.Array(Type.String())),
    keywords: Type.Optional(Type.String()),
  }),
  /**
   * @param {string} _id
   * @param {{city: string, keywords?: string, preferences?: string[]}} params
   * @param {AbortSignal} [signal]
   * @returns {Promise<{content: object[], details: object}>}
   */
  execute: async (_id, params = {}, signal) => {
    const city = _text(params.city);
    const queriedAt = new Date().toISOString();
    const keywords = _text(params.keywords);
    if (!city || city.length > 100 || keywords.length > 200
      || (params.keywords !== undefined && typeof params.keywords !== 'string')) {
      return _result(city, queriedAt, [], 'unavailable', 'INVALID_REQUEST');
    }

    const controller = new AbortController();
    const cancel = () => controller.abort(signal?.reason);
    if (signal?.aborted) cancel();
    else signal?.addEventListener('abort', cancel, { once: true });
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, _LOOKUP_TIMEOUT_MS);
    try {
      // Already cancelled calls must not start a request, even in mocked runtimes.
      if (controller.signal.aborted) return _result(city, queriedAt, [], 'unavailable', 'CANCELLED');
      const response = await fetch('/api/amap', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: 'place/text',
          params: {
            city,
            citylimit: 'true',
            types: '110000',
            offset: '20',
            extensions: 'all',
            ...(keywords ? { keywords } : {}),
          },
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const code = response.status === 401 ? 'AUTH_REQUIRED'
          : response.status === 429 ? 'RATE_LIMITED'
          : response.status === 503 ? 'SOURCE_UNAVAILABLE' : 'HTTP_ERROR';
        return _result(city, queriedAt, [], 'unavailable', code);
      }
      const data = await response.json();
      if (controller.signal.aborted) return _result(city, queriedAt, [], 'unavailable', timedOut ? 'TIMEOUT' : 'CANCELLED');
      if (data?.status !== '1' || !Array.isArray(data.pois)) {
        return _result(city, queriedAt, [], 'unavailable', 'INVALID_PROVIDER_RESPONSE');
      }
      // Bound processing as well as the request. No absent fields are synthesized.
      const pois = data.pois.slice(0, 20);
      const attractions = pois.flatMap((poi) => {
        const location = _parseLocation(poi?.location);
        const name = _text(poi?.name);
        if (!location || !name) return [];
        return [{
          id: _text(poi.id),
          name,
          nameZh: name,
          city: _text(poi.cityname) || city,
          address: _text(poi.address),
          description: _text(poi.type),
          location,
          ticketPrice: null,
          visitDuration: null,
          source: 'amap',
          coordinateSystem: 'gcj02',
          queriedAt,
          fetchedAt: queriedAt,
          isSynthetic: false,
        }];
      });
      const rejectedCount = pois.length - attractions.length;
      if (pois.length > 0 && attractions.length === 0) {
        return _result(city, queriedAt, [], 'unavailable', 'NO_VALID_POIS', rejectedCount);
      }
      return _result(city, queriedAt, attractions, attractions.length ? 'available' : 'empty', undefined, rejectedCount);
    } catch {
      return _result(city, queriedAt, [], 'unavailable',
        timedOut ? 'TIMEOUT' : signal?.aborted ? 'CANCELLED' : 'FETCH_ERROR');
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', cancel);
    }
  },
};
