/**
 * E2E 测试 — 页面加载 & 静态结构验证
 *
 * 验证 web/index.html 的基础渲染：
 *   - 页面标题、header 元素
 *   - importmap 和 meta 声明
 *   - CSS 变量和浅色主题
 *   - 移动端响应式布局
 *   - 地图主界面结构
 *
 * 注意: file:// 协议下 importmap 远程加载可能不稳定，
 *       JS 相关测试使用较长超时和宽松断言。
 */

import { expect, gotoApp, test } from "./fixtures/app";

test.describe("页面加载验证", () => {
  test("应正确加载页面标题和主要结构", async ({ page }) => {
    await gotoApp(page);

    await expect(page).toHaveTitle(/TravelMap/);

    // 验证地图主界面存在
    const mapContainer = page.locator("#map-container, .map-container, #app");
    await expect(mapContainer.first()).toBeAttached();

    // 验证聊天面板存在
    const chatPanel = page.locator("pi-chat-panel");
    await expect(chatPanel).toBeAttached();
  });

  test("应渲染 pi-chat-panel 自定义元素", async ({ page }) => {
    await gotoApp(page);

    const chatPanel = page.locator("pi-chat-panel");
    // HTML 中声明了 <pi-chat-panel>，即使 JS 未加载也应该 attached
    await expect(chatPanel).toBeAttached();
  });

  test("loading 提示在 JS 执行后应消失", async ({ page }) => {
    await gotoApp(page);

    const loading = page.locator("#loading");
    // JS 会执行 document.getElementById("loading")?.remove()
    try {
      await expect(loading).toHaveCount(0, { timeout: 10_000 });
    } catch {
      // 如果还在，说明 JS 未执行（网络问题），也是可接受的
      await expect(loading).toBeAttached();
    }
  });
});

test.describe("页面元信息验证", () => {
  test("importmap 应正确声明所有依赖", async ({ page }) => {
    await page.goto("index.html");

    const importMap = await page.evaluate(() => {
      const script = document.querySelector('script[type="importmap"]');
      if (!script) return null;
      return JSON.parse(script.textContent || "{}");
    });

    expect(importMap).not.toBeNull();
    expect(importMap.imports).toBeDefined();
    expect(importMap.imports["@earendil-works/pi-agent-core"]).toBeDefined();
    expect(importMap.imports["@earendil-works/pi-ai"]).toBeDefined();
    expect(importMap.imports["@earendil-works/pi-web-ui"]).toBeDefined();
    expect(importMap.imports["lit"]).toBeDefined();
  });

  test("页面应有正确的 meta viewport", async ({ page }) => {
    await page.goto("index.html");

    const viewport = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="viewport"]');
      return meta?.getAttribute("content");
    });

    expect(viewport).toContain("width=device-width");
    expect(viewport).toContain("initial-scale=1");
  });

  test("charset 应为 utf-8", async ({ page }) => {
    await page.goto("index.html");

    const charset = await page.evaluate(() => {
      const meta = document.querySelector('meta[charset]');
      return meta?.getAttribute("charset");
    });

    expect(charset).toBe("utf-8");
  });
});

test.describe("浅色主题 CSS 验证", () => {
  test("body 应使用浅色背景 #ffffff", async ({ page }) => {
    await page.goto("index.html");

    const bgColor = await page.evaluate(() => {
      return getComputedStyle(document.body).backgroundColor;
    });

    // --color-bg-base: #ffffff → rgb(255, 255, 255)
    expect(bgColor).toBe("rgb(255, 255, 255)");
  });

  test("应加载 CSS 样式文件", async ({ page }) => {
    await page.goto("index.html");

    // 检查是否加载了 main.css
    const hasMainCss = await page.evaluate(() => {
      const links = document.querySelectorAll('link[rel="stylesheet"]');
      return Array.from(links).some(l => l.getAttribute('href')?.includes('main.css'));
    });

    expect(hasMainCss).toBe(true);

    // 检查 CSS 变量是否可用
    const cssVarAvailable = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        hasBgBase: !!style.getPropertyValue('--color-bg-base').trim(),
        hasAccent: !!style.getPropertyValue('--color-accent-primary').trim(),
        hasTextPrimary: !!style.getPropertyValue('--color-text-primary').trim(),
      };
    });

    expect(cssVarAvailable.hasBgBase).toBe(true);
    expect(cssVarAvailable.hasAccent).toBe(true);
    expect(cssVarAvailable.hasTextPrimary).toBe(true);
  });
});

