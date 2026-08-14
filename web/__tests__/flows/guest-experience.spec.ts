import { expect, test } from '@playwright/test';

const productionLikeUrl = 'http://travelmap.localhost:3456/';

test.describe('guest preset experience', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('travel-agent-onboarding-done', '1');
    });
    await page.route('**/api/auth/status', route => route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false }),
    }));
  });

  test('guest can inspect the full preset flow before AI sign-in', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'full map flow uses the desktop split view');
    let chatRequests = 0;
    await page.route('**/api/chat', route => {
      chatRequests += 1;
      return route.fulfill({ status: 500, body: 'guest demo must not call AI' });
    });

    await page.goto(productionLikeUrl);

    await expect(page.locator('#guest-banner')).toBeVisible();
    await expect(page.locator('#auth-overlay')).toBeHidden();
    await expect(page.locator('#btn-login')).toBeVisible();

    await page.locator('.quick-prompt[data-prompt]').first().click();
    await expect(page.locator('#auth-overlay')).toBeVisible();
    expect(chatRequests).toBe(0);

    await page.locator('#btn-continue-demo').click();
    await expect(page.locator('#preset-trip-picker')).toBeVisible();
    await expect(page.locator('.preset-demo-notice')).toContainText('演示数据');
    await page.locator('.preset-trip-item').first().click();

    await expect.poll(() => page.evaluate(() => window._lastTripPlan?.city)).toBe('杭州');
    await expect(page.locator('#export-toolbar')).toBeVisible();
    await expect(page.locator('#btn-export-md')).toBeEnabled();
    const firstAttractionMarker = page.locator('.leaflet-marker-icon:has(.attraction-marker)').first();
    await expect(firstAttractionMarker).toBeVisible();
    await expect(firstAttractionMarker).toHaveAttribute('role', 'button');
    await firstAttractionMarker.press('Enter');
    await expect(page.locator('.leaflet-popup-content')).toContainText('断桥残雪');
    await page.locator('#btn-map-routes').click();
    await expect(page.locator('#page-map-routes')).toHaveClass(/show/);

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#btn-export-md').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.md$/);

    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (url: string) => { window.__guestSharedUrl = url; } },
      });
    });
    await page.locator('#btn-share-link-new').click();
    await expect.poll(() => page.evaluate(() => window.__guestSharedUrl)).toContain('#share=');
    expect(chatRequests).toBe(0);

    await page.locator('#btn-history-map').click();
    await expect(page.locator('#history-panel')).toHaveClass(/open/);
    await expect(page.locator('#history-list')).toContainText('杭州三日经典游');
  });

  test('mobile guest entry remains non-blocking and keyboard-accessible', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile viewport contract');
    await page.goto(productionLikeUrl);

    await expect(page.locator('#guest-banner')).toBeVisible();
    await expect(page.locator('#auth-overlay')).toBeHidden();
    await expect(page.locator('#btn-guest-presets')).toHaveAccessibleName(/选择示例|Choose sample/);
    await expect(page.locator('#btn-login')).toHaveAccessibleName(/登录|Sign in/);
  });
});

declare global {
  interface Window {
    __guestSharedUrl?: string;
    _lastTripPlan?: { city?: string };
  }
}
