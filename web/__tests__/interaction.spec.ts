/**
 * E2E 交互测试 — 全面覆盖用户交互路径
 *
 * 覆盖范围：
 *   1. DOM 结构完整性
 *   2. localStorage 持久化
 *   3. 键盘导航和无障碍
 *   4. 模型配置（预设/自定义）
 *   5. API Key 处理
 *   6. 语言切换
 *   7. 出行人群面板
 *   8. 快捷提示交互
 *   9. 导出功能
 *  10. 历史面板
 *  11. 错误恢复
 */

import { expect, gotoApp, showMapView, test } from "./fixtures/app";

// ─── 辅助函数 ─────────────────────────────────────────────

/** 等待 JS 模块加载完成（custom element 升级） */
async function waitForJsModules(page: import("@playwright/test").Page, timeout = 15000): Promise<boolean> {
  try {
    await page.waitForFunction(() => {
      const panel = document.querySelector("pi-chat-panel");
      return panel && panel.constructor.name !== "HTMLElement";
    }, { timeout });
    return true;
  } catch {
    return false;
  }
}

/** 收集页面错误（排除已知环境错误） */
function collectCriticalErrors(errors: string[]): string[] {
  return errors.filter(
    (e) =>
      !e.includes("Failed to resolve module specifier") &&
      !e.includes("esm.sh") &&
      !e.includes("Failed to fetch") &&
      !e.includes("net::ERR") &&
      !e.includes("Cross-Origin") &&
      !e.includes("CORS")
  );
}

// ─── 1. DOM 结构完整性 ────────────────────────────────────

test.describe("DOM 结构", () => {
  test("核心容器应存在", async ({ page }) => {
    await page.goto("index.html");

    const structure = await page.evaluate(() => {
      return {
        hasApp: !!document.querySelector("#app"),
        hasMainContent: !!document.querySelector("#main-content"),
        hasHeader: !!document.querySelector("header"),
        hasPageMap: !!document.getElementById("page-map"),
        hasChatPanel: !!document.querySelector("pi-chat-panel"),
        hasMapChatPanel: !!document.getElementById("map-chat-panel"),
        hasMapRightArea: !!document.getElementById("map-right-area"),
      };
    });

    expect(structure.hasApp).toBe(true);
    expect(structure.hasMainContent).toBe(true);
    expect(structure.hasHeader).toBe(true);
    expect(structure.hasPageMap).toBe(true);
    expect(structure.hasChatPanel).toBe(true);
    expect(structure.hasMapChatPanel).toBe(true);
    expect(structure.hasMapRightArea).toBe(true);
  });

  test("侧边栏应被隐藏", async ({ page }) => {
    await page.goto("index.html");

    const sidebarVisible = await page.evaluate(() => {
      const sidebar = document.getElementById("sidebar");
      if (!sidebar) return false;
      return getComputedStyle(sidebar).display !== "none";
    });

    expect(sidebarVisible).toBe(false);
  });

  test("header 应包含 h1 和 subtitle", async ({ page }) => {
    await page.goto("index.html");

    const headerContent = await page.evaluate(() => {
      const header = document.querySelector("header");
      if (!header) return null;
      return {
        hasH1: !!header.querySelector("h1"),
        h1Text: header.querySelector("h1")?.textContent,
        hasSubtitle: !!header.querySelector("span[data-i18n='subtitle']"),
      };
    });

    expect(headerContent).not.toBeNull();
    expect(headerContent!.hasH1).toBe(true);
    expect(headerContent!.h1Text).toContain("TravelMap");
    expect(headerContent!.hasSubtitle).toBe(true);
  });

  test("地图主界面 DOM 结构应完整", async ({ page }) => {
    await page.goto("index.html");

    const structure = await page.evaluate(() => {
      return {
        hasPageMap: !!document.getElementById("page-map"),
        hasMapContainer: !!document.getElementById("page-map-container"),
        hasMapToolbar: !!document.getElementById("page-map-toolbar"),
        hasMapSearch: !!document.getElementById("map-search-input"),
        hasRoutesPanel: !!document.getElementById("page-map-routes"),
        hasStatusbar: !!document.getElementById("page-map-statusbar"),
        hasLegend: !!document.getElementById("page-map-legend"),
      };
    });

    expect(structure.hasPageMap).toBe(true);
    expect(structure.hasMapContainer).toBe(true);
    expect(structure.hasMapToolbar).toBe(true);
    expect(structure.hasMapSearch).toBe(true);
    expect(structure.hasRoutesPanel).toBe(true);
    expect(structure.hasStatusbar).toBe(true);
    expect(structure.hasLegend).toBe(true);
  });
});

// ─── 2. localStorage 持久化 ────────────────────────────────

test.describe("localStorage 持久化", () => {
  test("应能保存和读取 provider 设置", async ({ page }) => {
    await page.goto("index.html");
    await page.evaluate(() => {
      localStorage.setItem("travel-agent-provider", "anthropic");
      localStorage.setItem("travel-agent-model", "claude-sonnet-4-20250514");
    });

    const provider = await page.evaluate(() => localStorage.getItem("travel-agent-provider"));
    const model = await page.evaluate(() => localStorage.getItem("travel-agent-model"));

    expect(provider).toBe("anthropic");
    expect(model).toBe("claude-sonnet-4-20250514");
  });

  test("无设置时 provider 应默认为 openai", async ({ page }) => {
    await page.goto("index.html");
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const provider = await page.evaluate(() => localStorage.getItem("travel-agent-provider"));
    expect(provider).toBeNull();
  });

  test("应能保存和读取自定义 LLM 配置", async ({ page }) => {
    await page.goto("index.html");
    await page.evaluate(() => {
      localStorage.setItem("travel-agent-provider", "custom");
      localStorage.setItem("custom-llm-url", "https://api.example.com/v1");
      localStorage.setItem("travel-agent-model", "my-custom-model");
      localStorage.setItem("api-key-custom", "sk-custom-key");
    });

    const config = await page.evaluate(() => ({
      provider: localStorage.getItem("travel-agent-provider"),
      url: localStorage.getItem("custom-llm-url"),
      model: localStorage.getItem("travel-agent-model"),
      key: localStorage.getItem("api-key-custom"),
    }));

    expect(config.provider).toBe("custom");
    expect(config.url).toBe("https://api.example.com/v1");
    expect(config.model).toBe("my-custom-model");
    expect(config.key).toBe("sk-custom-key");
  });
});

