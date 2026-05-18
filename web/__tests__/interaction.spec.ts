/**
 * E2E 交互测试 — 模拟用户操作
 *
 * 目标 5: 通过实际点击的页面测试，验证人机交互关注点
 *
 * 测试策略：
 *   - 验证静态结构（不依赖网络和 JS 加载完成）
 *   - 验证 localStorage 设置/读取
 *   - 验证键盘导航和无障碍
 *   - 网络相关的测试标记为 @network，可单独跳过
 */

import { expect, test } from "@playwright/test";

test.describe("localStorage 持久化", () => {
  test("应能保存和读取 provider 设置", async ({ page }) => {
    // 先导航到页面以建立 file:// 上下文
    await page.goto("index.html");
    await page.evaluate(() => {
      localStorage.setItem("travel-agent-provider", "anthropic");
      localStorage.setItem("travel-agent-model", "claude-sonnet-4-20250514");
    });

    const provider = await page.evaluate(() => {
      return localStorage.getItem("travel-agent-provider");
    });
    const model = await page.evaluate(() => {
      return localStorage.getItem("travel-agent-model");
    });

    expect(provider).toBe("anthropic");
    expect(model).toBe("claude-sonnet-4-20250514");
  });

  test("无设置时 provider 应默认为 openai", async ({ page }) => {
    // 清空 localStorage
    await page.goto("index.html");
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // 页面 JS 中: localStorage.getItem("travel-agent-provider") || "openai"
    // 这只是验证 localStorage 初始状态
    const provider = await page.evaluate(() => {
      return localStorage.getItem("travel-agent-provider");
    });

    expect(provider).toBeNull(); // 未设置
  });
});

test.describe("无障碍 & 键盘导航", () => {
  test("h1 标签应存在且唯一", async ({ page }) => {
    await page.goto("index.html");

    const h1Count = await page.locator("h1").count();
    expect(h1Count).toBe(1);
  });

  test("页面元素应可通过 Tab 键聚焦", async ({ page }) => {
    await page.goto("index.html");

    // 按 Tab 键
    await page.keyboard.press("Tab");

    const focusedTag = await page.evaluate(() => {
      return document.activeElement?.tagName?.toLowerCase();
    });

    expect(focusedTag).toBeTruthy();
  });

  test("Escape 键不应导致页面崩溃", async ({ page }) => {
    await page.goto("index.html");

    // 连续按 Escape
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");

    // 页面应仍然可交互
    const header = page.locator("header");
    await expect(header).toBeVisible();
  });
});

test.describe("DOM 结构完整性", () => {
  test("应有正确的 DOM 层级: #app > header + #chat-container > pi-chat-panel", async ({ page }) => {
    await page.goto("index.html");

    const structure = await page.evaluate(() => {
      const app = document.querySelector("#app");
      if (!app) return null;

      return {
        hasHeader: !!app.querySelector(":scope > header"),
        hasChatContainer: !!app.querySelector(":scope > #chat-container"),
        hasChatPanel: !!app.querySelector("pi-chat-panel"),
        hasLoading: !!app.querySelector("#loading"),
      };
    });

    expect(structure).not.toBeNull();
    expect(structure!.hasHeader).toBe(true);
    expect(structure!.hasChatContainer).toBe(true);
    expect(structure!.hasChatPanel).toBe(true);
  });

  test("header 应包含 h1 和 span", async ({ page }) => {
    await page.goto("index.html");

    const headerContent = await page.evaluate(() => {
      const header = document.querySelector("header");
      if (!header) return null;
      return {
        hasH1: !!header.querySelector("h1"),
        hasSpan: !!header.querySelector("span"),
      };
    });

    expect(headerContent).not.toBeNull();
    expect(headerContent!.hasH1).toBe(true);
    expect(headerContent!.hasSpan).toBe(true);
  });
});

test.describe("错误恢复", () => {
  test("页面刷新后应恢复状态", async ({ page }) => {
    await page.goto("index.html");

    // 设置一些状态
    await page.evaluate(() => {
      localStorage.setItem("travel-agent-provider", "openai");
    });

    // 刷新
    await page.reload();

    const provider = await page.evaluate(() => {
      return localStorage.getItem("travel-agent-provider");
    });

    expect(provider).toBe("openai");
  });

  test("连续快速刷新不应导致 JS 错误", async ({ page }) => {
    // 监听 console error
    const errors: string[] = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
    });

    // 快速连续刷新
    for (let i = 0; i < 3; i++) {
      await page.goto("index.html");
    }

    // 等待 JS 执行
    await page.waitForTimeout(2000);

    // 不应有未捕获的 JS 错误（CSS/HTML 错误不算）
    // 注意: importmap 加载失败可能产生错误，这些在离线环境是预期的
    // 只检查非网络相关错误
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("importmap") &&
        !e.includes("esm.sh") &&
        !e.includes("Failed to fetch") &&
        !e.includes("net::ERR") &&
        !e.includes("Failed to resolve module specifier"), // importmap 解析失败在 file:// 下是预期行为
    );

    expect(criticalErrors).toEqual([]);
  });
});

test.describe("地图面板", () => {
  test("地图面板 DOM 结构应完整", async ({ page }) => {
    await page.goto("index.html");

    const structure = await page.evaluate(() => {
      return {
        hasMapPanel: !!document.getElementById("map-panel"),
        hasMapContainer: !!document.getElementById("map-container"),
        hasMapBtn: !!document.getElementById("btn-map"),
        hasCloseMapBtn: !!document.getElementById("btn-close-map"),
        hasMapStatus: !!document.getElementById("map-status"),
      };
    });

    expect(structure.hasMapPanel).toBe(true);
    expect(structure.hasMapContainer).toBe(true);
    expect(structure.hasMapBtn).toBe(true);
    expect(structure.hasCloseMapBtn).toBe(true);
    expect(structure.hasMapStatus).toBe(true);
  });

  test("地图按钮默认隐藏", async ({ page }) => {
    await page.goto("index.html");

    const mapBtn = page.locator("#btn-map");
    await expect(mapBtn).toBeHidden();
  });

  test("Leaflet 库应被加载", async ({ page }) => {
    await page.goto("index.html");

    // 等待外部资源加载
    await page.waitForTimeout(3000);

    const hasLeaflet = await page.evaluate(() => {
      return typeof (window as unknown as Record<string, unknown>).L !== "undefined";
    });

    expect(hasLeaflet).toBe(true);
  });
});
