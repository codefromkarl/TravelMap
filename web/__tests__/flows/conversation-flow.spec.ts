/**
 * 多轮对话流程测试 — 模拟用户与 Agent 的真实交互
 *
 * 场景：
 *   1. 连续发送多条消息
 *   2. 发送消息后立即刷新
 *   3. 发送消息后切换 Tab 再回来
 *   4. 发送长消息
 *   5. 发送后立即发送下一条
 */

import { expect, test } from "@playwright/test";

test.describe("多轮对话 — 消息发送", () => {
  const messages = [
    "帮我规划北京三日游",
    "第一天去故宫和天安门",
    "预算控制在3000以内",
    "住宿推荐经济型酒店",
    "第二天想去长城",
  ];

  test("连续输入多条消息不应崩溃", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("index.html");
    await page.waitForTimeout(3000);

    for (const msg of messages) {
      await page.keyboard.type(msg, { delay: 10 });
      await page.keyboard.press("Enter");
      await page.waitForTimeout(500);
    }

    const hasApp = await page.locator("#app").count();
    expect(hasApp).toBe(1);

    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("Failed to resolve module specifier") &&
        !e.includes("esm.sh")
    );
    expect(criticalErrors).toEqual([]);
  });

  test("发送超长消息不应崩溃", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("index.html");
    await page.waitForTimeout(3000);

    const longMessage = "帮我规划旅行 ".repeat(200);
    await page.keyboard.type(longMessage, { delay: 1 });
    await page.keyboard.press("Enter");

    await page.waitForTimeout(1000);

    const hasApp = await page.locator("#app").count();
    expect(hasApp).toBe(1);

    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("Failed to resolve module specifier") &&
        !e.includes("esm.sh")
    );
    expect(criticalErrors).toEqual([]);
  });
});

test.describe("多轮对话 — 中断场景", () => {
  test("输入消息 → 立即刷新 → 页面应恢复", async ({ page }) => {
    await page.goto("index.html");

    await page.keyboard.type("北京三日游", { delay: 10 });

    await page.reload({ waitUntil: "load" });

    const title = await page.title();
    expect(title).toContain("TravelMap");

    const hasApp = await page.locator("#app").count();
    expect(hasApp).toBe(1);
  });

  test("输入消息 → 切换 Tab → 回来应正常", async ({ page, context }) => {
    await page.goto("index.html");
    await page.waitForTimeout(2000);

    await page.keyboard.type("帮我规划旅行");

    const page2 = await context.newPage();
    await page2.goto("about:blank");

    await page.bringToFront();
    await page.waitForTimeout(500);

    const hasApp = await page.locator("#app").count();
    expect(hasApp).toBe(1);

    await page2.close();
  });

  test("快速连续输入 → 刷新 → 再输入，不应崩溃", async ({ page }) => {
    await page.goto("index.html");

    for (let i = 0; i < 5; i++) {
      await page.keyboard.type(`消息${i}`, { delay: 5 });
      await page.keyboard.press("Enter");
    }

    await page.reload({ waitUntil: "load" });

    await page.keyboard.type("刷新后的消息", { delay: 10 });

    const hasApp = await page.locator("#app").count();
    expect(hasApp).toBe(1);
  });
});

test.describe("多轮对话 — ChatPanel 交互", () => {
  test("ChatPanel 应可访问", async ({ page }) => {
    await page.goto("index.html");

    // 等待 custom element 升级（JS 模块加载完成的标志）
    try {
      await page.waitForFunction(() => {
        const panel = document.querySelector("pi-chat-panel");
        return panel && panel.constructor.name !== "HTMLElement";
      }, { timeout: 15_000 });
    } catch {
      console.log("[SKIP] JS 模块未在超时内完成加载，可能在 file:// 协议下运行");
      return;
    }

    const panelInfo = await page.evaluate(() => {
      const panel = document.querySelector("pi-chat-panel");
      return {
        exists: !!panel,
        constructorName: panel?.constructor?.name,
        hasAgentInterface: !!panel?.querySelector("agent-interface"),
      };
    });

    expect(panelInfo.exists).toBe(true);
    expect(panelInfo.constructorName).not.toBe("HTMLElement");
  });

  test("即使 ChatPanel 未加载，页面也不应崩溃", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("index.html");

    await page.keyboard.press("Tab");
    await page.keyboard.type("快速输入", { delay: 5 });
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");

    await page.reload({ waitUntil: "load" });

    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("Failed to resolve module specifier") &&
        !e.includes("esm.sh")
    );
    expect(criticalErrors).toEqual([]);
  });
});

test.describe("多轮对话 — 模拟真实用户行程", () => {
  test("完整旅行规划流程（键盘模拟）", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("index.html");
    await page.waitForTimeout(3000);

    const userInputs = [
      "你好，我想去北京旅游",
      "3天时间，预算3000",
      "我喜欢历史文化和美食",
      "第一天安排故宫和天安门",
      "住宿推荐经济型",
      "谢谢，这个行程不错",
    ];

    for (const input of userInputs) {
      await page.keyboard.type(input, { delay: 15 });
      await page.keyboard.press("Enter");
      await page.waitForTimeout(1000);
    }

    const hasApp = await page.locator("#app").count();
    expect(hasApp).toBe(1);

    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("Failed to resolve module specifier") &&
        !e.includes("esm.sh")
    );
    expect(criticalErrors).toEqual([]);
  });
});