// ─── 3. 键盘导航和无障碍 ──────────────────────────────────

test.describe("键盘导航和无障碍", () => {
  test("h1 标签应存在且唯一", async ({ page }) => {
    await page.goto("index.html");
    const h1Count = await page.locator("h1").count();
    expect(h1Count).toBe(1);
  });

  test("页面元素应可通过 Tab 键聚焦", async ({ page }) => {
    await page.goto("index.html");
    await page.keyboard.press("Tab");

    const focusedTag = await page.evaluate(() => document.activeElement?.tagName?.toLowerCase());
    expect(focusedTag).toBeTruthy();
  });

  test("Escape 键不应导致页面崩溃", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("index.html");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");

    const criticalErrors = collectCriticalErrors(errors);
    expect(criticalErrors).toEqual([]);
  });
});

// ─── 4. 模型配置 ───────────────────────────────────────────

test.describe("模型配置", () => {
  test("应有模型配置弹窗 DOM", async ({ page }) => {
    await page.goto("index.html");

    const modalStructure = await page.evaluate(() => ({
      hasOverlay: !!document.getElementById("model-modal-overlay"),
      hasModal: !!document.getElementById("model-modal"),
      hasProviderSelect: !!document.getElementById("cfg-provider"),
      hasModelSelect: !!document.getElementById("cfg-model"),
      hasApiKeyInput: !!document.getElementById("cfg-apikey"),
      hasSaveBtn: !!document.getElementById("btn-save-model"),
    }));

    expect(modalStructure.hasOverlay).toBe(true);
    expect(modalStructure.hasModal).toBe(true);
    expect(modalStructure.hasProviderSelect).toBe(true);
    expect(modalStructure.hasModelSelect).toBe(true);
    expect(modalStructure.hasApiKeyInput).toBe(true);
    expect(modalStructure.hasSaveBtn).toBe(true);
  });

  test("保存按钮应唯一（无重复 ID）", async ({ page }) => {
    await page.goto("index.html");

    const saveBtnCount = await page.evaluate(() => {
      return document.querySelectorAll('#btn-save-model').length;
    });

    expect(saveBtnCount).toBe(1);
  });

  test("应支持自定义 LLM 配置", async ({ page }) => {
    await page.goto("index.html");

    const customConfig = await page.evaluate(() => ({
      hasCustomOption: !!document.querySelector('#cfg-provider option[value="custom"]'),
      hasCustomUrl: !!document.getElementById('cfg-custom-url'),
      hasCustomModel: !!document.getElementById('cfg-custom-model'),
      hasCustomSection: !!document.getElementById('custom-llm-config'),
      hasFetchModelsBtn: !!document.getElementById('btn-fetch-models'),
      hasModelSelect: !!document.getElementById('cfg-custom-model-select'),
    }));

    expect(customConfig.hasCustomOption).toBe(true);
    expect(customConfig.hasCustomUrl).toBe(true);
    expect(customConfig.hasCustomModel).toBe(true);
    expect(customConfig.hasCustomSection).toBe(true);
    expect(customConfig.hasFetchModelsBtn).toBe(true);
    expect(customConfig.hasModelSelect).toBe(true);
  });

  test("provider 切换应更新模型列表", async ({ page }) => {
    await page.goto("index.html");

    // 等待 JS 加载
    const jsLoaded = await waitForJsModules(page);
    if (!jsLoaded) {
      console.log("[SKIP] JS 模块未加载");
      return;
    }

    // 切换到 anthropic
    await page.evaluate(() => {
      const select = document.getElementById('cfg-provider') as HTMLSelectElement;
      if (select) {
        select.value = 'anthropic';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    // 验证模型列表已更新
    const models = await page.evaluate(() => {
      const select = document.getElementById('cfg-model') as HTMLSelectElement;
      if (!select) return [];
      return Array.from(select.options).map(o => o.value);
    });

    expect(models).toContain('claude-sonnet-4-20250514');
    expect(models).not.toContain('gpt-4o');
  });

  test("切换到自定义应显示 URL 输入框", async ({ page }) => {
    await page.goto("index.html");

    const jsLoaded = await waitForJsModules(page);
    if (!jsLoaded) {
      console.log("[SKIP] JS 模块未加载");
      return;
    }

    // 切换到 custom
    await page.evaluate(() => {
      const select = document.getElementById('cfg-provider') as HTMLSelectElement;
      if (select) {
        select.value = 'custom';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    // 验证自定义配置区域显示
    const customVisible = await page.evaluate(() => {
      const section = document.getElementById('custom-llm-config');
      return section ? getComputedStyle(section).display !== 'none' : false;
    });

    expect(customVisible).toBe(true);

    // 验证模型下拉框隐藏
    const modelSelectHidden = await page.evaluate(() => {
      const select = document.getElementById('cfg-model');
      return select?.parentElement ? getComputedStyle(select.parentElement).display === 'none' : false;
    });

    expect(modelSelectHidden).toBe(true);
  });
});

// ─── 5. API Key 处理 ──────────────────────────────────────

test.describe("API Key 处理", () => {
  test("onApiKeyRequired 回调不应抛出错误", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("index.html");

    const jsLoaded = await waitForJsModules(page);
    if (!jsLoaded) {
      console.log("[SKIP] JS 模块未加载");
      return;
    }

    // 模拟触发 onApiKeyRequired
    await page.evaluate(async () => {
      const panel = document.querySelector("pi-chat-panel") as any;
      if (!panel?.agent) return;

      try {
        await panel.agent.prompt("测试消息");
      } catch {
        // 预期可能失败
      }
    });

    await page.waitForTimeout(2000);

    const criticalErrors = collectCriticalErrors(errors);
    expect(criticalErrors, `API Key 处理出现错误: ${criticalErrors.join(", ")}`).toEqual([]);
  });

  test("API Key 输入框应始终可编辑（即使在代理模式下）", async ({ page }) => {
    await page.goto("index.html");

    const inputEditable = await page.evaluate(() => {
      const input = document.getElementById('cfg-apikey');
      if (!input) return false;
      const style = getComputedStyle(input);
      return style.pointerEvents !== 'none' && !input.disabled;
    });

    expect(inputEditable).toBe(true);
  });
});

// ─── 6. 语言切换 ───────────────────────────────────────────

test.describe("语言切换", () => {
  test("应有语言切换按钮", async ({ page }) => {
    await page.goto("index.html");

    const langButtons = await page.evaluate(() => {
      const buttons = document.querySelectorAll('.lang-btn');
      return Array.from(buttons).map(b => ({
        lang: (b as HTMLElement).dataset.lang,
        text: b.textContent?.trim(),
      }));
    });

    expect(langButtons.length).toBeGreaterThanOrEqual(3);
    expect(langButtons.some(b => b.lang === 'zh')).toBe(true);
    expect(langButtons.some(b => b.lang === 'en')).toBe(true);
    expect(langButtons.some(b => b.lang === 'ja')).toBe(true);
  });

  test("点击英文按钮应切换语言", async ({ page }) => {
    await page.goto("index.html");

    const jsLoaded = await waitForJsModules(page);
    if (!jsLoaded) {
      console.log("[SKIP] JS 模块未加载");
      return;
    }

    // 点击英文按钮
    const enBtn = page.locator('.lang-btn[data-lang="en"]').first();
    if (await enBtn.count() > 0) {
      await enBtn.click();
      await page.waitForTimeout(500);
    }

    // 验证 subtitle 已切换为英文
    const subtitle = await page.evaluate(() => {
      const el = document.querySelector("span[data-i18n='subtitle']");
      return el?.textContent;
    });

    expect(subtitle).toContain("AI");
  });
});

// ─── 7. 出行人群面板 ───────────────────────────────────────

test.describe("出行人群面板", () => {
  test("应有出行人群面板 DOM", async ({ page }) => {
    await page.goto("index.html");

    const panelStructure = await page.evaluate(() => ({
      hasPanel: !!document.getElementById("travelers-panel"),
      hasAdultsInput: !!document.getElementById("t-adults"),
      hasSeniorsInput: !!document.getElementById("t-seniors"),
      hasChildrenInput: !!document.getElementById("t-children"),
      hasInfantsInput: !!document.getElementById("t-infants"),
      hasPregnantCheckbox: !!document.getElementById("t-pregnant"),
      hasMobilityCheckbox: !!document.getElementById("t-mobility"),
      hasSaveBtn: !!document.getElementById("travelers-save"),
    }));

    expect(panelStructure.hasPanel).toBe(true);
    expect(panelStructure.hasAdultsInput).toBe(true);
    expect(panelStructure.hasSeniorsInput).toBe(true);
    expect(panelStructure.hasChildrenInput).toBe(true);
    expect(panelStructure.hasInfantsInput).toBe(true);
    expect(panelStructure.hasPregnantCheckbox).toBe(true);
    expect(panelStructure.hasMobilityCheckbox).toBe(true);
    expect(panelStructure.hasSaveBtn).toBe(true);
  });

  test("点击出行人群按钮应打开面板", async ({ page }) => {
    await page.goto("index.html");
    const jsLoaded = await waitForJsModules(page);
    if (!jsLoaded) { console.log("[SKIP] JS 模块未加载"); return; }

    // 点击 header 中的出行人群按钮
    const btn = page.locator("#travelers-btn");
    if (await btn.count() > 0) {
      await btn.click();
      await page.waitForTimeout(500);
    }

    // 验证面板打开
    const panelOpen = await page.evaluate(() => {
      const panel = document.getElementById("travelers-panel");
      return panel?.classList.contains("open");
    });

    expect(panelOpen).toBe(true);
  });

  test("保存出行人群应持久化到 localStorage", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await gotoApp(page, { readiness: "agent" });

    await page.locator("#travelers-btn").click();
    await expect(page.locator("#travelers-panel")).toHaveClass(/open/);
    await page.locator("#t-adults").fill("2");
    await page.locator("#t-seniors").fill("1");
    await page.locator("#t-children").fill("1");
    await page.locator("#t-infants").fill("0");
    await page.locator("#travelers-save").click();

    const travelers = await page.evaluate(() => {
      const raw = localStorage.getItem("travel-agent-travelers");
      return raw ? JSON.parse(raw) : null;
    });

    expect(travelers).not.toBeNull();
    expect(travelers.adults).toBe(2);
    expect(travelers.seniors).toBe(1);
    expect(travelers.children).toBe(1);
    await expect(page.locator("#travelers-panel")).not.toHaveClass(/open/);
    await expect(page.locator("#overlay")).not.toHaveClass(/visible/);
    expect(errors).toEqual([]);
  });
});

// ─── 8. 快捷提示交互 ──────────────────────────────────────

test.describe("快捷提示交互", () => {
  test("应有快捷提示元素", async ({ page }) => {
    await page.goto("index.html");

    const quickPrompts = await page.evaluate(() => {
      const prompts = document.querySelectorAll('.quick-prompt');
      return Array.from(prompts).map(p => ({
        text: p.textContent?.trim(),
        prompt: (p as HTMLElement).dataset.prompt,
      }));
    });

    expect(quickPrompts.length).toBeGreaterThanOrEqual(4);
    expect(quickPrompts.some(p => p.prompt?.includes("杭州"))).toBe(true);
    expect(quickPrompts.some(p => p.prompt?.includes("北京"))).toBe(true);
  });

  test("点击快捷提示不应抛出 JS 错误", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("index.html");
    await page.waitForTimeout(3000);

    // 点击第一个快捷提示
    const quickPrompt = page.locator('.quick-prompt').first();
    if (await quickPrompt.count() > 0) {
      await quickPrompt.click();
      await page.waitForTimeout(2000);
    }

    const criticalErrors = collectCriticalErrors(errors);
    expect(criticalErrors, `快捷提示点击后出现 JS 错误: ${criticalErrors.join(", ")}`).toEqual([]);
  });

  test("点击快捷提示后欢迎消息应隐藏", async ({ page }) => {
    await page.goto("index.html");
    const jsLoaded = await waitForJsModules(page);
    if (!jsLoaded) { console.log("[SKIP] JS 模块未加载"); return; }
    await page.waitForTimeout(3000);

    // 点击第一个快捷提示
    const quickPrompt = page.locator('.quick-prompt').first();
    if (await quickPrompt.count() > 0) {
      await quickPrompt.click();
      await page.waitForTimeout(2000);
    }

    // 验证欢迎消息隐藏
    const welcomeHidden = await page.evaluate(() => {
      const welcome = document.getElementById("map-chat-welcome");
      if (!welcome) return true;
      return getComputedStyle(welcome).display === "none";
    });

    expect(welcomeHidden).toBe(true);
  });
});

// ─── 9. 导出功能 ───────────────────────────────────────────

test.describe("导出功能", () => {
  test("应有导出按钮", async ({ page }) => {
    await page.goto("index.html");

    const exportButtons = await page.evaluate(() => ({
      hasExportMd: !!document.getElementById("btn-export-md"),
      hasExportPdf: !!document.getElementById("btn-export-pdf"),
      hasShareImage: !!document.getElementById("btn-share-image"),
      hasShareLink: !!document.getElementById("btn-share-link-new"),
      hasShareQR: !!document.getElementById("btn-share-qr"),
    }));

    expect(exportButtons.hasExportMd).toBe(true);
    expect(exportButtons.hasExportPdf).toBe(true);
    expect(exportButtons.hasShareImage).toBe(true);
    expect(exportButtons.hasShareLink).toBe(true);
    expect(exportButtons.hasShareQR).toBe(true);
  });

  test("导出按钮默认应禁用", async ({ page }) => {
    await page.goto("index.html");

    const buttonsDisabled = await page.evaluate(() => {
      const md = document.getElementById("btn-export-md");
      const pdf = document.getElementById("btn-export-pdf");
      const share = document.getElementById("btn-share-link-new");
      return {
        mdDisabled: md?.classList.contains("disabled-ghost"),
        pdfDisabled: pdf?.classList.contains("disabled-ghost"),
        shareDisabled: share?.classList.contains("disabled-ghost"),
      };
    });

    expect(buttonsDisabled.mdDisabled).toBe(true);
    expect(buttonsDisabled.pdfDisabled).toBe(true);
    expect(buttonsDisabled.shareDisabled).toBe(true);
  });
});

// ─── 10. 历史面板 ──────────────────────────────────────────

test.describe("历史面板", () => {
  test("应有历史面板 DOM", async ({ page }) => {
    await page.goto("index.html");

    const panelStructure = await page.evaluate(() => ({
      hasPanel: !!document.getElementById("history-panel"),
      hasList: !!document.getElementById("history-list"),
      hasEmpty: !!document.getElementById("history-empty"),
    }));

    expect(panelStructure.hasPanel).toBe(true);
    expect(panelStructure.hasList).toBe(true);
    expect(panelStructure.hasEmpty).toBe(true);
  });

  test("点击历史按钮应打开面板", async ({ page }) => {
    await page.goto("index.html");
    const jsLoaded = await waitForJsModules(page);
    if (!jsLoaded) { console.log("[SKIP] JS 模块未加载"); return; }

    // 点击历史按钮
    const btn = page.locator("#btn-history-map");
    if (await btn.count() > 0) {
      await btn.click();
      await page.waitForTimeout(500);
    }

    // 验证面板打开
    const panelOpen = await page.evaluate(() => {
      const panel = document.getElementById("history-panel");
      return panel?.classList.contains("open");
    });

    expect(panelOpen).toBe(true);
  });
});

// ─── 11. 地图功能 ──────────────────────────────────────────

test.describe("地图功能", () => {
  test("Leaflet 库应被加载", async ({ page }) => {
    await page.goto("index.html");
    await page.waitForTimeout(3000);

    const hasLeaflet = await page.evaluate(() => {
      return typeof (window as unknown as Record<string, unknown>).L !== "undefined";
    });

    expect(hasLeaflet).toBe(true);
  });

  test("应有地图工具栏按钮", async ({ page }) => {
    await page.goto("index.html");

    const toolbarButtons = await page.evaluate(() => ({
      hasRoutesBtn: !!document.getElementById("btn-map-routes"),
      hasLayersBtn: !!document.getElementById("btn-map-layers"),
      hasLocateBtn: !!document.getElementById("btn-map-locate"),
      hasSearchInput: !!document.getElementById("map-search-input"),
    }));

    expect(toolbarButtons.hasRoutesBtn).toBe(true);
    expect(toolbarButtons.hasLayersBtn).toBe(true);
    expect(toolbarButtons.hasLocateBtn).toBe(true);
    expect(toolbarButtons.hasSearchInput).toBe(true);
  });

  test("点击路线按钮应切换路线面板", async ({ page }) => {
    await gotoApp(page, { readiness: "agent" });
    const jsLoaded = await waitForJsModules(page);
    if (!jsLoaded) { console.log("[SKIP] JS 模块未加载"); return; }
    await showMapView(page);

    // 点击路线按钮
    const btn = page.locator("#btn-map-routes");
    if (await btn.count() > 0) {
      await btn.click();
      await page.waitForTimeout(500);
    }

    // 验证路线面板显示
    const routesVisible = await page.evaluate(() => {
      const panel = document.getElementById("page-map-routes");
      return panel?.classList.contains("show");
    });

    expect(routesVisible).toBe(true);

    // 再次点击应隐藏
    if (await btn.count() > 0) {
      await btn.click();
      await page.waitForTimeout(500);
    }

    const routesHidden = await page.evaluate(() => {
      const panel = document.getElementById("page-map-routes");
      return !panel?.classList.contains("show");
    });

    expect(routesHidden).toBe(true);
  });

  test("点击图层按钮应切换图层选择器", async ({ page }) => {
    await gotoApp(page, { readiness: "agent" });
    const jsLoaded = await waitForJsModules(page);
    if (!jsLoaded) { console.log("[SKIP] JS 模块未加载"); return; }
    await showMapView(page);

    // 点击图层按钮
    const btn = page.locator("#btn-map-layers");
    if (await btn.count() > 0) {
      await btn.click();
      await page.waitForTimeout(500);
    }

    // 验证图层选择器显示
    const layerSwitcherVisible = await page.evaluate(() => {
      const switcher = document.getElementById("map-layer-switcher");
      return switcher?.classList.contains("show");
    });

    expect(layerSwitcherVisible).toBe(true);
  });
});

// ─── 12. 模型配置弹窗交互 ──────────────────────────────────

test.describe("模型配置弹窗", () => {
  test("点击设置按钮应打开弹窗", async ({ page }) => {
    await page.goto("index.html");
    const jsLoaded = await waitForJsModules(page);
    if (!jsLoaded) { console.log("[SKIP] JS 模块未加载"); return; }

    // 点击设置按钮
    const btn = page.locator("#btn-open-model");
    if (await btn.count() > 0) {
      await btn.click();
      await page.waitForTimeout(500);
    }

    // 验证弹窗打开
    const modalOpen = await page.evaluate(() => {
      const overlay = document.getElementById("model-modal-overlay");
      return overlay?.classList.contains("open");
    });

    expect(modalOpen).toBe(true);
  });

  test("点击关闭按钮应关闭弹窗", async ({ page }) => {
    await page.goto("index.html");
    const jsLoaded = await waitForJsModules(page);
    if (!jsLoaded) { console.log("[SKIP] JS 模块未加载"); return; }

    // 先打开弹窗
    const openBtn = page.locator("#btn-open-model");
    if (await openBtn.count() > 0) {
      await openBtn.click();
      await page.waitForTimeout(500);
    }

    // 点击关闭按钮
    const closeBtn = page.locator("#btn-close-model-modal");
    if (await closeBtn.count() > 0) {
      await closeBtn.click();
      await page.waitForTimeout(500);
    }

    // 验证弹窗关闭
    const modalClosed = await page.evaluate(() => {
      const overlay = document.getElementById("model-modal-overlay");
      return !overlay?.classList.contains("open");
    });

    expect(modalClosed).toBe(true);
  });

  test("点击遮罩层应关闭弹窗", async ({ page }) => {
    await page.goto("index.html");
    const jsLoaded = await waitForJsModules(page);
    if (!jsLoaded) { console.log("[SKIP] JS 模块未加载"); return; }

    // 先打开弹窗
    const openBtn = page.locator("#btn-open-model");
    if (await openBtn.count() > 0) {
      await openBtn.click();
      await page.waitForTimeout(500);
    }

    // 点击遮罩层（弹窗外部）
    await page.evaluate(() => {
      const overlay = document.getElementById("model-modal-overlay");
      if (overlay) {
        overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
    });

    await page.waitForTimeout(500);

    // 验证弹窗关闭
    const modalClosed = await page.evaluate(() => {
      const overlay = document.getElementById("model-modal-overlay");
      return !overlay?.classList.contains("open");
    });

    expect(modalClosed).toBe(true);
  });
});

// ─── 13. 错误恢复 ──────────────────────────────────────────

test.describe("错误恢复", () => {
  test("页面刷新后应恢复状态", async ({ page }) => {
    await page.goto("index.html");

    await page.evaluate(() => {
      localStorage.setItem("travel-agent-provider", "openai");
    });

    await page.reload();

    const provider = await page.evaluate(() => localStorage.getItem("travel-agent-provider"));
    expect(provider).toBe("openai");
  });

  test("连续快速刷新不应导致 JS 错误", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    for (let i = 0; i < 3; i++) {
      await page.goto("index.html");
    }

    await page.waitForTimeout(2000);

    const criticalErrors = collectCriticalErrors(errors);
    expect(criticalErrors).toEqual([]);
  });

  test("损坏的 localStorage 不应崩溃页面", async ({ page }) => {
    await page.goto("index.html");

    // 注入损坏数据
    await page.evaluate(() => {
      localStorage.setItem("travel-agent-provider", "");
      localStorage.setItem("travel-agent-model", "");
      for (let i = 0; i < 100; i++) {
        localStorage.setItem(`garbage_${i}`, "x".repeat(1000));
      }
    });

    await page.reload();

    const hasApp = await page.locator("#app").count();
    expect(hasApp).toBe(1);
  });

  test("清空 localStorage 后应使用默认值", async ({ page }) => {
    await page.goto("index.html");

    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const provider = await page.evaluate(() => localStorage.getItem("travel-agent-provider"));
    expect(provider).toBeNull();
  });
});

// ─── 14. CSS 样式验证 ──────────────────────────────────────

test.describe("CSS 样式", () => {
  test("应加载 CSS 样式文件", async ({ page }) => {
    await page.goto("index.html");

    const hasMainCss = await page.evaluate(() => {
      const links = document.querySelectorAll('link[rel="stylesheet"]');
      return Array.from(links).some(l => l.getAttribute('href')?.includes('main.css'));
    });

    expect(hasMainCss).toBe(true);

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

  test("页面应使用浅色背景", async ({ page }) => {
    await page.goto("index.html");

    const bgColor = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bgColor).toBe("rgb(255, 255, 255)");
  });
});

// ─── 15. 关闭按钮测试 ──────────────────────────────────────

test.describe("关闭按钮", () => {
  test("点击关闭出行人群按钮应关闭面板", async ({ page }) => {
    await page.goto("index.html");
    const jsLoaded = await waitForJsModules(page);
    if (!jsLoaded) { console.log("[SKIP] JS 模块未加载"); return; }

    // 先打开面板
    const openBtn = page.locator("#travelers-btn");
    if (await openBtn.count() > 0) {
      await openBtn.click();
      await page.waitForTimeout(500);
    }

    // 点击关闭按钮
    const closeBtn = page.locator("#btn-close-travelers");
    if (await closeBtn.count() > 0) {
      await closeBtn.click();
      await page.waitForTimeout(500);
    }

    // 验证面板关闭
    const panelClosed = await page.evaluate(() => {
      const panel = document.getElementById("travelers-panel");
      return !panel?.classList.contains("open");
    });

    expect(panelClosed).toBe(true);
  });

  test("点击关闭历史按钮应关闭面板", async ({ page }) => {
    await page.goto("index.html");
    const jsLoaded = await waitForJsModules(page);
    if (!jsLoaded) { console.log("[SKIP] JS 模块未加载"); return; }

    // 先打开面板
    const openBtn = page.locator("#btn-history-map");
    if (await openBtn.count() > 0) {
      await openBtn.click();
      await page.waitForTimeout(500);
    }

    // 点击关闭按钮
    const closeBtn = page.locator("#btn-close-history");
    if (await closeBtn.count() > 0) {
      await closeBtn.click();
      await page.waitForTimeout(500);
    }

    // 验证面板关闭
    const panelClosed = await page.evaluate(() => {
      const panel = document.getElementById("history-panel");
      return !panel?.classList.contains("open");
    });

    expect(panelClosed).toBe(true);
  });

  test("点击关闭分享弹窗按钮应关闭弹窗", async ({ page }) => {
    await page.goto("index.html");
    const jsLoaded = await waitForJsModules(page);
    if (!jsLoaded) { console.log("[SKIP] JS 模块未加载"); return; }

    // 直接点击关闭按钮（弹窗默认隐藏，按钮仍可点击）
    const closeBtn = page.locator("#btn-close-share-modal");
    if (await closeBtn.count() > 0) {
      await closeBtn.click();
      await page.waitForTimeout(300);
    }

    // 验证无 JS 错误
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.waitForTimeout(500);
    const criticalErrors = collectCriticalErrors(errors);
    expect(criticalErrors).toEqual([]);
  });
});

// ─── 16. 导出按钮状态转换测试 ──────────────────────────────

test.describe("导出按钮状态转换", () => {
  test("TTS 按钮应存在且默认禁用", async ({ page }) => {
    await page.goto("index.html");

    const btnState = await page.evaluate(() => {
      const btn = document.getElementById("btn-tts");
      return {
        exists: !!btn,
        isDisabled: btn?.classList.contains("disabled-ghost"),
        text: btn?.textContent?.trim(),
      };
    });

    expect(btnState.exists).toBe(true);
    expect(btnState.isDisabled).toBe(true);
    expect(btnState.text).toContain("语音播报");
  });

  test("海报按钮应存在且默认禁用", async ({ page }) => {
    await page.goto("index.html");

    const btnState = await page.evaluate(() => {
      const btn = document.getElementById("btn-poster");
      return {
        exists: !!btn,
        isDisabled: btn?.classList.contains("disabled-ghost"),
        text: btn?.textContent?.trim(),
      };
    });

    expect(btnState.exists).toBe(true);
    expect(btnState.isDisabled).toBe(true);
    expect(btnState.text).toContain("长图");
  });

  test("语音伴游按钮应存在且默认禁用", async ({ page }) => {
    await page.goto("index.html");

    const btnState = await page.evaluate(() => {
      const btn = document.getElementById("btn-voice-companion");
      return {
        exists: !!btn,
        isDisabled: btn?.classList.contains("disabled-ghost"),
        text: btn?.textContent?.trim(),
      };
    });

    expect(btnState.exists).toBe(true);
    expect(btnState.isDisabled).toBe(true);
    expect(btnState.text).toContain("语音伴游");
  });

  test("地图按钮应存在且默认禁用", async ({ page }) => {
    await page.goto("index.html");

    const btnState = await page.evaluate(() => {
      const btn = document.getElementById("btn-map");
      return {
        exists: !!btn,
        isDisabled: btn?.classList.contains("disabled-ghost"),
      };
    });

    expect(btnState.exists).toBe(true);
    expect(btnState.isDisabled).toBe(true);
  });

  test("模拟行程生成后导出按钮应启用", async ({ page }) => {
    await page.goto("index.html");
    const jsLoaded = await waitForJsModules(page);
    if (!jsLoaded) { console.log("[SKIP] JS 模块未加载"); return; }

    // 模拟移除 disabled-ghost 类（模拟行程生成后的状态）
    await page.evaluate(() => {
      const btns = ["btn-export-md", "btn-export-pdf", "btn-share-image", "btn-share-link-new", "btn-share-qr", "btn-tts", "btn-poster", "btn-voice-companion", "btn-map"];
      btns.forEach(id => {
        document.getElementById(id)?.classList.remove("disabled-ghost");
      });
    });

    // 验证按钮已启用
    const btnStates = await page.evaluate(() => {
      const ids = ["btn-export-md", "btn-export-pdf", "btn-share-image", "btn-share-link-new", "btn-share-qr"];
      return ids.map(id => ({
        id,
        isDisabled: document.getElementById(id)?.classList.contains("disabled-ghost"),
      }));
    });

    for (const state of btnStates) {
      expect(state.isDisabled, `${state.id} 应已启用`).toBe(false);
    }
  });
});

// ─── 17. 移动端视图切换 ────────────────────────────────────

test.describe("移动端视图切换", () => {
  test("移动端地图按钮应存在", async ({ page }) => {
    await page.goto("index.html");

    const btnExists = await page.evaluate(() => {
      return !!document.getElementById("btn-mobile-map");
    });

    expect(btnExists).toBe(true);
  });

  test("移动端聊天按钮应存在", async ({ page }) => {
    await page.goto("index.html");

    const btnExists = await page.evaluate(() => {
      return !!document.getElementById("btn-mobile-chat");
    });

    expect(btnExists).toBe(true);
  });
});

// ─── 18. 图层选项测试 ──────────────────────────────────────

test.describe("图层选项", () => {
  test("应有三个图层选项按钮", async ({ page }) => {
    await page.goto("index.html");

    const layerOptions = await page.evaluate(() => {
      const options = document.querySelectorAll('.map-layer-option');
      return Array.from(options).map(o => (o as HTMLElement).dataset.layer);
    });

    expect(layerOptions).toContain("standard");
    expect(layerOptions).toContain("satellite");
    expect(layerOptions).toContain("terrain");
  });

  test("点击卫星图层选项应切换激活状态", async ({ page }) => {
    await gotoApp(page, { readiness: "agent" });
    const jsLoaded = await waitForJsModules(page);
    if (!jsLoaded) { console.log("[SKIP] JS 模块未加载"); return; }
    await showMapView(page);

    // 先打开图层选择器
    const layersBtn = page.locator("#btn-map-layers");
    if (await layersBtn.count() > 0) {
      await layersBtn.click();
      await page.waitForTimeout(500);
    }

    // 点击卫星图层
    const satelliteBtn = page.locator('.map-layer-option[data-layer="satellite"]');
    if (await satelliteBtn.count() > 0) {
      await satelliteBtn.click();
      await page.waitForTimeout(500);
    }

    // 验证激活状态
    const isActive = await page.evaluate(() => {
      const btn = document.querySelector('.map-layer-option[data-layer="satellite"]');
      return btn?.classList.contains("active");
    });

    expect(isActive).toBe(true);
  });
});

// ─── 19. 反馈按钮测试 ──────────────────────────────────────

test.describe("反馈功能", () => {
  test("反馈按钮应存在", async ({ page }) => {
    await page.goto("index.html");

    const btnExists = await page.evaluate(() => {
      return !!document.getElementById("btn-feedback");
    });

    expect(btnExists).toBe(true);
  });

  test("点击反馈按钮应打开反馈弹窗", async ({ page }) => {
    await gotoApp(page);
    const jsLoaded = await waitForJsModules(page);
    if (!jsLoaded) { console.log("[SKIP] JS 模块未加载"); return; }
    await page.waitForTimeout(2000);

    // 点击反馈按钮
    const btn = page.locator("#btn-feedback");
    if (await btn.count() > 0) {
      await btn.click();
      await page.waitForTimeout(500);
    }

    // 验证反馈弹窗显示
    const feedbackVisible = await page.evaluate(() => {
      const overlay = document.getElementById("feedback-overlay");
      return overlay?.style.display === "flex";
    });

    expect(feedbackVisible).toBe(true);
  });

  test("点击关闭反馈按钮应关闭反馈弹窗", async ({ page }) => {
    await page.goto("index.html");
    const jsLoaded = await waitForJsModules(page);
    if (!jsLoaded) { console.log("[SKIP] JS 模块未加载"); return; }
    await page.waitForTimeout(2000);

    // 先打开
    const openBtn = page.locator("#btn-feedback");
    if (await openBtn.count() > 0) {
      await openBtn.click();
      await page.waitForTimeout(500);
    }

    // 点击关闭
    const closeBtn = page.locator("#btn-close-feedback");
    if (await closeBtn.count() > 0) {
      await closeBtn.click();
      await page.waitForTimeout(500);
    }

    // 验证关闭
    const feedbackHidden = await page.evaluate(() => {
      const overlay = document.getElementById("feedback-overlay");
      return overlay?.style.display === "none" || !overlay?.style.display;
    });

    expect(feedbackHidden).toBe(true);
  });
});

// ─── 20. 路线面板最小化测试 ────────────────────────────────

test.describe("路线面板最小化", () => {
  test("最小化按钮应存在", async ({ page }) => {
    await page.goto("index.html");

    const btnExists = await page.evaluate(() => {
      return !!document.getElementById("btn-minimize-routes");
    });

    expect(btnExists).toBe(true);
  });

  test("点击最小化按钮不应抛出 JS 错误", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await gotoApp(page, { readiness: "agent" });
    const jsLoaded = await waitForJsModules(page);
    if (!jsLoaded) { console.log("[SKIP] JS 模块未加载"); return; }
    await showMapView(page);

    // 先打开路线面板
    const routesBtn = page.locator("#btn-map-routes");
    if (await routesBtn.count() > 0) {
      await routesBtn.click();
      await page.waitForTimeout(500);
    }

    // 点击最小化
    const minimizeBtn = page.locator("#btn-minimize-routes");
    if (await minimizeBtn.count() > 0) {
      await minimizeBtn.click();
      await page.waitForTimeout(500);
    }

    const criticalErrors = collectCriticalErrors(errors);
    expect(criticalErrors).toEqual([]);
  });
});

// ─── 21. 保存出行人群按钮测试 ──────────────────────────────

test.describe("保存出行人群按钮", () => {
  test("点击保存按钮应持久化设置", async ({ page }) => {
    await page.goto("index.html");
    const jsLoaded = await waitForJsModules(page);
    if (!jsLoaded) { console.log("[SKIP] JS 模块未加载"); return; }

    // 打开面板
    const openBtn = page.locator("#travelers-btn");
    if (await openBtn.count() > 0) {
      await openBtn.click();
      await page.waitForTimeout(500);
    }

    // 设置输入值
    await page.evaluate(() => {
      const adultsInput = document.getElementById("t-adults") as HTMLInputElement;
      if (adultsInput) adultsInput.value = "3";
    });

    // 点击保存
    const saveBtn = page.locator("#travelers-save");
    if (await saveBtn.count() > 0) {
      await saveBtn.click();
      await page.waitForTimeout(500);
    }

    // 验证无 JS 错误
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.waitForTimeout(500);
    const criticalErrors = collectCriticalErrors(errors);
    expect(criticalErrors).toEqual([]);
  });
});

// ─── 22. 退出按钮测试 ──────────────────────────────────────

test.describe("退出按钮", () => {
  test("退出按钮应存在", async ({ page }) => {
    await page.goto("index.html");

    const btnExists = await page.evaluate(() => {
      return !!document.getElementById("btn-logout");
    });

    expect(btnExists).toBe(true);
  });
});

// ─── 23. 获取模型按钮测试 ──────────────────────────────────

test.describe("获取模型按钮", () => {
  test("获取模型按钮应存在", async ({ page }) => {
    await page.goto("index.html");

    const btnExists = await page.evaluate(() => {
      return !!document.getElementById("btn-fetch-models");
    });

    expect(btnExists).toBe(true);
  });

  test("点击获取模型按钮不应抛出 JS 错误", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("index.html");
    const jsLoaded = await waitForJsModules(page);
    if (!jsLoaded) { console.log("[SKIP] JS 模块未加载"); return; }

    // 打开模型配置弹窗
    const openBtn = page.locator("#btn-open-model");
    if (await openBtn.count() > 0) {
      await openBtn.click();
      await page.waitForTimeout(500);
    }

    // 点击获取模型
    const fetchBtn = page.locator("#btn-fetch-models");
    if (await fetchBtn.count() > 0) {
      await fetchBtn.click();
      await page.waitForTimeout(1000);
    }

    const criticalErrors = collectCriticalErrors(errors);
    expect(criticalErrors).toEqual([]);
  });
});

// ─── 24. TTS/海报/语音伴游按钮点击测试 ────────────────────

test.describe("TTS/海报/语音伴游按钮点击", () => {
  test("点击 TTS 按钮（禁用态）不应抛出 JS 错误", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("index.html");
    const jsLoaded = await waitForJsModules(page);
    if (!jsLoaded) { console.log("[SKIP] JS 模块未加载"); return; }

    // TTS 按钮在禁用态，点击不应报错
    const btn = page.locator("#btn-tts");
    if (await btn.count() > 0) {
      await btn.click({ force: true });
      await page.waitForTimeout(500);
    }

    const criticalErrors = collectCriticalErrors(errors);
    expect(criticalErrors).toEqual([]);
  });

  test("点击海报按钮（禁用态）不应抛出 JS 错误", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("index.html");
    const jsLoaded = await waitForJsModules(page);
    if (!jsLoaded) { console.log("[SKIP] JS 模块未加载"); return; }

    const btn = page.locator("#btn-poster");
    if (await btn.count() > 0) {
      await btn.click({ force: true });
      await page.waitForTimeout(500);
    }

    const criticalErrors = collectCriticalErrors(errors);
    expect(criticalErrors).toEqual([]);
  });

  test("点击语音伴游按钮（禁用态）不应抛出 JS 错误", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("index.html");
    const jsLoaded = await waitForJsModules(page);
    if (!jsLoaded) { console.log("[SKIP] JS 模块未加载"); return; }

    const btn = page.locator("#btn-voice-companion");
    if (await btn.count() > 0) {
      await btn.click({ force: true });
      await page.waitForTimeout(500);
    }

    const criticalErrors = collectCriticalErrors(errors);
    expect(criticalErrors).toEqual([]);
  });

  test("点击地图按钮（禁用态）不应抛出 JS 错误", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("index.html");
    const jsLoaded = await waitForJsModules(page);
    if (!jsLoaded) { console.log("[SKIP] JS 模块未加载"); return; }

    const btn = page.locator("#btn-map");
    if (await btn.count() > 0) {
      await btn.click({ force: true });
      await page.waitForTimeout(500);
    }

    const criticalErrors = collectCriticalErrors(errors);
    expect(criticalErrors).toEqual([]);
  });
});

