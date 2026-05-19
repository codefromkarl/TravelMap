/**
 * Chaos Monkey 测试 — 页面随机操作压力测试
 *
 * 策略：
 *   1. 随机点击页面上的可见元素
 *   2. 随机输入文字到可输入区域
 *   3. 随机键盘操作 (Tab, Enter, Escape, 方向键)
 *   4. 随机视口缩放
 *   5. 每一步后验证页面未崩溃 (无 JS 错误，关键元素仍在)
 *
 * 目标：发现未知崩溃点和异常状态
 */

import { expect, test } from "@playwright/test";

// 收集页面错误
function setupErrorCollector(page: import("@playwright/test").Page) {
  const errors: string[] = [];
  page.on("pageerror", (err) => {
    errors.push(err.message);
  });
  return errors;
}

// 检查页面健康状态
async function assertPageHealthy(page: import("@playwright/test").Page) {
  const hasApp = await page.locator("#app").count();
  expect(hasApp).toBe(1);

  const bodyVisible = await page.locator("body").isVisible();
  expect(bodyVisible).toBe(true);
}

test.describe("Chaos Monkey — 随机点击", () => {
  test("应能在随机点击 30 次后保持页面健康", async ({ page }) => {
    const errors = setupErrorCollector(page);
    await page.goto("index.html");

    for (let i = 0; i < 30; i++) {
      const clickable = await page.evaluate(() => {
        const all = document.querySelectorAll("*");
        const visible: Array<{ x: number; y: number; tag: string }> = [];
        for (const el of all) {
          const rect = el.getBoundingClientRect();
          if (
            rect.width > 0 &&
            rect.height > 0 &&
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= window.innerHeight &&
            rect.right <= window.innerWidth
          ) {
            visible.push({
              x: rect.x + rect.width / 2,
              y: rect.y + rect.height / 2,
              tag: el.tagName,
            });
          }
        }
        return visible;
      });

      if (clickable.length > 0) {
        const target = clickable[Math.floor(Math.random() * clickable.length)];
        await page.mouse.click(target.x, target.y);
      }

      if (i % 10 === 9) {
        await assertPageHealthy(page);
      }
    }

    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("Failed to resolve module specifier") &&
        !e.includes("esm.sh")
    );
    expect(criticalErrors).toEqual([]);
  });
});

test.describe("Chaos Monkey — 随机键盘", () => {
  const keys = ["Tab", "Enter", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Backspace"];

  test("应能在随机键盘操作 50 次后保持页面健康", async ({ page }) => {
    const errors = setupErrorCollector(page);
    await page.goto("index.html");

    for (let i = 0; i < 50; i++) {
      const key = keys[Math.floor(Math.random() * keys.length)];
      await page.keyboard.press(key);

      if (i % 15 === 14) {
        await assertPageHealthy(page);
      }
    }

    await assertPageHealthy(page);
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("Failed to resolve module specifier") &&
        !e.includes("esm.sh")
    );
    expect(criticalErrors).toEqual([]);
  });

  test("连续快速 Enter 不应崩溃", async ({ page }) => {
    const errors = setupErrorCollector(page);
    await page.goto("index.html");

    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Enter");
    }

    await assertPageHealthy(page);
  });
});

test.describe("Chaos Monkey — 随机输入文字", () => {
  const testInputs = [
    "你好",
    "北京三日游",
    "!!@@##$$",
    "a".repeat(500),
    "🇨🇳🎉🎊",
    "<script>alert(1)</script>",
    "'; DROP TABLE trips;--",
    "Null\u0000Byte",
    "\t\t\n\n",
    "第1天去故宫第2天去长城第3天去颐和园",
  ];

  test("各种异常输入不应导致页面崩溃", async ({ page }) => {
    const errors = setupErrorCollector(page);
    await page.goto("index.html");

    for (const input of testInputs) {
      await page.keyboard.press("Tab");
      await page.keyboard.type(input, { delay: 5 });

      await assertPageHealthy(page);
      await page.keyboard.press("Escape");
    }

    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("Failed to resolve module specifier") &&
        !e.includes("esm.sh")
    );
    expect(criticalErrors).toEqual([]);
  });
});

test.describe("Chaos Monkey — 视口变化", () => {
  const viewports = [
    { w: 1920, h: 1080 },
    { w: 1280, h: 720 },
    { w: 800, h: 600 },
    { w: 375, h: 812 },
    { w: 320, h: 568 },
    { w: 2560, h: 1440 },
    { w: 100, h: 100 },
    { w: 4000, h: 1000 },
  ];

  test("各种视口尺寸下页面不应崩溃", async ({ page }) => {
    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.goto("index.html");

      await assertPageHealthy(page);

      const overflow = await page.evaluate(() => {
        const header = document.querySelector("header");
        if (!header) return false;
        return header.scrollWidth > header.clientWidth + 2;
      });
      if (vp.w >= 320) {
        expect(overflow, `视口 ${vp.w}x${vp.h} header 溢出`).toBe(false);
      }
    }
  });

  test("运行时动态缩放视口不应崩溃", async ({ page }) => {
    await page.goto("index.html");

    for (let i = 0; i < 10; i++) {
      const w = 320 + Math.floor(Math.random() * 1600);
      const h = 400 + Math.floor(Math.random() * 800);
      await page.setViewportSize({ width: w, height: h });
    }

    await assertPageHealthy(page);
  });
});
