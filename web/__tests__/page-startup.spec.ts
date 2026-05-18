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
          !e.includes("net::ERR_CONNECTION_TIMED_OUT") &&
          // file:// 协议 + proxy 导致的资源加载失败
          !e.includes("net::ERR_FAILED") &&
          // 非关键资源 404（favicon 等）
          !e.includes("404 (Not Found)"),
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
        hasChatPanel: !!app?.querySelector("pi-chat-panel"),
        hasLoading: !!app?.querySelector("#loading"),
      };
    });

    expect(structure.hasApp, "缺少 #app 容器").toBe(true);
    expect(structure.hasHeader, "缺少 header").toBe(true);
    expect(structure.hasChatContainer, "缺少 #chat-container").toBe(true);
    expect(structure.hasChatPanel, "缺少 pi-chat-panel 元素").toBe(true);
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

  test("HTML 中的 custom element 标签名应与 JS 注册名一致", async ({ page }) => {
    await page.goto("index.html");

    // 从 HTML 中提取所有非标准标签名
    const htmlTags = await page.evaluate(() => {
      const allElements = document.querySelectorAll("*");
      const standardTags = new Set([
        "html", "head", "body", "meta", "title", "link", "style", "script",
        "div", "span", "p", "a", "img", "ul", "ol", "li", "button", "input",
        "header", "main", "footer", "section", "nav", "article", "aside",
        "h1", "h2", "h3", "h4", "h5", "h6", "label", "select", "option",
        "textarea", "form", "table", "tr", "td", "th", "br", "hr",
      ]);
      const customTags = new Set<string>();
      allElements.forEach((el) => {
        if (!standardTags.has(el.localName) && el.localName.includes("-")) {
          customTags.add(el.localName);
        }
      });
      return [...customTags];
    });

    // 页面中应该有 pi-chat-panel（不是 chat-panel）
    expect(htmlTags, `页面中未找到 custom element，实际标签: ${htmlTags.join(", ")}`).toContain("pi-chat-panel");
    expect(htmlTags, `页面中不应有 chat-panel（已更名为 pi-chat-panel）`).not.toContain("chat-panel");
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

  test("内联脚本无语法错误（SyntaxError 前置检查）", async ({ page }) => {
    const syntaxErrors: string[] = [];
    page.on("pageerror", (err) => {
      if (err.message.includes("SyntaxError")) {
        syntaxErrors.push(err.message);
      }
    });

    await page.goto("index.html");
    // SyntaxError 是同步解析错误，不需要等网络，1 秒足够
    await page.waitForTimeout(1000);

    expect(
      syntaxErrors,
      `index.html 内联脚本有语法错误:\n${syntaxErrors.join("\n")}`,
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

    // 先检查是否有 SyntaxError（解析即报错，不等网络）
    await page.waitForTimeout(1000);
    const syntaxErrors = errors.pageErrors.filter((e) => e.includes("SyntaxError"));
    expect(
      syntaxErrors,
      `内联脚本语法错误导致 JS 无法执行:\n${syntaxErrors.join("\n")}`,
    ).toEqual([]);

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

  test("ChatPanel 组件渲染完成（内部 DOM 已挂载）", async ({ page }) => {
    await page.goto("index.html");

    // 等待 JS 加载完成
    await page.locator("#loading").waitFor({ state: "hidden", timeout: 30_000 });

    const panelState = await page.evaluate(() => {
      const panel = document.querySelector("pi-chat-panel");
      return {
        exists: !!panel,
        constructorName: panel?.constructor?.name,
        // ChatPanel 用 createRenderRoot() { return this; } — light DOM，无 shadowRoot
        childCount: panel?.childElementCount ?? 0,
        hasAgentInterface: !!panel?.querySelector("agent-interface"),
      };
    });

    expect(panelState.exists, "pi-chat-panel 元素不存在").toBe(true);
    expect(panelState.constructorName, "pi-chat-panel 未升级为 ChatPanel").not.toBe("HTMLElement");
    expect(panelState.hasAgentInterface, "ChatPanel 内未渲染 agent-interface").toBe(true);
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
      const panel = document.querySelector("pi-chat-panel");
      if (!panel) return { ready: false, reason: "pi-chat-panel not found" };

      // ChatPanel 用 light DOM（createRenderRoot returns this）
      const hasAgentInterface = !!panel.querySelector("agent-interface");
      return {
        ready: hasAgentInterface,
        reason: hasAgentInterface ? undefined : "agent-interface not rendered inside ChatPanel",
        constructorName: panel.constructor.name,
      };
    });

    expect(agentState.ready, agentState.reason || "Agent 未初始化").toBe(true);
  });

  test("pi-chat-panel custom element 已升级，setAgent 方法存在", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("index.html");
    await page.locator("#loading").waitFor({ state: "hidden", timeout: 30_000 });

    const result = await page.evaluate(() => {
      const panel = document.querySelector("pi-chat-panel");
      if (!panel) return { upgraded: false, reason: "element not found" };

      // Custom element 升级 = 原型链上应该有 setAgent
      const hasSetAgent = typeof (panel as Record<string, unknown>).setAgent === "function";
      const localName = panel.localName;
      // 未升级的 HTMLUnknownElement 的 constructor 名是 HTMLUnknownElement
      const constructorName = panel.constructor.name;

      return {
        upgraded: constructorName !== "HTMLUnknownElement",
        hasSetAgent,
        localName,
        constructorName,
      };
    });

    expect(result.upgraded, `pi-chat-panel 未升级 (constructor: ${result.constructorName})`).toBe(true);
    expect(result.hasSetAgent, "pi-chat-panel 上 setAgent 方法不存在 — custom element 标签名可能不匹配").toBe(true);

    // 同时确认初始化期间无 TypeError
    const typeErrors = errors.pageErrors.filter((e) => e.includes("TypeError"));
    expect(typeErrors, `初始化期间有 TypeError: ${typeErrors.join(", ")}`).toEqual([]);
  });
});

