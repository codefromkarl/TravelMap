import { expect, test, type Route } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const hostedUrl = 'http://travelmap.localhost:3456/';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    for (const key of ['travel-agent-onboarding-done', 'travel-agent-cinematic-seen', 'travel-agent-demo-guide-done']) {
      localStorage.setItem(key, '1');
    }
  });
  // All assets are repository-local; external tiles and providers are unnecessary.
  await page.route('**/*', route => {
    const host = new URL(route.request().url()).hostname;
    return host === 'travelmap.localhost' ? route.fallback() : route.abort();
  });
});

test('guest controls are interactive while hosted status is pending, then hydrate a valid user', async ({ page }) => {
  let statusRoute: Route | undefined;
  let statusRequests = 0;
  await page.route('**/api/auth/status', route => {
    statusRequests++;
    statusRoute = route;
  });
  await page.route('**/api/trips', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ userId: 'startup-user', trips: [] }),
  }));
  await page.goto(hostedUrl);
  await expect(page.locator('#map-skeleton')).toHaveCount(0, { timeout: 3000 });
  await expect(page.locator('#guest-banner')).toBeVisible();
  await expect(page.locator('#auth-overlay')).toBeHidden();
  await page.locator('#btn-guest-presets').click();
  await expect(page.locator('#preset-trip-picker')).toBeVisible();
  expect(statusRequests).toBe(1);
  expect(statusRoute).toBeDefined();
  await statusRoute!.fulfill({ contentType: 'application/json', body: JSON.stringify({
    authenticated: true, user: { id: 'startup-user', name: 'Startup user' }, quota: { remaining: 42 },
  }) });
  await expect(page.locator('#quota-name')).toHaveText('Startup user');
  await expect(page.locator('#quota-count')).toHaveText('42');
  await expect(page.locator('#guest-banner')).toBeHidden();
});

test('hung hosted authentication leaves preset history and export usable and custom AI gated', async ({ page }) => {
  let statusRequests = 0;
  let providerRequests = 0;
  await page.route('**/api/auth/status', () => { statusRequests++; });
  await page.route(/\/api\/(?:chat|amap)(?:\?|$)/, route => {
    providerRequests++;
    return route.fulfill({ status: 500, body: 'Guest presets must not call a provider' });
  });
  await page.goto(hostedUrl);
  await expect(page.locator('#map-skeleton')).toHaveCount(0, { timeout: 3000 });
  await page.locator('#btn-guest-presets').click();
  await page.locator('.preset-trip-item').first().click();
  await expect(page.locator('#trip-stats-bar')).toContainText('景点');
  await page.locator('#btn-history-map').click();
  await expect(page.locator('#history-list')).toContainText('杭州三日经典游');
  await page.locator('#btn-close-history').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#btn-export-md').click();
  const downloadPath = await (await downloadPromise).path();
  expect(downloadPath).not.toBeNull();
  expect(await readFile(downloadPath!, 'utf8')).toContain('演示行程');
  const input = page.locator('message-editor textarea').first();
  await expect(input).toBeVisible();
  await input.fill('请帮我调整这个示例行程');
  await input.press('Enter');
  await expect(page.locator('#auth-overlay')).toBeVisible({ timeout: 7000 });
  await expect(page.locator('#trip-stats-bar')).toContainText('景点');
  expect(statusRequests).toBeGreaterThanOrEqual(1);
  expect(providerRequests).toBe(0);
});

test('failed logout keeps the guest state even when the server cookie would still authenticate', async ({ page }) => {
  let providerRequests = 0;
  await page.route('**/api/auth/status', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({
      authenticated: true, user: { id: 'logout-user', name: 'Logout user' }, quota: { remaining: 99 },
    }),
  }));
  await page.route('**/api/trips', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ userId: 'logout-user', trips: [] }),
  }));
  await page.route('**/api/auth/logout', route => route.abort('failed'));
  await page.route('**/api/chat', route => {
    providerRequests++;
    return route.fulfill({ status: 500, body: 'Signed-out AI action must be denied' });
  });
  await page.goto(hostedUrl);
  await expect(page.locator('#quota-name')).toHaveText('Logout user');
  await page.locator('#btn-logout').click();
  await expect(page.locator('#guest-banner')).toBeVisible();
  await expect(page.locator('#quota-count')).toHaveText('0');
  await page.locator('.quick-prompt[data-prompt]').first().click();
  await expect(page.locator('#auth-overlay')).toBeVisible();
  await expect(page.locator('#guest-banner')).toBeVisible();
  expect(providerRequests).toBe(0);
});