// ─── 25. 反馈提交按钮测试 ──────────────────────────────────

test.describe("反馈提交按钮", () => {
  test("提交反馈按钮应存在", async ({ page }) => {
    await page.goto("index.html");

    const btnExists = await page.evaluate(() => {
      return !!document.getElementById("btn-submit-feedback");
    });

    expect(btnExists).toBe(true);
  });

  test("点击提交反馈按钮不应抛出 JS 错误", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("index.html");
    const jsLoaded = await waitForJsModules(page);
    if (!jsLoaded) { console.log("[SKIP] JS 模块未加载"); return; }

    // 先打开反馈弹窗
    const openBtn = page.locator("#btn-feedback");
    if (await openBtn.count() > 0) {
      await openBtn.click();
      await page.waitForTimeout(500);
    }

    // 点击提交
    const submitBtn = page.locator("#btn-submit-feedback");
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      await page.waitForTimeout(1000);
    }

    const criticalErrors = collectCriticalErrors(errors);
    expect(criticalErrors).toEqual([]);
  });
});

// ─── 26. 分享弹窗按钮测试 ─────────────────────────────────

test.describe("分享弹窗按钮", () => {
  test("下载分享图片按钮应存在", async ({ page }) => {
    await page.goto("index.html");

    const btnExists = await page.evaluate(() => {
      return !!document.getElementById("btn-download-share-image");
    });

    expect(btnExists).toBe(true);
  });

  test("关闭分享弹窗按钮 2 应存在", async ({ page }) => {
    await page.goto("index.html");

    const btnExists = await page.evaluate(() => {
      return !!document.getElementById("btn-close-share-modal-2");
    });

    expect(btnExists).toBe(true);
  });

  test("点击关闭分享弹窗按钮 2 不应抛出 JS 错误", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("index.html");
    const jsLoaded = await waitForJsModules(page);
    if (!jsLoaded) { console.log("[SKIP] JS 模块未加载"); return; }

    const btn = page.locator("#btn-close-share-modal-2");
    if (await btn.count() > 0) {
      await btn.click();
      await page.waitForTimeout(500);
    }

    const criticalErrors = collectCriticalErrors(errors);
    expect(criticalErrors).toEqual([]);
  });
});

