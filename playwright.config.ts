import { defineConfig } from "@playwright/test";

// 代理配置：PROXY_URL 有值则启用代理，无值则不走代理
const proxy = process.env.PROXY_URL
  ? { server: process.env.PROXY_URL, bypass: "localhost,127.0.0.1" }
  : undefined;

export default defineConfig({
  testDir: "./web/__tests__",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"]],
  use: {
    // 浏览器启动选项：CHROME_PATH 有值则使用指定浏览器，否则用 Playwright 内置 chromium
    launchOptions: {
      ...(process.env.CHROME_PATH
        ? { executablePath: process.env.CHROME_PATH }
        : {}),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--ignore-certificate-errors",
        "--disable-features=NetworkService",
      ],
      ...(proxy ? { proxy } : {}),
    },
    // 基础 URL：BASE_URL 有值则使用，否则默认指向本地 web 目录
    baseURL: process.env.BASE_URL || `file://${process.cwd()}/web/`,
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
