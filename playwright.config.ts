import { defineConfig } from "@playwright/test";

const LOCAL_E2E_BASE_URL = "http://127.0.0.1:3456/";

export function isLocalFileBaseURL(rawBaseURL: string | undefined): boolean {
  const candidate = rawBaseURL?.trim();
  if (!candidate) return false;
  return (
    candidate.startsWith("file:") ||
    candidate.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(candidate)
  );
}

export function resolvePlaywrightBaseURL(rawBaseURL = process.env.BASE_URL): string {
  const candidate = rawBaseURL?.trim();
  if (!candidate || isLocalFileBaseURL(candidate)) return LOCAL_E2E_BASE_URL;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(
      "[PLAYWRIGHT_BASE_URL_INVALID] BASE_URL must be an absolute http:// or https:// URL",
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      "[PLAYWRIGHT_BASE_URL_INVALID] BASE_URL must be an absolute http:// or https:// URL",
    );
  }
  return parsed.href;
}

const configuredBaseURL = process.env.BASE_URL?.trim();
const baseURL = resolvePlaywrightBaseURL(configuredBaseURL);
const useLocalWebServer = !configuredBaseURL || isLocalFileBaseURL(configuredBaseURL);

// 代理配置：PROXY_URL 有值则启用代理，无值则不走代理
const proxy = process.env.PROXY_URL
  ? { server: process.env.PROXY_URL, bypass: "localhost,127.0.0.1" }
  : undefined;

export default defineConfig({
  testDir: "./web/__tests__",
  testIgnore: [
    "**/unit/**",
    "**/shanghai-hangzhou-e2e.spec.ts",
    "**/shanghai-hangzhou-real-e2e.spec.ts",
    "**/ai-scenario-generator.spec.ts",
  ],
  outputDir: "test-results",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["junit", { outputFile: "test-results/junit.xml" }],
  ],

  // 限制并发 worker 数量，避免内存爆炸
  // 28 核 CPU 默认会创建 14 个 worker，每个浏览器实例 ~350MB
  // 限制为 4 个 worker，内存占用从 ~5GB 降到 ~1.4GB
  workers: process.env.CI ? 2 : 4,
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
    // 统一使用 HTTP；文件路径/file:// 会在加载配置时立即失败。
    baseURL,
    actionTimeout: 10_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  webServer: useLocalWebServer
    ? {
        command: "npx --no-install tsx scripts/dev-server.ts",
        url: `${LOCAL_E2E_BASE_URL}index.html`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
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
