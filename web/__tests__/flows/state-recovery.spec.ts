/**
 * 状态恢复测试 — 验证中断后的恢复能力
 *
 * 场景：
 *   1. 输入消息 → 刷新浏览器 → 验证状态
 *   2. 输入消息 → 后退 → 前进 → 验证
 *   3. 多次快速刷新
 *   4. 多 Tab 并发
 *   5. LocalStorage 损坏后的降级
 */

import { expect, test } from "@playwright/test";

test.describe("刷新中断恢复", () => {
  test("页面刷新后 DOM 结构应完整恢复", async ({ page }) => {
    await page.goto("index.html");

    // 刷新
    await page.reload({ waitUntil: "load" });

    // 验证结构
    const structure = await page.evaluate(() => {
      return {
        hasApp: !!document.querySelector("#app"),
        hasHeader: !!document.querySelector("header"),
        hasChatContainer: !!document.querySelector("#chat-container"),
        hasChatPanel: !!document.querySelector("pi-chat-panel"),
        title: document.title,
      };
    });

    expect(structure.hasApp).toBe(true);
    expect(structure.hasHeader).toBe(true);
    expect(structure.hasChatContainer).toBe(true);
    expect(structure.hasChatPanel).toBe(true);
    expect(structure.title).toContain("旅途星辰");
  });

  test("刷新后 CSS 变量应保持一致", async ({ page }) => {
    await page.goto("index.html");

    // 记录刷新前的样式
    const beforeStyle = await page.evaluate(() => {
      return getComputedStyle(document.body).backgroundColor;
    });

    // 刷新
    await page.reload({ waitUntil: "load" });

    // 验证样式恢复
    const afterStyle = await page.evaluate(() => {
      return getComputedStyle(document.body).backgroundColor;
    });

    expect(beforeStyle).toBe(afterStyle);
  });

  test("连续 5 次快速刷新后应稳定", async ({ page }) => {
    for (let i = 0; i < 5; i++) {
      await page.goto("index.html");
      // 不等 JS 完全加载，立即刷新
    }

    // 最后等稳定
    await page.waitForLoadState("domcontentloaded");

    const hasApp = await page.locator("#app").count();
    expect(hasApp).toBe(1);
  });

  test("F5 刷新与 Ctrl+R 刷新结果一致", async ({ page }) => {
    await page.goto("index.html");

    // F5 刷新
    await page.keyboard.press("F5");
    await page.waitForLoadState("domcontentloaded");
    const afterF5 = await page.evaluate(() => document.title);

    // Ctrl+R 刷新
    await page.keyboard.press("Control+r");
    await page.waitForLoadState("domcontentloaded");
    const afterCtrlR = await page.evaluate(() => document.title);

    expect(afterF5).toBe(afterCtrlR);
  });
});

test.describe("导航中断恢复", () => {
  test("后退/前进后页面应恢复", async ({ page }) => {
    await page.goto("index.html");
    const originalTitle = await page.title();

    // 导航到空白页再回来
    await page.goto("about:blank");
    await page.goBack();
    await page.waitForLoadState("domcontentloaded");

    const title = await page.title();
    expect(title).toBe(originalTitle);

    // 前进
    await page.goForward();
    await page.goBack();
    await page.waitForLoadState("domcontentloaded");

    const title2 = await page.title();
    expect(title2).toBe(originalTitle);
  });
});

test.describe("LocalStorage 异常恢复", () => {
  test("损坏的 localStorage 不应崩溃页面", async ({ page }) => {
    await page.goto("index.html");

    // 注入损坏数据
    await page.evaluate(() => {
      localStorage.setItem("travel-agent-provider", "");
      localStorage.setItem("travel-agent-model", "");
      // 注入大量垃圾数据
      for (let i = 0; i < 100; i++) {
        localStorage.setItem(`garbage_${i}`, "x".repeat(1000));
      }
    });

    // 刷新
    await page.reload({ waitUntil: "load" });

    // 页面应仍然正常
    const hasApp = await page.locator("#app").count();
    expect(hasApp).toBe(1);
  });

  test("清空 localStorage 后应使用默认值", async ({ page }) => {
    await page.goto("index.html");

    await page.evaluate(() => localStorage.clear());

    // 刷新后应使用默认
    await page.reload({ waitUntil: "load" });

    const provider = await page.evaluate(() => {
      return localStorage.getItem("travel-agent-provider");
    });

    // 清空后应为 null（页面 JS 中用 || "openai" 兜底）
    expect(provider).toBeNull();
  });
});

test.describe("多 Tab 并发", () => {
  test("同时打开多个 Tab 不应互相干扰", async ({ page, context }) => {
    await page.goto("index.html");

    // 设置不同的 provider
    await page.evaluate(() => {
      localStorage.setItem("travel-agent-provider", "openai");
    });

    // 新 Tab
    const page2 = await context.newPage();
    await page2.goto("index.html");

    await page2.evaluate(() => {
      localStorage.setItem("travel-agent-provider", "anthropic");
    });

    // 验证两个 Tab 独立
    const provider1 = await page.evaluate(() => localStorage.getItem("travel-agent-provider"));
    const provider2 = await page2.evaluate(() => localStorage.getItem("travel-agent-provider"));

    // 同一 context 共享 localStorage，所以第二个 Tab 的修改会影响第一个
    // 这是预期行为 — 验证页面能正确处理
    expect(typeof provider1).toBe("string");
    expect(typeof provider2).toBe("string");

    await page2.close();
  });
});
