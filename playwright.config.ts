import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./web/__tests__",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"]],
  use: {
    // 使用系统 Chrome
    launchOptions: {
      executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--ignore-certificate-errors"],
    },
    baseURL: process.env.BASE_URL || "file://" + process.cwd() + "/web/",
    actionTimeout: 10_000,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "desktop",
      use: {
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: "mobile",
      use: {
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
