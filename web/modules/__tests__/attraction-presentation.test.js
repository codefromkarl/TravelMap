/** @vitest-environment jsdom */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAttractionPopup, formatAttractionPrice } from '../ui/attraction-presentation.js';
import { I18N } from '../i18n.js';
import { generateTripPoster } from '../share.js';
import { addAttractionPreview, initPageMap } from '../map.js';
import { routePlanner } from '../route-planner.js';

const _location = { latitude: 30.2458, longitude: 120.1484 };
const _untrusted = {
  name: '<img src=x onerror="alert(1)">',
  description: '<script>alert(2)</script>',
  address: '</div><iframe src=x>',
  tips: '" onclick="alert(3)',
  visitDuration: '<svg onload=alert(4)>',
  ticketPrice: null,
  images: [{ url: 'javascript:alert(5)' }],
  location: _location,
};
const _marker = () => ({
  bindPopup: vi.fn().mockReturnThis(), addTo: vi.fn().mockReturnThis(), on: vi.fn().mockReturnThis(),
  openPopup: vi.fn(), closePopup: vi.fn(), isPopupOpen: vi.fn(() => false),
});

beforeAll(async () => {
  const map = {
    setView: vi.fn(), fitBounds: vi.fn(), removeLayer: vi.fn(), invalidateSize: vi.fn(), panTo: vi.fn(),
    on: vi.fn(), getZoom: vi.fn(() => 12), getCenter: vi.fn(() => ({ lat: 30, lng: 120 })),
  };
  vi.stubGlobal('L', {
    map: vi.fn(() => map), marker: vi.fn(_marker), divIcon: vi.fn(),
    tileLayer: vi.fn(() => ({ addTo: vi.fn() })), polyline: vi.fn(() => ({ addTo: vi.fn() })), control: { zoom: vi.fn(() => ({ addTo: vi.fn() })) },
  });
  document.body.innerHTML = '<div id="page-map-container"></div><input id="map-search-input">';
  window._lastTripPlan = null;
  vi.useFakeTimers();
  initPageMap();
  await vi.advanceTimersByTimeAsync(80);
  vi.useRealTimers();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(routePlanner, 'planDayRoutes').mockReturnValue([]);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('attraction popup trust boundary', () => {
  it.each([null, undefined, NaN, Infinity, -1, '0'])('labels unknown or invalid price %j as unverified', (value) => {
    expect(formatAttractionPrice(value, I18N.en)).toBe(I18N.en.attractionPriceUnknown);
  });

  it('only known numeric zero is free and known positive price keeps its value', () => {
    expect(formatAttractionPrice(0, I18N.en)).toBe('Free');
    expect(formatAttractionPrice(60, I18N.en)).toBe('¥60');
  });

  it('escapes all attraction text and rejects active image URLs', () => {
    const container = document.createElement('div');
    container.innerHTML = buildAttractionPopup(_untrusted, '<svg onload=alert(6)>', I18N.zh);
    expect(container.querySelector('img,script,iframe,svg')).toBeNull();
    expect(container.querySelector('.popup-title').textContent).toBe(_untrusted.name);
    expect(container.querySelector('.popup-desc').textContent).toBe(_untrusted.description);
    expect(container.querySelector('.popup-meta').textContent).toContain(I18N.zh.attractionPriceUnknown);
    expect(container.querySelector('.popup-meta').textContent).not.toContain('免费');
  });

  it('renders HTTP images without allowing quoted attributes to inject events', () => {
    const container = document.createElement('div');
    container.innerHTML = buildAttractionPopup({ name: '地点', images: [{ url: 'https://example.test/a%22onerror%3Dalert(1).png' }] }, '城市', I18N.zh);
    expect(container.querySelector('img')).not.toBeNull();
    expect(container.querySelector('img').hasAttribute('onerror')).toBe(false);
  });

  it.each(['static', 'animated', 'preview'])('actual %s map path renders safe unverified attraction details', async (mode) => {
    const trip = { city: '杭州', days: [{ city: '杭州', date: '2026-10-13', attractions: [_untrusted] }] };
    if (mode === 'preview') addAttractionPreview([_untrusted], trip.city);
    else if (mode === 'static') await window._renderTripOnMap(trip);
    else {
      vi.useFakeTimers();
      const promise = window._renderTripAnimated(trip);
      await vi.runAllTimersAsync();
      await promise;
    }
    // Animated rendering also creates a temporary day label; inspect the actual attraction popup.
    const popupMarkers = L.marker.mock.results.map(result => result.value).filter(marker => marker.bindPopup.mock.calls.length);
    expect(popupMarkers).toHaveLength(1);
    const marker = popupMarkers[0];
    const container = document.createElement('div');
    container.innerHTML = marker.bindPopup.mock.calls[0][0];
    expect(container.querySelector('img,script,iframe,svg')).toBeNull();
    expect(container.querySelector('.popup-title').textContent).toBe(_untrusted.name);
    expect(container.textContent).toContain(I18N.zh.attractionPriceUnknown);
  });

  it.each(['static', 'animated'])('actual %s route, waypoint, supply, hotel and restaurant popups escape dynamic fields', async (mode) => {
    const attack = '<img src=x onerror=alert(1)>';
    const attraction = {
      name: '真实景点', location: _location, selectedRouteId: 'r',
      routes: [{ id: 'r', riskAssessment: { maxElevation: 100 }, waypoints: [
        { name: attack, elevation: attack, visitDuration: attack, location: _location,
          supplyPoints: [{ name: attack, type: attack, estimatedCost: 10, location: _location, locationAccuracy: 'exact' }] },
        { name: attack, location: { latitude: 30.246, longitude: 120.15 } },
      ] }],
    };
    const trip = { city: '杭州', days: [{ city: '杭州', attractions: [attraction],
      meals: [{ restaurant: { name: attack, rating: attack, averageCost: attack, cuisine: attack, address: attack, signature: attack, location: _location } }],
      hotel: { name: attack, address: attack, priceRange: attack, rating: attack, location: _location },
    }] };
    if (mode === 'static') await window._renderTripOnMap(trip);
    else {
      vi.useFakeTimers();
      const result = window._renderTripAnimated(trip);
      await vi.runAllTimersAsync();
      await result;
    }
    const popups = L.marker.mock.results.flatMap(result => result.value.bindPopup.mock.calls.map(call => call[0]));
    expect(popups).toHaveLength(6); // attraction, two waypoints, supply, restaurant, hotel
    for (const html of popups) {
      const container = document.createElement('div');
      container.innerHTML = html;
      expect(container.querySelector('img,script,iframe,svg')).toBeNull();
    }
    expect(popups.filter(html => html.includes('&lt;img'))).toHaveLength(5);
  });

  it.each(['amap', 'nominatim'])('manual %s search keeps malicious provider names/addresses inert', async (source) => {
    const attack = '<img src=x onerror=alert(1)>';
    localStorage.setItem('api-key-amap-geo', source === 'amap' ? 'mock-key' : '');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ json: async () => source === 'amap'
      ? { status: '1', pois: [{ name: attack, address: attack, type: '风景名胜', location: '120.1484,30.2458' }] }
      : [{ lat: '30.2458', lon: '120.1484', display_name: attack }] });
    const input = document.getElementById('map-search-input');
    input.value = `${source}-malicious-provider`;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await vi.waitFor(() => expect(L.marker).toHaveBeenCalledTimes(1));
    const html = L.marker.mock.results[0].value.bindPopup.mock.calls[0][0];
    const container = document.createElement('div');
    container.innerHTML = html;
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain(attack);
    localStorage.removeItem('api-key-amap-geo');
  });
});

describe('share poster unknown admission prices', () => {
  it('keeps unknown admission unverified, numeric zero free, and rejects unsafe images', async () => {
    const context = new Proxy({
      fillText: vi.fn(),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    }, { get: (target, key) => key in target ? target[key] : (target[key] = vi.fn()) });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,mocked');
    const imageSpy = vi.spyOn(window, 'Image');
    const trip = { city: '杭州', days: [{ city: '杭州', attractions: [
      { ..._untrusted, name: '待核实门票', ticketPrice: null },
      { name: '确认免费', ticketPrice: 0 },
      { name: '收费地点', ticketPrice: 60 },
    ] }] };
    expect(await generateTripPoster(trip)).toBe('data:image/png;base64,mocked');
    const text = context.fillText.mock.calls.map(call => call[0]);
    expect(text).toContain(`🎫${I18N.zh.attractionPriceUnknown}`);
    expect(text).toContain('🎫免费');
    expect(text).toContain('🎫¥60');
    expect(imageSpy).not.toHaveBeenCalled();
  });
});
