import {
  expect,
  test as base,
  type Page,
  type Response,
} from "@playwright/test";

const ONBOARDING_STORAGE_KEY = "travel-agent-onboarding-done";

type AppReadiness = "dom" | "modules" | "agent";

interface GotoAppOptions {
  path?: string;
  readiness?: AppReadiness;
  timeout?: number;
  waitUntil?: "commit" | "domcontentloaded" | "load" | "networkidle";
}

/**
 * Shared app navigation contract for browser tests.
 *
 * `dom` only requires the application shell. `modules` additionally waits for
 * the chat custom element upgrade, while `agent` waits for the production
 * Agent binding used by end-to-end conversation tests.
 */
export async function gotoApp(
  page: Page,
  {
    path = "index.html",
    readiness = "dom",
    timeout = 20_000,
    waitUntil = "domcontentloaded",
  }: GotoAppOptions = {},
): Promise<Response | null> {
  const response = await page.goto(path, { waitUntil });
  await expect(page.locator("#app")).toBeAttached({ timeout });

  if (readiness === "modules") {
    await page.waitForFunction(
      () => {
        const panel = document.querySelector("pi-chat-panel");
        return panel && panel.constructor.name !== "HTMLElement";
      },
      undefined,
      { timeout },
    );
  }

  if (readiness === "agent") {
    await page.waitForFunction(
      () => {
        const chat = document.getElementById("chat") as
          | (HTMLElement & { agent?: unknown })
          | null;
        return Boolean(chat?.agent);
      },
      undefined,
      { timeout },
    );
  }

  return response;
}

/**
 * Reach the real mobile map state through the visible product control.
 * Desktop already shows the map, so no transition is needed there.
 */
export async function showMapView(page: Page): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport || viewport.width > 768) return;

  const mapPage = page.locator("#page-map");
  if (!(await mapPage.evaluate((element) => element.classList.contains("mobile-map-focused")))) {
    const mapButton = page.locator("#btn-mobile-map");
    await expect(mapButton).toBeVisible();
    await mapButton.click();
  }

  await expect(mapPage).toHaveClass(/mobile-map-focused/);
}

/**
 * Browser tests default to the returning-user path. Onboarding behavior has
 * dedicated coverage and should not unpredictably cover unrelated controls.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript((storageKey) => {
      window.localStorage.setItem(storageKey, "1");
    }, ONBOARDING_STORAGE_KEY);

    await page.route("**/config.local.js", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: "export default {};\n",
      }),
    );

    await use(page);
  },
});

export { expect };
