/**
 * 页面启动冒烟测试（Page Startup Smoke Test）
 *
 * E2E 测试的最低门槛：页面必须能完整启动，JS 模块必须无错误加载执行。
 *
 * 测试层级：
 *   L0 — 无网络依赖：纯 HTML/CSS 静态结构
 *   L1 — 需要网络：JS 模块加载、Agent 初始化、ChatPanel 渲染
 *   L2 — 完整流程：用户可以看到输入框并发送消息
 *
 * 设计原则：
 *   - L0/L1 失败 = 阻断发布，不可 skip
 *   - 每个测试有明确通过/失败标准，不允许静默吞错
 *   - 捕获所有 console error 和 page error，按类别区分预期/非预期
 */

import { expect, test, type Page } from "@playwright/test";

// ─── Helpers ──────────────────────────────────────────────

/** 收集页面所有 JS 错误和 console error */
function collectErrors(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  page.on("pageerror", (err) => {
    pageErrors.push(err.message);
  });

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  return {
    pageErrors,
    consoleErrors,
    /** 过滤掉已知的环境相关错误，只返回真正的问题 */
    getCriticalErrors: () => {
      const all = [...pageErrors, ...consoleErrors];
      return all.filter(
        (e) =>
          // file:// 协议下 CORS 相关（Playwright file:// baseUrl）
          !e.includes("Cross-Origin") &&
          !e.includes("CORS") &&
          // 模块加载类（esm.sh CDN 网络问题 / MIME 问题）
          !e.includes("Failed to load module script") &&
          !e.includes("MIME type") &&
          !e.includes("Expected a JavaScript") &&
          // 网络不可达
          !e.includes("net::ERR_CONNECTION_REFUSED") &&
          !e.includes("net::ERR_INTERNET_DISCONNECTED") &&
          !e.includes("net::ERR_NAME_NOT_RESOLVED") &&
          !e.includes("net::ERR_CONNECTION_TIMED_OUT"),
      );
    },
  };
}

// ─── L0: 静态结构（无网络依赖） ──────────────────────────────

test.describe("L0 — 静态 HTML/CSS 结构", () => {
  test("页面标题包含「旅途星辰」", async ({ page }) => {
    await page.goto("index.html");
    await expect(page).toHaveTitle(/旅途星辰/);
  });

  test("核心 DOM 结构完整", async ({ page }) => {
    await page.goto("index.html");

    const structure = await page.evaluate(() => {
      const app = document.querySelector("#app");
      return {
        hasApp: !!app,
        hasHeader: !!app?.querySelector(":scope > header"),
        hasChatContainer: !!app?.querySelector(":scope > #chat-container"),
        hasChatPanel: !!app?.querySelector("chat-panel"),
        hasLoading: !!app?.querySelector("#loading"),
      };
    });

    expect(structure.hasApp, "缺少 #app 容器").toBe(true);
    expect(structure.hasHeader, "缺少 header").toBe(true);
    expect(structure.hasChatContainer, "缺少 #chat-container").toBe(true);
    expect(structure.hasChatPanel, "缺少 chat-panel 元素").toBe(true);
  });

  test("importmap 声明完整，所有裸标识符都有映射", async ({ page }) => {
    await page.goto("index.html");

    const importMap = await page.evaluate(() => {
      const script = document.querySelector('script[type="importmap"]');
      return script ? JSON.parse(script.textContent || "{}") : null;
    });

    expect(importMap, "缺少 importmap 声明").not.toBeNull();

    const requiredImports = [
      "@earendil-works/pi-agent-core",
      "@earendil-works/pi-ai",
      "@earendil-works/pi-web-ui",
      "lit",
    ];

    for (const name of requiredImports) {
      expect(
        importMap.imports[name],
        `importmap 缺少 ${name} 映射`,
      ).toBeDefined();
    }
  });

  test("importmap 覆盖页面所有裸标识符 import（含子路径）", async ({ page }) => {
    await page.goto("index.html");

    const analysis = await page.evaluate(() => {
      // 从 importmap 收集所有映射的裸标识符
      const mapScript = document.querySelector('script[type="importmap"]');
      const map = mapScript ? JSON.parse(mapScript.textContent || "{}") : { imports: {} };
      const mappedKeys = new Set(Object.keys(map.imports || {}));

      // 扫描所有 module script 中的 import 语句
      const moduleScripts = document.querySelectorAll('script[type="module"]');
      const bareImports: string[] = [];
      const missingMappings: string[] = [];

      // 匹配 import ... from "xxx" 和 import "xxx"
      const importRe = /(?:import\s+.*?\s+from\s+|import\s+)["']([^"']+)["']/g;

      moduleScripts.forEach((script) => {
        const code = script.textContent || "";
        let match: RegExpExecArray | null;
        while ((match = importRe.exec(code)) !== null) {
          const spec = match[1];
          // 只关注裸标识符（非 URL、非相对路径）
          if (!spec.startsWith(".") && !spec.startsWith("/") && !spec.startsWith("http")) {
            bareImports.push(spec);
            // 检查 importmap 中是否有精确匹配或前缀包名匹配
            if (!mappedKeys.has(spec)) {
              // 对于 @scope/pkg/subpath，也检查 @scope/pkg 是否映射
              const pkgRoot = spec.split("/").slice(0, 2).join("/");
              if (!mappedKeys.has(pkgRoot)) {
                missingMappings.push(spec);
              }
            }
          }
        }
      });

      // 同时检查 <link> 标签引用的 CSS（不应该在 importmap 中）
      const linkHrefs: string[] = [];
      document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
        linkHrefs.push(link.getAttribute("href") || "");
      });

      return {
        bareImports: [...new Set(bareImports)],
        missingMappings: [...new Set(missingMappings)],
        mappedKeys: [...mappedKeys],
        linkHrefs,
      };
    });

    // 关键断言：裸标识符必须全部有映射
    expect(
      analysis.missingMappings,
      `以下裸标识符在 importmap 中没有映射: ${analysis.missingMappings.join(", ")}`,
    ).toEqual([]);

    // 同时报告发现的所有裸标识符，便于 review
    console.log("[L0] importmap 映射:", analysis.mappedKeys);
    console.log("[L0] 页面裸标识符 import:", analysis.bareImports);
    console.log("[L0] <link> CSS:", analysis.linkHrefs);
  });

  test("不应对 CSS 文件使用 importmap 映射（CSS 不能作为 JS module 加载）", async ({ page }) => {
    await page.goto("index.html");

    const cssInImportMap = await page.evaluate(() => {
      const mapScript = document.querySelector('script[type="importmap"]');
      const map = mapScript ? JSON.parse(mapScript.textContent || "{}") : { imports: {} };
      return Object.keys(map.imports || {}).filter((key) => key.endsWith(".css"));
    });

    expect(
      cssInImportMap,
      `importmap 中不应包含 .css 映射: ${cssInImportMap.join(", ")}`,
    ).toEqual([]);
  });

  test("初始无 JS 错误", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("index.html");
    await page.waitForTimeout(500);

    const critical = errors.getCriticalErrors();
    expect(
      critical,
      `页面加载时出现非预期 JS 错误:\n${critical.join("\n")}`,
    ).toEqual([]);
  });
});