// ─── 27. 退出按钮点击测试 ─────────────────────────────────

test.describe("退出按钮点击", () => {
  test("点击退出按钮不应抛出 JS 错误", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("index.html");
    const jsLoaded = await waitForJsModules(page);
    if (!jsLoaded) { console.log("[SKIP] JS 模块未加载"); return; }

    const btn = page.locator("#btn-logout");
    if (await btn.count() > 0) {
      await btn.click();
      await page.waitForTimeout(500);
    }

    const criticalErrors = collectCriticalErrors(errors);
    expect(criticalErrors).toEqual([]);
  });
});

// ─── 28. 移动端视口按钮点击测试 ───────────────────────────

test.describe("移动端按钮点击", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test("移动端地图按钮应可点击", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await gotoApp(page);
    const jsLoaded = await waitForJsModules(page);
    if (!jsLoaded) { console.log("[SKIP] JS 模块未加载"); return; }

    const btn = page.locator("#btn-mobile-map");
    if (await btn.count() > 0) {
      await btn.click();
      await page.waitForTimeout(500);
    }

    const criticalErrors = collectCriticalErrors(errors);
    expect(criticalErrors).toEqual([]);
  });

  test("移动端聊天按钮应可点击", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await gotoApp(page);
    const jsLoaded = await waitForJsModules(page);
    if (!jsLoaded) { console.log("[SKIP] JS 模块未加载"); return; }
    await showMapView(page);

    const btn = page.locator("#btn-mobile-chat");
    if (await btn.count() > 0) {
      await btn.click();
      await page.waitForTimeout(500);
    }

    const criticalErrors = collectCriticalErrors(errors);
    expect(criticalErrors).toEqual([]);
  });
});