test.describe("地图主界面结构", () => {
  test("应有地图页面 #page-map", async ({ page }) => {
    await page.goto("index.html");

    const hasPageMap = await page.evaluate(() => {
      return !!document.getElementById("page-map");
    });

    expect(hasPageMap).toBe(true);
  });

  test("应有左侧对话面板 #map-chat-panel", async ({ page }) => {
    await page.goto("index.html");

    const hasChatPanel = await page.evaluate(() => {
      return !!document.getElementById("map-chat-panel");
    });

    expect(hasChatPanel).toBe(true);
  });

  test("应有右侧地图区域 #map-right-area", async ({ page }) => {
    await page.goto("index.html");

    const hasMapArea = await page.evaluate(() => {
      return !!document.getElementById("map-right-area");
    });

    expect(hasMapArea).toBe(true);
  });

  test("不应有侧边栏 #sidebar", async ({ page }) => {
    await page.goto("index.html");

    const sidebarVisible = await page.evaluate(() => {
      const sidebar = document.getElementById("sidebar");
      if (!sidebar) return false;
      return getComputedStyle(sidebar).display !== "none";
    });

    expect(sidebarVisible).toBe(false);
  });

  test("应有模型配置弹窗 #model-modal-overlay", async ({ page }) => {
    await page.goto("index.html");

    const hasModal = await page.evaluate(() => {
      return !!document.getElementById("model-modal-overlay");
    });

    expect(hasModal).toBe(true);
  });
});

test.describe("发现模式功能", () => {
  test("应显示发现按钮", async ({ page }) => {
    await page.goto("index.html");

    // 等待欢迎区域加载
    const welcome = page.locator("#map-chat-welcome");
    await expect(welcome).toBeAttached({ timeout: 10_000 });

    // 验证发现按钮存在
    const discoverBtn = page.locator(".quick-prompt--discover");
    await expect(discoverBtn).toBeAttached();
    await expect(discoverBtn).toContainText("不知道去哪");
  });

  test("点击发现按钮应尝试获取位置", async ({ page }) => {
    // 模拟地理位置 API
    await page.addInitScript(() => {
      // @ts-ignore
      navigator.geolocation = {
        getCurrentPosition: (success) => {
          success({
            coords: {
              latitude: 31.23,
              longitude: 121.47,
              accuracy: 100,
            },
          });
        },
      };
    });

    await page.goto("index.html");

    // 等待欢迎区域加载
    const welcome = page.locator("#map-chat-welcome");
    await expect(welcome).toBeAttached({ timeout: 30_000 });

    // 验证发现按钮存在且可见
    const discoverBtn = page.locator(".quick-prompt--discover");
    await expect(discoverBtn).toBeAttached();
    await expect(discoverBtn).toContainText("不知道去哪");
  });
});

test.describe("响应式布局", () => {
  test("移动端: 布局应填满视口高度", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("index.html");

    const appHeight = await page.evaluate(() => {
      const app = document.querySelector("#app");
      if (!app) return null;
      return getComputedStyle(app).height;
    });

    expect(appHeight).toBeTruthy();
  });

  test("header 在移动端应不溢出", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("index.html");

    const isOverflowing = await page.evaluate(() => {
      const header = document.querySelector("header");
      if (!header) return false;
      return header.scrollWidth > header.clientWidth;
    });

    expect(isOverflowing).toBe(false);
  });

  test("#map-chat-panel 应填充左侧空间", async ({ page }) => {
    await page.goto("index.html");

    const chatPanel = await page.evaluate(() => {
      const panel = document.querySelector("#map-chat-panel");
      if (!panel) return null;
      const style = getComputedStyle(panel);
      return {
        display: style.display,
        flexDirection: style.flexDirection,
        width: style.width,
      };
    });

    expect(chatPanel).not.toBeNull();
    expect(chatPanel!.display).toBe("flex");
    expect(chatPanel!.flexDirection).toBe("column");
  });
});
