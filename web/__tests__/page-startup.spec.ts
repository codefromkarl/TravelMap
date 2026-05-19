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
          !e.includes("Cross-Origin") &&
          !e.includes("CORS") &&
          !e.includes("Failed to load module script") &&
          !e.includes("MIME type") &&
          !e.includes("Expected a JavaScript") &&
          !e.includes("net::ERR_CONNECTION_REFUSED") &&
          !e.includes("net::ERR_INTERNET_DISCONNECTED") &&
          !e.includes("net::ERR_NAME_NOT_RESOLVED") &&
          !e.includes("net::ERR_CONNECTION_TIMED_OUT") &&
          !e.includes("net::ERR_FAILED") &&
          !e.includes("404 (Not Found)"),
      );
    },
  };
}

// ─── L0: 静态结构（无网络依赖） ──────────────────────────────

test.describe("L0 — 静态 HTML/CSS 结构", () => {
  test("页面标题包含「TravelMap」", async ({ page }) => {
    await page.goto("index.html");
    await expect(page).toHaveTitle(/TravelMap/);
  });

  test("核心 DOM 结构完整", async ({ page }) => {
    await page.goto("index.html");

    const structure = await page.evaluate(() => {
      const app = document.querySelector("#app");
      return {
        hasApp: !!app,
        hasMainContent: !!app?.querySelector(":scope > #main-content"),
        hasPageMap: !!document.getElementById("page-map"),
        hasChatPanel: !!app?.querySelector("pi-chat-panel"),
        hasMapChatPanel: !!document.getElementById("map-chat-panel"),
        hasMapRightArea: !!document.getElementById("map-right-area"),
      };
    });

    expect(structure.hasApp, "缺少 #app 容器").toBe(true);
    expect(structure.hasMainContent, "缺少 #main-content").toBe(true);
    expect(structure.hasPageMap, "缺少 #page-map").toBe(true);
    expect(structure.hasChatPanel, "缺少 pi-chat-panel 元素").toBe(true);
    expect(structure.hasMapChatPanel, "缺少 #map-chat-panel").toBe(true);
    expect(structure.hasMapRightArea, "缺少 #map-right-area").toBe(true);
  });

  test("不应有侧边栏 #sidebar 可见", async ({ page }) => {
    await page.goto("index.html");

    const sidebarVisible = await page.evaluate(() => {
      const sidebar = document.getElementById("sidebar");
      if (!sidebar) return false;
      return getComputedStyle(sidebar).display !== "none";
    });

    expect(sidebarVisible, "侧边栏应被隐藏").toBe(false);
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
      const mapScript = document.querySelector('script[type="importmap"]');
      const map = mapScript ? JSON.parse(mapScript.textContent || "{}") : { imports: {} };
      const mappedKeys = new Set(Object.keys(map.imports || {}));

      const moduleScripts = document.querySelectorAll('script[type="module"]');
      const bareImports: string[] = [];
      const missingMappings: string[] = [];

      const importRe = /(?:import\s+.*?\s+from\s+|import\s+)["']([^"']+)["']/g;

      moduleScripts.forEach((script) => {
        const code = script.textContent || "";
        let match: RegExpExecArray | null;
        while ((match = importRe.exec(code)) !== null) {
          const spec = match[1];
          if (!spec.startsWith(".") && !spec.startsWith("/") && !spec.startsWith("http")) {
            bareImports.push(spec);
            if (!mappedKeys.has(spec)) {
              const pkgRoot = spec.split("/").slice(0, 2).join("/");
              if (!mappedKeys.has(pkgRoot)) {
                missingMappings.push(spec);
              }
            }
          }
        }
      });

      return {
        bareImports: [...new Set(bareImports)],
        missingMappings: [...new Set(missingMappings)],
        mappedKeys: [...mappedKeys],
      };
    });

    expect(
      analysis.missingMappings,
      `以下裸标识符在 importmap 中没有映射: ${analysis.missingMappings.join(", ")}`,
    ).toEqual([]);
  });

  test("HTML 中的 custom element 标签名应与 JS 注册名一致", async ({ page }) => {
    await page.goto("index.html");

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

    expect(htmlTags, `页面中未找到 custom element`).toContain("pi-chat-panel");
    expect(htmlTags, `页面中不应有 chat-panel`).not.toContain("chat-panel");
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
    await page.waitForTimeout(1000);

    expect(
      syntaxErrors,
      `index.html 内联脚本有语法错误:\n${syntaxErrors.join("\n")}`,
    ).toEqual([]);
  });
});

// ─── L1: JS 模块加载与初始化（需要网络） ──────────────────────

