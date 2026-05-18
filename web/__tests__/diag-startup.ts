import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL || "http://localhost:3456";

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();

  const consoleMsgs: string[] = [];
  const pageErrors: string[] = [];
  const netErrors: string[] = [];

  page.on("console", (msg) => {
    consoleMsgs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    pageErrors.push(err.message);
  });
  page.on("requestfailed", (req) => {
    netErrors.push(`${req.failure()?.errorText} — ${req.url()}`);
  });

  console.log(`\n📡 Opening ${BASE}/index.html ...\n`);
  await page.goto(`${BASE}/index.html`, { waitUntil: "load" });

  // 等待一段时间让模块加载
  await page.waitForTimeout(10000);

  // 检查 loading 状态
  const loadingExists = await page.locator("#loading").count();
  console.log(`\n#loading 存在: ${loadingExists}`);

  // 检查 script 标签
  const scriptInfo = await page.evaluate(() => {
    const scripts = document.querySelectorAll('script[type="module"]');
    return Array.from(scripts).map((s) => ({
      src: s.src || "(inline)",
      textLength: s.textContent?.length ?? 0,
    }));
  });
  console.log(`\nModule scripts:`, JSON.stringify(scriptInfo, null, 2));

  // 检查 importmap
  const importMap = await page.evaluate(() => {
    const s = document.querySelector('script[type="importmap"]');
    return s ? JSON.parse(s.textContent || "{}") : null;
  });
  console.log(`\nImport map keys:`, Object.keys(importMap?.imports || {}));

  // 检查 link 标签
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((l) => l.getAttribute("href"));
  });
  console.log(`\nStylesheet links:`, links);

  // 检查 chat-panel 状态
  const panelInfo = await page.evaluate(() => {
    const p = document.querySelector("chat-panel");
    return {
      exists: !!p,
      hasShadow: !!p?.shadowRoot,
      shadowChildren: p?.shadowRoot?.childElementCount ?? 0,
      shadowHTML: p?.shadowRoot?.innerHTML?.substring(0, 300) ?? "none",
    };
  });
  console.log(`\nChatPanel:`, JSON.stringify(panelInfo, null, 2));

  // 汇总错误
  console.log(`\n====== CONSOLE (${consoleMsgs.length}) ======`);
  consoleMsgs.forEach((m) => console.log(m));

  console.log(`\n====== PAGE ERRORS (${pageErrors.length}) ======`);
  pageErrors.forEach((e) => console.log(e));

  console.log(`\n====== NETWORK FAILURES (${netErrors.length}) ======`);
  netErrors.forEach((e) => console.log(e));

  await browser.close();
})();
