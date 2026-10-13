import { expect, test, type Route } from '@playwright/test';
import { spawn, type ChildProcess } from 'child_process';
import { createServer } from 'net';

let server: ChildProcess;
let port = 0;

test.beforeAll(async () => {
  port = await new Promise<number>(resolve => {
    const socket = createServer();
    socket.listen(0, () => { const value = (socket.address() as { port: number }).port; socket.close(() => resolve(value)); });
  });
  server = spawn('python3', ['-m', 'http.server', String(port), '--directory', 'web'], { cwd: process.cwd(), stdio: 'ignore' });
  await new Promise(resolve => setTimeout(resolve, 800));
});
test.afterAll(() => server?.kill());

test.beforeEach(async ({ page }) => {
  // Use production source modules and native Leaflet; bundle rebuilding belongs to release owner.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'localhost') return route.abort('blockedbyclient');
    if (url.pathname === '/map-render-test') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><script>window.process={env:{},versions:{},browser:true}</script><script type="importmap">{"imports":{"marked":"/pi-bundle.js"}}</script><link rel="stylesheet" href="/vendor/leaflet/leaflet.css"><script src="/vendor/leaflet/leaflet.js"></script><div id="page-map-container" style="height:500px;width:800px"></div><div id="status-attractions"></div>` });
    return route.continue();
  });
  await page.goto(`http://localhost:${port}/map-render-test`);
  await page.evaluate(async () => { const map = await import('/modules/ui/map.js'); map.initPageMap(); });
  await page.waitForFunction(() => Boolean(window._pageMapInstance));
});

test('actual static A to B selection replaces markers without provider lookup or manual layer cleanup', async ({ page }) => {
  let queries = 0;
  await page.route('**/v3/geocode/geo**', route => { queries++; return route.abort(); });
  const result = await page.evaluate(async () => {
    const trip = (names: string[]) => ({ city: '杭州', days: [{ city: '杭州', attractions: names.map((name, index) => ({ name, location: { latitude: 30.25 + index * 0.01, longitude: 120.15 + index * 0.01 } })) }] });
    const first = trip(['A1', 'A2']);
    window._lastTripPlan = first;
    await window._renderTripOnMap(first);
    const countA = document.querySelectorAll('.attraction-marker').length;
    const next = trip(['B']);
    window._lastTripPlan = next;
    await window._renderTripOnMap(next);
    const countB = document.querySelectorAll('.attraction-marker').length;
    (document.querySelector('.attraction-marker') as HTMLElement).click();
    const popup = document.querySelector('.leaflet-popup-content')?.textContent;
    const anchors = await import('/modules/anchor-link.js');
    return { countA, countB, popup, oldRegistered: anchors.focusMarker('A1'), nextRegistered: anchors.focusMarker('B'), coordinates: first.days[0].attractions.map(item => item.location) };
  });
  expect(result.countA).toBe(2);
  expect(result.countB).toBe(1);
  expect(result.popup).toContain('B');
  expect(result.oldRegistered).toBe(false);
  expect(result.nextRegistered).toBe(true);
  expect(result.coordinates).toEqual([{ latitude: 30.25, longitude: 120.15 }, { latitude: 30.26, longitude: 120.16000000000001 }]);
  expect(queries).toBe(0);
});

for (const mode of ['static', 'animated']) {
  test(`deferred old ${mode} geocode cannot overwrite native Leaflet B selection`, async ({ page }) => {
    let pending: Route | undefined;
    await page.route('**/v3/geocode/geo**', route => { pending = route; });
    const oldRender = page.evaluate(async mode => {
      localStorage.setItem('api-key-amap-geo', 'offline-test-key');
      const old = { city: '杭州', days: [{ city: '杭州', attractions: [{ name: 'old A', location: null }] }] };
      window._lastTripPlan = old;
      await window[mode === 'static' ? '_renderTripOnMap' : '_renderTripAnimated'](old);
    }, mode);
    await expect.poll(() => Boolean(pending)).toBe(true);
    await page.evaluate(async () => {
      const next = { city: '杭州', days: [{ city: '杭州', attractions: [{ name: 'B', location: { latitude: 30.25, longitude: 120.15 } }] }] };
      window._lastTripPlan = next;
      await window._renderTripOnMap(next);
    });
    await pending!.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: '1', geocodes: [{ location: '120.16,30.26' }] }) });
    await oldRender;
    const result = await page.evaluate(() => {
      const count = document.querySelectorAll('.attraction-marker').length;
      (document.querySelector('.attraction-marker') as HTMLElement).click();
      return { count, popup: document.querySelector('.leaflet-popup-content')?.textContent, status: document.getElementById('status-attractions')?.textContent, current: window._lastTripPlan.days[0].attractions[0].name };
    });
    expect(result.count).toBe(1);
    expect(result.popup).toContain('B');
    expect(result.popup).not.toContain('old A');
    expect(result.status).toContain('1');
    expect(result.current).toBe('B');
  });
}
