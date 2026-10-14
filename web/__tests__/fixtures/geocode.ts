import { test as base, type Page } from '@playwright/test';

export const GEOCODE_TEST_KEY = 'offline-geocode-test-key';
export const GEOCODE_LOCATIONS: Record<string, string> = {
  '杭州:西湖': '120.1484,30.2458',
  '杭州:灵隐寺': '120.1017,30.2414',
  '杭州:河坊街': '120.1700,30.2410',
  '杭州:零坐标景点': '120.1520,30.2510',
  '北京:故宫': '116.3972,39.9163',
};

export interface GeocodeQuery { address: string; city: string; key: string; }
export interface MockGeocoder { queries: GeocodeQuery[]; unavailable(): void; }

/** Mock the actual provider boundary; all other external requests are blocked. */
async function installGeocoder(page: Page): Promise<MockGeocoder> {
  const queries: GeocodeQuery[] = [];
  let available = true;
  await page.addInitScript(key => {
    localStorage.setItem('api-key-amap-geo', key);
    localStorage.setItem('travel-agent-onboarding-done', '1');
  }, GEOCODE_TEST_KEY);
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (['localhost', '127.0.0.1'].includes(url.hostname)) return route.continue();
    return route.abort('blockedbyclient');
  });
  await page.route(/^https:\/\/restapi\.amap\.com\/v3\/geocode\/geo(?:\?|$)/, route => {
    const params = new URL(route.request().url()).searchParams;
    const query = { address: params.get('address') || '', city: params.get('city') || '', key: params.get('key') || '' };
    queries.push(query);
    const location = GEOCODE_LOCATIONS[`${query.city}:${query.address}`];
    if (!available || query.key !== GEOCODE_TEST_KEY || !location) {
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ status: '0', info: 'OFFLINE_PROVIDER_UNAVAILABLE' }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: '1', geocodes: [{ location }] }) });
  });
  return { queries, unavailable() { available = false; } };
}

export const test = base.extend<{ geocoder: MockGeocoder }>({
  geocoder: [async ({ page }, use) => { await use(await installGeocoder(page)); }, { auto: true }],
});