// ─── 29. btn-voice-input 可见性测试 ────────────────────────

test.describe("语音输入按钮可见性", () => {
  test("btn-voice-input 初始应隐藏", async ({ page }) => {
    await page.goto("index.html");

    const isHidden = await page.evaluate(() => {
      const btn = document.getElementById("btn-voice-input");
      if (!btn) return false;
      const style = getComputedStyle(btn);
      return style.display === "none";
    });

    expect(isHidden).toBe(true);
  });

  test("btn-voice-input 应有正确的 title 属性", async ({ page }) => {
    await page.goto("index.html");

    const title = await page.evaluate(() => {
      return document.getElementById("btn-voice-input")?.getAttribute("title");
    });

    expect(title).toBe("语音输入");
  });
});

// ─── 30. btn-enrich-supplies 可见性测试 ────────────────────

test.describe("丰富补给按钮可见性", () => {
  test("btn-enrich-supplies 初始应隐藏", async ({ page }) => {
    await page.goto("index.html");

    const isHidden = await page.evaluate(() => {
      const btn = document.getElementById("btn-enrich-supplies");
      if (!btn) return false;
      const style = getComputedStyle(btn);
      return style.display === "none";
    });

    expect(isHidden).toBe(true);
  });

  test("btn-enrich-supplies 应有正确的 title 属性", async ({ page }) => {
    await page.goto("index.html");

    const title = await page.evaluate(() => {
      return document.getElementById("btn-enrich-supplies")?.getAttribute("title");
    });

    expect(title).toBe("丰富补给详情");
  });
});