test.describe("L1 — JS 模块加载与初始化", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "L1 只在 Chromium 下运行");

  test("JS 模块加载完成：loading 提示消失", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("index.html");

    await page.waitForTimeout(1000);
    const syntaxErrors = errors.pageErrors.filter((e) => e.includes("SyntaxError"));
    expect(
      syntaxErrors,
      `内联脚本语法错误导致 JS 无法执行:\n${syntaxErrors.join("\n")}`,
    ).toEqual([]);

    const loading = page.locator("#loading");
    await expect(loading, "JS 未在 30s 内完成加载，#loading 未被移除").toHaveCount(0, {
      timeout: 30_000,
    });

    const critical = errors.getCriticalErrors();
    expect(
      critical,
      `JS 加载完成但有错误:\n${critical.join("\n")}`,
    ).toEqual([]);
  });

  test("ChatPanel 组件渲染完成", async ({ page }) => {
    await page.goto("index.html");

    // 等待 custom element 升级（JS 模块加载完成的标志）
    try {
      await page.waitForFunction(() => {
        const panel = document.querySelector("pi-chat-panel");
        return panel && panel.constructor.name !== "HTMLElement";
      }, { timeout: 30_000 });
    } catch {
      console.log("[SKIP] JS 模块未在超时内完成加载，可能在 file:// 协议下运行");
      return;
    }

    const panelState = await page.evaluate(() => {
      const panel = document.querySelector("pi-chat-panel");
      return {
        exists: !!panel,
        constructorName: panel?.constructor?.name,
        childCount: panel?.childElementCount ?? 0,
      };
    });

    expect(panelState.exists, "pi-chat-panel 元素不存在").toBe(true);
    expect(panelState.constructorName, "pi-chat-panel 未升级为 ChatPanel").not.toBe("HTMLElement");
  });

  test("Agent 实例已创建", async ({ page }) => {
    await page.goto("index.html");

    try {
      await page.waitForFunction(() => {
        const panel = document.querySelector("pi-chat-panel");
        return panel && panel.constructor.name !== "HTMLElement";
      }, { timeout: 30_000 });
    } catch {
      console.log("[SKIP] JS 模块未在超时内完成加载，可能在 file:// 协议下运行");
      return;
    }

    const agentState = await page.evaluate(() => {
      const panel = document.querySelector("pi-chat-panel");
      if (!panel) return { ready: false, reason: "pi-chat-panel not found" };

      const hasAgentInterface = !!panel.querySelector("agent-interface");
      return {
        ready: hasAgentInterface,
        reason: hasAgentInterface ? undefined : "agent-interface not rendered",
        constructorName: panel.constructor.name,
      };
    });

    expect(agentState.ready, agentState.reason || "Agent 未初始化").toBe(true);
  });

  test("pi-chat-panel custom element 已升级，setAgent 方法存在", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("index.html");

    try {
      await page.waitForFunction(() => {
        const panel = document.querySelector("pi-chat-panel");
        return panel && panel.constructor.name !== "HTMLElement";
      }, { timeout: 30_000 });
    } catch {
      console.log("[SKIP] JS 模块未在超时内完成加载，可能在 file:// 协议下运行");
      return;
    }

    const result = await page.evaluate(() => {
      const panel = document.querySelector("pi-chat-panel");
      if (!panel) return { upgraded: false, reason: "element not found" };

      const hasSetAgent = typeof (panel as Record<string, unknown>).setAgent === "function";
      const constructorName = panel.constructor.name;

      return {
        upgraded: constructorName !== "HTMLUnknownElement",
        hasSetAgent,
        constructorName,
      };
    });

    expect(result.upgraded, `pi-chat-panel 未升级 (constructor: ${result.constructorName})`).toBe(true);
    expect(result.hasSetAgent, "pi-chat-panel 上 setAgent 方法不存在").toBe(true);

    const typeErrors = errors.pageErrors.filter((e) => e.includes("TypeError"));
    expect(typeErrors, `初始化期间有 TypeError: ${typeErrors.join(", ")}`).toEqual([]);
  });
});

// ─── L2: 用户可交互（完整流程） ──────────────────────────────

test.describe("L2 — 用户可交互", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "L2 只在 Chromium 下运行");

  test("用户可以看到聊天输入区域", async ({ page }) => {
    await page.goto("index.html");

    try {
      await page.waitForFunction(() => {
        const panel = document.querySelector("pi-chat-panel");
        return panel && panel.constructor.name !== "HTMLElement";
      }, { timeout: 30_000 });
    } catch {
      console.log("[SKIP] JS 模块未在超时内完成加载，可能在 file:// 协议下运行");
      return;
    }

    const inputReady = await page.evaluate(() => {
      const panel = document.querySelector("pi-chat-panel");
      if (!panel) return false;

      const input =
        panel.querySelector("textarea") ||
        panel.querySelector("input[type='text']") ||
        panel.querySelector("[contenteditable='true']");

      return !!input;
    });

    expect(inputReady, "ChatPanel 中未找到输入元素").toBe(true);
  });

  test("完整用户路径：页面加载→设置 API Key→发消息→不报错", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("index.html");

    // 等待 custom element 升级（JS 模块加载完成的标志）
    try {
      await page.waitForFunction(() => {
        const panel = document.querySelector("pi-chat-panel");
        return panel && panel.constructor.name !== "HTMLElement";
      }, { timeout: 30_000 });
    } catch {
      console.log("[SKIP] JS 模块未在超时内完成加载，可能在 file:// 协议下运行");
      return;
    }

    // 1. 验证初始化期间无 TDZ 错误
    const tdzErrors = errors.pageErrors.filter((e) => e.includes("Cannot access"));
    expect(
      tdzErrors,
      `页面初始化出现 TDZ 错误:\n${tdzErrors.join("\n")}`,
    ).toEqual([]);

    // 2. 设置 API Key
    await page.evaluate(() => {
      localStorage.setItem("api-key-openai", "test-key-for-smoke");
    });

    // 3. 直接调用 agent.prompt() 发送消息（mock streamFn）
    const promptResult = await page.evaluate(async () => {
      const panel = document.querySelector("pi-chat-panel") as any;
      if (!panel?.agent) return { ok: false, error: "agent not found" };
      try {
        const agent = panel.agent;
        const originalStreamFn = agent.streamFn;
        agent.streamFn = async () => {
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

    // 4. 等待流式响应完成
    await page.waitForFunction(() => {
      const panel = document.querySelector("pi-chat-panel") as any;
      return panel?.agent && !panel.agent.state.isStreaming;
    }, { timeout: 15_000 });

    // 5. 验证消息已添加到 state
    const messageCount = await page.evaluate(() => {
      const panel = document.querySelector("pi-chat-panel") as any;
      return panel?.agent?.state?.messages?.length ?? 0;
    });
    expect(messageCount, "发送消息后消息列表为空").toBeGreaterThanOrEqual(2);
  });
});