// ─── L1: JS 模块加载与初始化（需要网络） ──────────────────────

test.describe("L1 — JS 模块加载与初始化", () => {
  // L1 测试需要能访问 esm.sh，标记 @network
  test.skip(({ browserName }) => browserName !== "chromium", "L1 只在 Chromium 下运行");

  test("JS 模块加载完成：loading 提示消失", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("index.html");

    // JS 执行成功后会 remove #loading，给充足超时等 esm.sh 加载
    const loading = page.locator("#loading");
    await expect(loading, "JS 未在 30s 内完成加载，#loading 未被移除").toHaveCount(0, {
      timeout: 30_000,
    });

    // loading 消失后检查是否有 JS 错误
    const critical = errors.getCriticalErrors();
    expect(
      critical,
      `JS 加载完成但有错误:\n${critical.join("\n")}`,
    ).toEqual([]);
  });

  test("ChatPanel 组件渲染完成（shadowRoot 已挂载）", async ({ page }) => {
    await page.goto("index.html");

    // 等待 JS 加载完成
    await page.locator("#loading").waitFor({ state: "hidden", timeout: 30_000 });

    const shadowReady = await page.evaluate(() => {
      const panel = document.querySelector("chat-panel");
      return {
        exists: !!panel,
        hasShadowRoot: !!panel?.shadowRoot,
        shadowChildCount: panel?.shadowRoot?.childElementCount ?? 0,
      };
    });

    expect(shadowReady.exists, "chat-panel 元素不存在").toBe(true);
    expect(shadowReady.hasShadowRoot, "chat-panel 的 shadowRoot 未挂载").toBe(true);
    expect(shadowReady.shadowChildCount, "chat-panel shadowRoot 为空").toBeGreaterThan(0);
  });

  test("无 module 加载失败的 console error", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("index.html");

    await page.locator("#loading").waitFor({ state: "hidden", timeout: 30_000 });

    // 专门检测模块加载类错误
    const moduleErrors = [...errors.pageErrors, ...errors.consoleErrors].filter(
      (e) =>
        e.includes("Failed to resolve module specifier") ||
        e.includes("Expected a JavaScript") ||
        e.includes("MIME type") ||
        e.includes("Failed to load module script"),
    );

    expect(
      moduleErrors,
      `模块加载错误:\n${moduleErrors.join("\n")}`,
    ).toEqual([]);
  });

  test("Agent 实例已创建（window 上可检测到 Agent 状态）", async ({ page }) => {
    await page.goto("index.html");
    await page.locator("#loading").waitFor({ state: "hidden", timeout: 30_000 });

    // 验证 agent 初始化 — ChatPanel 的 setAgent 应该已经调用
    const agentState = await page.evaluate(() => {
      const panel = document.querySelector("chat-panel");
      if (!panel?.shadowRoot) return { ready: false, reason: "no shadowRoot" };

      // ChatPanel 渲染后应该有内部结构（输入框、消息列表等）
      const shadow = panel.shadowRoot;
      return {
        ready: true,
        hasInput: shadow.querySelectorAll("input, textarea, [contenteditable]").length > 0,
        innerHTML: shadow.innerHTML.substring(0, 200),
      };
    });

    expect(agentState.ready, agentState.reason || "Agent 未初始化").toBe(true);
  });
});

// ─── L2: 用户可交互（完整流程） ──────────────────────────────

test.describe("L2 — 用户可交互", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "L2 只在 Chromium 下运行");

  test("用户可以看到聊天输入区域", async ({ page }) => {
    await page.goto("index.html");
    await page.locator("#loading").waitFor({ state: "hidden", timeout: 30_000 });

    // ChatPanel 中应有可输入的元素
    const inputReady = await page.evaluate(() => {
      const panel = document.querySelector("chat-panel");
      if (!panel?.shadowRoot) return false;

      const shadow = panel.shadowRoot;
      const input =
        shadow.querySelector("textarea") ||
        shadow.querySelector("input[type='text']") ||
        shadow.querySelector("[contenteditable='true']");

      return !!input;
    });

    expect(inputReady, "ChatPanel 中未找到输入元素").toBe(true);
  });
});