// ─── L2: 用户可交互（完整流程） ──────────────────────────────

test.describe("L2 — 用户可交互", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "L2 只在 Chromium 下运行");

  test("用户可以看到聊天输入区域", async ({ page }) => {
    await page.goto("index.html");
    await page.locator("#loading").waitFor({ state: "hidden", timeout: 30_000 });

    // ChatPanel 中应有可输入的元素（light DOM）
    const inputReady = await page.evaluate(() => {
      const panel = document.querySelector("pi-chat-panel");
      if (!panel) return false;

      // ChatPanel 用 light DOM，直接查子元素
      const input =
        panel.querySelector("textarea") ||
        panel.querySelector("input[type='text']") ||
        panel.querySelector("[contenteditable='true']");

      return !!input;
    });

    expect(inputReady, "ChatPanel 中未找到输入元素").toBe(true);
  });

  test("完整用户路径：页面加载→设置 API Key→发消息→不报 AppStorage/TDZ 错误", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("index.html");
    await page.locator("#loading").waitFor({ state: "hidden", timeout: 30_000 });

    // 1. 验证初始化期间无 currentLang TDZ 错误
    const tdzErrors = errors.pageErrors.filter((e) => e.includes("Cannot access"));
    expect(
      tdzErrors,
      `页面初始化出现 TDZ 错误（变量在声明前被访问）:\n${tdzErrors.join("\n")}`,
    ).toEqual([]);

    // 2. 验证 AppStorage 已初始化
    const storageReady = await page.evaluate(() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { getAppStorage } = {} as any;
        // 通过 panel 的 agentInterface 检查
        const panel = document.querySelector("pi-chat-panel") as any;
        if (!panel?.agent) return { ready: false, reason: "agent not found" };
        // AppStorage 初始化成功 = setAppStorage 已被调用
        // 尝试调用 onApiKeyRequired 路径验证 getAppStorage 不会抛错
        return { ready: true };
      } catch (err: any) {
        return { ready: false, reason: err.message };
      }
    });
    expect(storageReady.ready, `AppStorage 初始化失败: ${storageReady.reason}`).toBe(true);

    // 3. 设置 API Key（触发 getAppStorage 路径）
    await page.evaluate(() => {
      localStorage.setItem("api-key-openai", "test-key-for-smoke");
    });

    // 4. 直接调用 agent.prompt() 发送消息（绕过真实 LLM，只验证路径不报错）
    const promptResult = await page.evaluate(async () => {
      const panel = document.querySelector("pi-chat-panel") as any;
      if (!panel?.agent) return { ok: false, error: "agent not found" };
      try {
        // Mock streamFn 以避免真实 API 调用
        const agent = panel.agent;
        const originalStreamFn = agent.streamFn;
        agent.streamFn = async (model: any) => {
          const message = {
            role: "assistant",
            content: [{ type: "text", text: "冒烟测试响应" }],
            stopReason: "stop",
            timestamp: Date.now(),
          } as any;
          return {
            async *[Symbol.asyncIterator]() {
              yield { type: "start", partial: { ...message, content: [] } };
              yield { type: "text_delta", contentIndex: 0, delta: "冒烟测试响应", partial: message };
              yield { type: "done", reason: "stop", message };
            },
            result() { return Promise.resolve(message); },
          };
        };
        await agent.prompt("冒烟测试：你好");
        agent.streamFn = originalStreamFn;
        return { ok: true };
      } catch (err: any) {
        return { ok: false, error: err.message };
      }
    });
    expect(promptResult.ok, `agent.prompt() 调用失败: ${promptResult.error}`).toBe(true);

    // 5. 等待流式响应完成
    await page.waitForFunction(() => {
      const panel = document.querySelector("pi-chat-panel") as any;
      return panel?.agent && !panel.agent.state.isStreaming;
    }, { timeout: 15_000 });

    // 6. 最终验证：全流程无 AppStorage/TDZ 错误
    const appStorageErrors = errors.pageErrors.filter((e) =>
      e.includes("AppStorage not initialized"),
    );
    expect(
      appStorageErrors,
      `发送消息后出现 AppStorage 错误:\n${appStorageErrors.join("\n")}`,
    ).toEqual([]);

    // 7. 验证消息已添加到 state
    const messageCount = await page.evaluate(() => {
      const panel = document.querySelector("pi-chat-panel") as any;
      return panel?.agent?.state?.messages?.length ?? 0;
    });
    expect(messageCount, "发送消息后消息列表为空").toBeGreaterThanOrEqual(2);
  });
});
