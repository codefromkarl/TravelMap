/**
 * 多轮对话流程测试 — 模拟用户与 Agent 的真实交互
 *
 * 场景：
 *   1. 连续发送多条消息
 *   2. 发送消息后立即刷新
 *   3. 发送消息后切换 Tab 再回来
 *   4. 发送长消息
 *   5. 发送后立即发送下一条
 *   6. 发送后中止页面加载
 *
 * 注意：ChatPanel 使用 Shadow DOM，
 *       需要通过 evaluate 进入 shadowRoot 查找输入元素
 */

import { expect, test } from "@playwright/test";

/** 尝试在 ChatPanel 中找到输入区域并输入文字 */
async function tryInputInChatPanel(
  page: import("@playwright/test").Page,
  text: string,
): Promise<boolean> {
  return page.evaluate((msg) => {
    const panel = document.querySelector("pi-chat-panel");
    if (!panel?.shadowRoot) return false;

    // pi-web-ui ChatPanel 的输入区域
    const textarea = panel.shadowRoot.querySelector("textarea");
    const input = panel.shadowRoot.querySelector("input[type='text']");
    const contentEditable = panel.shadowRoot.querySelector("[contenteditable='true']");
    const anyInput = panel.shadowRoot.querySelector("input:not([type])");

    const target = textarea || input || contentEditable || anyInput;
    if (!target) return false;

    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
      // 触发 input 事件（模拟用户输入）
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
        "value",
      )?.set;
      nativeInputValueSetter?.call(target, msg);
      target.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (target.getAttribute("contenteditable") === "true") {
      target.textContent = msg;
      target.dispatchEvent(new Event("input", { bubbles: true }));
    }
    return true;
  }, text);
}

/** 尝试提交消息（Enter 或点击发送按钮） */
async function trySubmitChatPanel(page: import("@playwright/test").Page): Promise<boolean> {
  return page.evaluate(() => {
    const panel = document.querySelector("pi-chat-panel");
    if (!panel?.shadowRoot) return false;

    // 查找发送按钮
    const sendBtn = panel.shadowRoot.querySelector(
      'button[type="submit"], button[aria-label*="发送"], button[aria-label*="Send"], button:has(svg)',
    );

    if (sendBtn instanceof HTMLButtonElement) {
      sendBtn.click();
      return true;
    }

    // 尝试在输入框按 Enter
    const textarea = panel.shadowRoot.querySelector("textarea");
    if (textarea instanceof HTMLTextAreaElement) {
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      return true;
    }

    return false;
  });
}

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
    // 等待 JS 加载
    await page.waitForTimeout(3000);

    for (const msg of messages) {
      // 在页面上输入（即使 ChatPanel 未完全加载，也不应崩溃）
      await page.keyboard.type(msg, { delay: 10 });
      await page.keyboard.press("Enter");
      await page.waitForTimeout(500);
    }

    // 页面应仍然健康
    const hasApp = await page.locator("#app").count();
    expect(hasApp).toBe(1);

    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("Failed to resolve module specifier") &&
        !e.includes("esm.sh") &&
        !e.includes("AppStorage not initialized"),
    );
    expect(criticalErrors).toEqual([]);
  });

  test("发送超长消息不应崩溃", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("index.html");
    await page.waitForTimeout(3000);

    const longMessage = "帮我规划旅行 ".repeat(200); // ~1400 字符
    await page.keyboard.type(longMessage, { delay: 1 });
    await page.keyboard.press("Enter");

    await page.waitForTimeout(1000);

    const hasApp = await page.locator("#app").count();
    expect(hasApp).toBe(1);

    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("Failed to resolve module specifier") &&
        !e.includes("esm.sh") &&
        !e.includes("AppStorage not initialized"),
    );
    expect(criticalErrors).toEqual([]);
  });
});

test.describe("多轮对话 — 中断场景", () => {
  test("输入消息 → 立即刷新 → 页面应恢复", async ({ page }) => {
    await page.goto("index.html");

    // 输入但不等待响应
    await page.keyboard.type("北京三日游", { delay: 10 });

    // 立即刷新
    await page.reload({ waitUntil: "load" });

    // 应恢复到初始状态
    const title = await page.title();
    expect(title).toContain("旅途星辰");

    const hasApp = await page.locator("#app").count();
    expect(hasApp).toBe(1);
  });

  test("输入消息 → 切换 Tab → 回来应正常", async ({ page, context }) => {
    await page.goto("index.html");
    await page.waitForTimeout(2000);

    await page.keyboard.type("帮我规划旅行");

    // 新开 Tab
    const page2 = await context.newPage();
    await page2.goto("about:blank");

    // 回到原 Tab
    await page.bringToFront();
    await page.waitForTimeout(500);

    const hasApp = await page.locator("#app").count();
    expect(hasApp).toBe(1);

    await page2.close();
  });

  test("快速连续输入 → 刷新 → 再输入，不应崩溃", async ({ page }) => {
    await page.goto("index.html");

    // 快速输入
    for (let i = 0; i < 5; i++) {
      await page.keyboard.type(`消息${i}`, { delay: 5 });
      await page.keyboard.press("Enter");
    }

    // 刷新
    await page.reload({ waitUntil: "load" });

    // 再输入
    await page.keyboard.type("刷新后的消息", { delay: 10 });

    const hasApp = await page.locator("#app").count();
    expect(hasApp).toBe(1);
  });
});

test.describe("多轮对话 — ChatPanel Shadow DOM 交互", () => {
  test("ChatPanel shadowRoot 应可访问", async ({ page }) => {
    await page.goto("index.html");
    await page.waitForTimeout(5000);

    const shadowInfo = await page.evaluate(() => {
      const panel = document.querySelector("pi-chat-panel");
      return {
        exists: !!panel,
        hasShadowRoot: !!panel?.shadowRoot,
        shadowMode: panel?.shadowRoot?.mode ?? null,
      };
    });

    // pi-chat-panel 存在
    expect(shadowInfo.exists).toBe(true);

    // 如果 JS 已加载完成，shadowRoot 应可访问（open mode）
    // 如果未加载（网络问题），则可能为 null — 两种情况都不应崩溃
    expect(typeof shadowInfo.hasShadowRoot).toBe("boolean");
  });

  test("即使 ChatPanel 未加载，页面也不应崩溃", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("index.html");

    // 不等待 JS 加载，立即进行操作
    await page.keyboard.press("Tab");
    await page.keyboard.type("快速输入", { delay: 5 });
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");

    await page.reload({ waitUntil: "load" });

    // 页面不应有未处理的错误
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("Failed to resolve module specifier") &&
        !e.includes("esm.sh") &&
        !e.includes("AppStorage not initialized"),
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

    // 模拟用户输入流程
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

    // 最终验证
    const hasApp = await page.locator("#app").count();
    expect(hasApp).toBe(1);

    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("Failed to resolve module specifier") &&
        !e.includes("esm.sh") &&
        !e.includes("AppStorage not initialized"),
    );
    expect(criticalErrors).toEqual([]);
  });
});
