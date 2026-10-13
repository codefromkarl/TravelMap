/** @vitest-environment jsdom */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initPageMap } from '../map.js';
import { focusMarker } from '../anchor-link.js';
import { routePlanner } from '../route-planner.js';

vi.mock('../coord-cache.js', () => ({ getCachedCoord: vi.fn(async () => null), setCachedCoord: vi.fn(async () => {}) }));
const layers = new Set();
let map;
let fetchMock;
const plan = (names, missing = false) => ({ city: '杭州', days: [{ city: '杭州', attractions: names.map((name, index) => ({ name, location: missing ? null : { latitude: 30.25 + index * 0.01, longitude: 120.15 + index * 0.01 } })) }] });
const displayed = () => [...layers].filter(layer => String(layer.options?.icon?.options?.html).includes('attraction-marker'));
const names = () => displayed().map(marker => marker.popup);

beforeAll(async () => {
  map = { setView: vi.fn(), fitBounds: vi.fn(), removeLayer: vi.fn(layer => layers.delete(layer)), invalidateSize: vi.fn(), panTo: vi.fn(), closePopup: vi.fn(), on: vi.fn(), getZoom: vi.fn(() => 12), getCenter: vi.fn(() => ({ lat: 30, lng: 120 })) };
  vi.stubGlobal('L', {
    map: vi.fn(() => map), divIcon: vi.fn(options => ({ options })),
    marker: vi.fn((point, options) => ({
      point, options, popup: '', bindPopup: vi.fn(function(html) { this.popup = html; return this; }),
      addTo: vi.fn(function() { layers.add(this); return this; }), on: vi.fn().mockReturnThis(),
      getLatLng: vi.fn(() => ({ lat: point[0], lng: point[1] })), openPopup: vi.fn(), closePopup: vi.fn(), isPopupOpen: vi.fn(() => false),
    })),
    tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
    polyline: vi.fn(() => ({ addTo: vi.fn(function() { layers.add(this); return this; }) })),
    control: { zoom: vi.fn(() => ({ addTo: vi.fn() })) },
  });
  document.body.innerHTML = '<div id="page-map-container"></div><div id="status-attractions"></div>';
  window._lastTripPlan = null;
  vi.useFakeTimers();
  initPageMap();
  await vi.advanceTimersByTimeAsync(80);
  vi.useRealTimers();
});

beforeEach(async () => {
  localStorage.clear();
  vi.spyOn(routePlanner, 'planDayRoutes').mockReturnValue([]);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  await window._renderTripOnMap(plan([]));
  vi.clearAllMocks();
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

async function select(trip, mode = 'static') {
  window._lastTripPlan = trip;
  await window[mode === 'static' ? '_renderTripOnMap' : '_renderTripAnimated'](trip);
}

describe('itinerary replacement through actual map entrypoints', () => {
  it('serial A to B replaces markers and anchor registry without querying complete coordinates', async () => {
    const first = plan(['A1', 'A2']);
    const latest = plan(['B']);
    await select(first);
    expect(displayed()).toHaveLength(2);
    await select(latest);
    expect(displayed()).toHaveLength(1);
    expect(names()[0]).toContain('B');
    expect(names()[0]).not.toContain('A1');
    expect(focusMarker('A1')).toBe(false);
    expect(focusMarker('B')).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(first.days[0].attractions[0].location).toEqual({ latitude: 30.25, longitude: 120.15 });
  });

  it.each(['static', 'animated'])('late %s geocode cannot replace a newer B selection', async mode => {
    localStorage.setItem('api-key-amap-geo', 'test-key');
    let resolveGeocode;
    fetchMock.mockImplementation(() => new Promise(resolve => { resolveGeocode = resolve; }));
    const old = plan(['old A'], true);
    const oldRender = select(old, mode);
    await vi.waitFor(() => expect(resolveGeocode).toBeTypeOf('function'));
    await select(plan(['B1', 'B2']));
    resolveGeocode({ ok: true, json: async () => ({ status: '1', geocodes: [{ location: '120.16,30.26' }] }) });
    await oldRender;
    expect(displayed()).toHaveLength(2);
    expect(names().join(' ')).toContain('B1');
    expect(names().join(' ')).not.toContain('old A');
    expect(focusMarker('old A')).toBe(false);
    expect(old.days[0].attractions[0].location).toBeNull();
    expect(document.getElementById('status-attractions').textContent).toContain('2');
  });

  it('a superseded animation stops after its pending delay and cannot publish its next marker/status', async () => {
    vi.useFakeTimers();
    const oldRender = select(plan(['old A1', 'old A2']), 'animated');
    await vi.advanceTimersByTimeAsync(51);
    expect(displayed()).toHaveLength(1);
    await select(plan(['B']));
    await vi.runAllTimersAsync();
    await oldRender;
    expect(displayed()).toHaveLength(1);
    expect(names()[0]).toContain('B');
    expect(L.marker.mock.results.map(result => result.value.popup).join(' ')).not.toContain('old A2');
    expect(window._isTripAnimationRunning()).toBe(false);
    expect(focusMarker('old A1')).toBe(false);
    expect(focusMarker('B')).toBe(true);
  });

  it('late route responses cannot append old paths or replace B status', async () => {
    localStorage.setItem('api-key-amap-geo', 'test-key');
    routePlanner.planDayRoutes.mockImplementation(day => day.attractions);
    let resolveRoute;
    fetchMock.mockImplementation(() => new Promise(resolve => { resolveRoute = resolve; }));
    const oldRender = select(plan(['A1', 'A2']));
    await vi.waitFor(() => expect(resolveRoute).toBeTypeOf('function'));
    await select(plan(['B']));
    resolveRoute({ ok: true, json: async () => ({ status: '1', route: { paths: [{ steps: [{ polyline: '120.15,30.25;120.16,30.26' }] }] } }) });
    await oldRender;
    expect(displayed()).toHaveLength(1);
    expect(names()[0]).toContain('B');
    expect(L.polyline).not.toHaveBeenCalled();
    expect(document.getElementById('status-attractions').textContent).toContain('1');
  });
});
