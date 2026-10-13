import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("guest edits update current stats and exported itinerary without provider requests", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("travel-agent-onboarding-done", "1");
    localStorage.setItem("travel-agent-cinematic-seen", "1");
    localStorage.setItem("travel-agent-demo-guide-done", "1");
  });
  let providerRequests = 0;
  await page.route("**/api/auth/status", route => route.fulfill({
    status: 401, contentType: "application/json", body: '{"authenticated":false}',
  }));
  await page.route(/\/api\/(?:chat|amap)(?:\?|$)/, route => {
    providerRequests++;
    return route.fulfill({ status: 500, body: "Preset must not call a provider" });
  });
  await page.goto("/");
  await page.locator("#btn-guest-demo").click();
  await page.locator(".preset-trip-item").first().click();
  await expect(page.locator("#trip-stats-bar")).toContainText("景点");
  await page.locator("#btn-history-map").click();
  await expect(page.locator("#history-list")).toContainText("杭州三日经典游");
  await page.locator("#history-list .edit-btn").first().click();
  const editor = page.locator("#trip-editor-overlay");
  await expect(editor).toHaveClass(/open/);
  await expect(editor).toContainText("断桥残雪");
  await editor.locator('[data-act="del"][data-day="0"][data-attr="0"]').click();
  await expect(editor).not.toContainText("断桥残雪");
  await page.locator("#btn-save-trip-editor").click();
  await expect(page.locator("#trip-stats-bar .trip-stats-chip").filter({ hasText: "景点" })).toContainText("8");
  await page.locator("#btn-close-trip-editor").click();
  await expect(editor).toBeHidden();
  await page.locator("#btn-close-history").click();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#btn-export-md").click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  const content = await readFile(path!, "utf8");
  expect(content).not.toContain("断桥残雪");
  expect(content).toContain("演示行程");
  expect(content).toContain("并非实时旅行建议");
  expect(content).toContain("杭州");
  expect(providerRequests).toBe(0);
});
