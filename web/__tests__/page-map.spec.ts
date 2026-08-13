/**
 * E2E 测试 — 页面地图（全屏地图页）功能全覆盖
 *
 * 覆盖：
 *   1. 页面结构与地图初始化
 *   2. 左侧面板拖拽调整宽度
 *   3. 地图搜索（UI 交互 + 坐标转换）
 *   4. 图层切换（标准/卫星/地形）
 *   5. 路线面板显示/隐藏
 *   6. 定位按钮
 *   7. 状态栏与图例
 *   8. Marker popup（注入模拟行程数据）
 *   9. POI 点击反查
 *   10. 控制台无关键错误
 */

import { expect, test, type Page } from "@playwright/test";
import { spawn, ChildProcess } from "child_process";
import { createServer } from "net";

let server: ChildProcess | null = null;
let serverPort = 0;
const ONBOARDING_STORAGE_KEY = "travel-agent-onboarding-done";

/** 启动本地 HTTP 服务器 */
async function startServer(): Promise<number> {
  const port = await new Promise<number>((resolve) => {
    const s = createServer();
    s.listen(0, () => {
      const p = (s.address() as any).port;
      s.close(() => resolve(p));
    });
  });
  server = spawn("python3", ["-m", "http.server", String(port), "--directory", "web"], {
    cwd: process.cwd(),
    stdio: "ignore",
  });
  await new Promise((r) => setTimeout(r, 800));
  return port;
}

/** 关闭服务器 */
function stopServer() {
  if (server) {
    server.kill();
    server = null;
  }
}

// ─── 辅助函数 ─────────────────────────────────────────────

/** 等待 JS 模块加载完成 */
async function waitForAppReady(page: Page, timeout = 15000): Promise<boolean> {
  try {
    await page.waitForFunction(() => {
      const chat = document.getElementById("chat");
      return chat && (chat as any).agent;
    }, { timeout });
    return true;
  } catch {
    return false;
  }
}

/** 等待地图 Leaflet 实例初始化 */
async function waitForMapReady(page: Page, timeout = 10000): Promise<boolean> {
  try {
    await page.waitForFunction(() => {
      return !!document.getElementById("page-map-leaflet");
    }, { timeout });
    await page.waitForTimeout(500); // 给 Leaflet 一点初始化时间
    return true;
  } catch {
    return false;
  }
}

/** 收集关键错误（排除插件和已知无关错误） */
function filterCriticalErrors(errors: string[]): string[] {
  return errors.filter(
    (e) =>
      !e.includes("Immersive Translate") &&
      !e.includes("Mieru-OCR") &&
      !e.includes("content_main.js") &&
      !e.includes("content_guard.js") &&
      !e.includes("content.js") &&
      !e.includes("Failed to resolve module specifier") &&
      !e.includes("esm.sh") &&
      !e.includes("net::ERR") &&
      !e.includes("Cross-Origin") &&
      !e.includes("CORS") &&
      !e.includes("[POI]") && // POI 查询失败是网络/API 问题，不视为代码错误
      !e.includes("高德返回错误")
  );
}

/** 监听控制台错误 */
function setupConsoleListener(page: Page): { errors: string[]; cleanup: () => void } {
  const errors: string[] = [];
  const handler = (msg: any) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  };
  page.on("console", handler);
  return {
    errors,
    cleanup: () => page.off("console", handler),
  };
}

/** 注入模拟行程数据到地图 */
async function injectMockTrip(page: Page) {
  await page.evaluate(() => {
    (window as any)._lastTripPlan = {
      city: "杭州",
      days: [
        {
          day: 1,
          city: "杭州",
          attractions: [
            {
              name: "西湖",
              nameZh: "西湖",
              description: "杭州最著名的景点",
              address: "杭州市西湖区",
              visitDuration: 120,
              ticketPrice: 0,
              tips: "建议早上去",
              location: { latitude: 30.2458, longitude: 120.1484 },
            },
            {
              name: "雷峰塔",
              nameZh: "雷峰塔",
              description: "西湖十景之一",
              address: "杭州市西湖区南山路",
              visitDuration: 60,
              ticketPrice: 40,
              location: { latitude: 30.2312, longitude: 120.1495 },
            },
          ],
        },
      ],
    };
    // 确保地图已初始化再重绘
    if ((window as any)._initPageMap) {
      (window as any)._initPageMap();
    }
    if ((window as any)._renderTripOnPageMap) {
      (window as any)._renderTripOnPageMap((window as any)._lastTripPlan);
    }
  });
  await page.waitForTimeout(1200);
}

// ─── 测试用例 ─────────────────────────────────────────────

test.describe("页面地图功能测试", () => {
  let consoleErrors: string[] = [];
  let consoleCleanup: () => void = () => {};

  test.beforeAll(async () => {
    serverPort = await startServer();
    console.log(`[page-map] HTTP server started on port ${serverPort}`);
  });

  test.afterAll(() => {
    stopServer();
    console.log("[page-map] HTTP server stopped");
  });

  /** 使用完整 URL 跳转 */
  async function gotoPage(page: Page, path: string) {
    await page.goto(`http://localhost:${serverPort}${path}`, { waitUntil: "networkidle" });
  }

  /** 移动端默认显示聊天；地图交互测试先显式切到地图视图。 */
  async function ensureMapView(page: Page) {
    const mapArea = page.locator("#map-right-area");
    if (await mapArea.isVisible()) return;

    const mobileMapButton = page.locator("#btn-mobile-map");
    await expect(mobileMapButton).toBeVisible();
    await mobileMapButton.click();
    await expect(page.locator("#page-map")).toHaveClass(/mobile-map-focused/);
    await expect(mapArea).toBeVisible();
  }

  test.beforeEach(async ({ page }) => {
    consoleCleanup = () => {};
    const listener = setupConsoleListener(page);
    consoleErrors = listener.errors;
    consoleCleanup = listener.cleanup;

    await page.addInitScript((storageKey) => {
      localStorage.setItem(storageKey, "true");
    }, ONBOARDING_STORAGE_KEY);

    await page.route(`http://localhost:${serverPort}/config.local.js`, (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: "export default {};\n",
      })
    );
  });

  test.afterEach(async () => {
    consoleCleanup();
  });

  // ── 1. 页面结构与初始化 ──
  test("页面结构完整，地图初始化成功", async ({ page }, testInfo) => {
    await gotoPage(page, "/index.html");

    // 先等页面基本渲染（不强制要求 agent 初始化）
    await page.waitForTimeout(3000);

    // 诊断：如果 agent 没初始化，记录但不失败
    const ready = await waitForAppReady(page, 5000);
    if (!ready) {
      console.log("⚠️ agent 未初始化，继续检查 DOM 结构");
    }

    const mapReady = await waitForMapReady(page, 5000);
    if (!mapReady) {
      await page.screenshot({ path: testInfo.outputPath("diag-no-map.png") });
      const diag = await page.evaluate(() => ({
        url: location.href,
        title: document.title,
        hasApp: !!document.getElementById("app"),
        hasPageMap: !!document.getElementById("page-map"),
        hasMapContainer: !!document.getElementById("page-map-container"),
        hasMapLeaflet: !!document.getElementById("page-map-leaflet"),
        chatHtml: document.getElementById("chat")?.outerHTML?.substring(0, 200),
        bodyScripts: Array.from(document.querySelectorAll("script")).map((s) =>
          (s as HTMLScriptElement).src || "inline"
        ),
        moduleErrors: (window as any).__moduleErrors || [],
      }));
      const diagStr = JSON.stringify(diag, null, 2);
      // 写入文件避免日志截断
      const fs = (window as any).__fs;
      console.log("[DIAG] map not ready, url=" + diag.url + ", title=" + diag.title);
      console.log("[DIAG] hasApp=" + diag.hasApp + ", hasPageMap=" + diag.hasPageMap);
    }
    expect(mapReady).toBe(true);

    const structure = await page.evaluate(() => ({
      hasPageMap: !!document.getElementById("page-map"),
      hasChatPanel: !!document.querySelector("pi-chat-panel"),
      hasMapContainer: !!document.getElementById("page-map-container"),
      hasMapLeaflet: !!document.getElementById("page-map-leaflet"),
      hasSearchInput: !!document.getElementById("map-search-input"),
      hasToolbar: !!document.getElementById("page-map-toolbar"),
      hasStatusBar: !!document.getElementById("page-map-statusbar"),
      hasLegend: !!document.getElementById("page-map-legend"),
      hasResizer: !!document.getElementById("panel-resizer"),
      hasRoutePanel: !!document.getElementById("page-map-routes"),
      pageMapActive: document.getElementById("page-map")?.classList.contains("active"),
    }));

    expect(structure.hasPageMap).toBe(true);
    expect(structure.hasChatPanel).toBe(true);
    expect(structure.hasMapContainer).toBe(true);
    expect(structure.hasMapLeaflet).toBe(true);
    expect(structure.hasSearchInput).toBe(true);
    expect(structure.hasToolbar).toBe(true);
    expect(structure.hasStatusBar).toBe(true);
    expect(structure.hasLegend).toBe(true);
    expect(structure.hasResizer).toBe(true);
    expect(structure.hasRoutePanel).toBe(true);
    expect(structure.pageMapActive).toBe(true);

    const criticalErrors = filterCriticalErrors(consoleErrors);
    expect(criticalErrors).toEqual([]);
  });

  // ── 2. 左侧面板拖拽调整宽度 ──
  test("拖拽分割线可调整左侧面板宽度", async ({ page }, testInfo) => {
    await gotoPage(page, "/index.html");
    await waitForMapReady(page);

    const resizer = await page.locator("#panel-resizer");
    if (testInfo.project.name === "mobile") {
      await expect(resizer).toBeHidden();
      return;
    }
    await expect(resizer).toBeVisible();

    const panel = await page.locator("#map-chat-panel");
    const beforeWidth = await panel.evaluate((el) => el.offsetWidth);

    // 拖拽 resizer 向右 100px
    const box = await resizer.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 100, box!.y + box!.height / 2);
    await page.mouse.up();

    await page.waitForTimeout(200);
    const afterWidth = await panel.evaluate((el) => el.offsetWidth);

    // 宽度应该增加（允许 ±20px 误差）
    expect(afterWidth).toBeGreaterThan(beforeWidth + 50);

    // 验证 localStorage 保存了宽度
    const savedWidth = await page.evaluate(() =>
      localStorage.getItem("travel-map-chat-width")
    );
    expect(savedWidth).not.toBeNull();
    expect(parseInt(savedWidth!, 10)).toBeGreaterThan(300);
  });

  // ── 3. 图层切换 ──
  test("图层切换：标准 → 卫星 → 地形", async ({ page }) => {
    await gotoPage(page, "/index.html");
    await waitForMapReady(page);
    await ensureMapView(page);

    const layerBtn = await page.locator("#btn-map-layers");
    await layerBtn.click();

    // 点击卫星图层
    const satBtn = await page.locator("[data-layer='satellite']");
    await satBtn.click();
    await page.waitForTimeout(500);

    let activeLayer = await page.evaluate(() =>
      document.querySelector(".map-layer-option.active")?.getAttribute("data-layer")
    );
    expect(activeLayer).toBe("satellite");

    // 再次打开菜单，点击地形图层
    await layerBtn.click();
    const terrainBtn = await page.locator("[data-layer='terrain']");
    await terrainBtn.click();
    await page.waitForTimeout(500);

    activeLayer = await page.evaluate(() =>
      document.querySelector(".map-layer-option.active")?.getAttribute("data-layer")
    );
    expect(activeLayer).toBe("terrain");

    const criticalErrors = filterCriticalErrors(consoleErrors);
    expect(criticalErrors).toEqual([]);
  });

  // ── 4. 路线面板显示/隐藏 ──
  test("路线面板可展开和收起", async ({ page }) => {
    await gotoPage(page, "/index.html");
    await waitForMapReady(page);
    await ensureMapView(page);

    const routeBtn = await page.locator("#btn-map-routes");
    const routePanel = await page.locator("#page-map-routes");

    await routeBtn.click();
    await page.waitForTimeout(300);
    const isShown = await routePanel.evaluate((el) => el.classList.contains("show"));
    expect(isShown).toBe(true);

    await routeBtn.click();
    await page.waitForTimeout(300);
    const isHidden = await routePanel.evaluate((el) => !el.classList.contains("show"));
    expect(isHidden).toBe(true);
  });

  test("路线面板按日显示天气风险，并仅为降雨日提供实时雷达", async ({ page }) => {
    await gotoPage(page, "/index.html");
    await waitForMapReady(page);
    await page.locator(".onboarding-skip").click({ timeout: 1000 }).catch(() => {});

    await page.evaluate(async () => {
      const tripPlan = {
        city: "杭州",
        startDate: "2026-08-13",
        endDate: "2026-08-14",
        weatherInfo: [
          {
            date: "2026-08-13", city: "杭州", dayWeather: "大雨", nightWeather: "中雨",
            dayTemp: 30, nightTemp: 23, precipitationProbability: 80,
            windDirection: "东风", windPower: "4级", source: "open-meteo",
          },
          {
            date: "2026-08-14", city: "杭州", dayWeather: "晴", nightWeather: "晴",
            dayTemp: 29, nightTemp: 21, precipitationProbability: 10,
            windDirection: "东风", windPower: "2级", source: "open-meteo",
          },
        ],
        days: [
          {
            dayIndex: 1, date: "2026-08-13", city: "杭州", meals: [],
            attractions: [{
              name: "西湖", nameZh: "西湖", visitDuration: 120,
              location: { latitude: 30.2458, longitude: 120.1484 },
            }],
          },
          {
            dayIndex: 2, date: "2026-08-14", city: "杭州", meals: [],
            attractions: [{
              name: "浙江省博物馆", nameZh: "浙江省博物馆", visitDuration: 90,
              location: { latitude: 30.2526, longitude: 120.1371 },
            }],
          },
        ],
      };
      (window as any)._lastTripPlan = tripPlan;
      await (window as any)._renderTripOnMap(tripPlan);
    });

    const routeButton = page.locator("#btn-map-routes");
    const mobileMapButton = page.locator("#btn-mobile-map");
    expect(await page.locator("#mobile-view-toggle").evaluate((control) => control.parentElement?.id)).toBe("page-map");
    if (!(await routeButton.isVisible())) {
      await expect(mobileMapButton).toBeVisible();
      await mobileMapButton.click();
      await expect(page.locator("#page-map")).toHaveClass(/mobile-map-focused/);
      await expect(routeButton).toBeVisible();
    }
    await routeButton.click();
    const weatherRows = page.locator(".route-day-weather");
    await expect(weatherRows).toHaveCount(2);
    await expect(weatherRows.nth(0)).toContainText("大雨");
    await expect(weatherRows.nth(0)).toContainText("23–30°C");
    await expect(page.locator(".route-weather-risk-high")).toHaveCount(1);
    await expect(page.locator(".route-weather-reason-text").first()).toContainText("强降雨");
    await expect(page.locator(".route-weather-advice-text").first()).toContainText("室内");

    const radarLinks = page.locator(".route-weather-radar-link");
    await expect(radarLinks).toHaveCount(1);
    await expect(radarLinks).toHaveAttribute("target", "_blank");
    await expect(radarLinks).toHaveAttribute("rel", "noopener noreferrer");
    await expect(radarLinks).toHaveAttribute("href", /windy\.com\/30\./);
    await expect(page.locator("#route-panel-body")).not.toContainText(/undefined|null|NaN/);
  });

  // ── 5. 定位按钮 ──
  test("定位按钮存在且可点击", async ({ page }) => {
    await gotoPage(page, "/index.html");
    await waitForMapReady(page);
    await ensureMapView(page);

    const locateBtn = await page.locator("#btn-map-locate");
    await expect(locateBtn).toBeVisible();
    await locateBtn.click();
    // 定位按钮在没有行程数据时不应报错
    await page.waitForTimeout(300);

    const criticalErrors = filterCriticalErrors(consoleErrors);
    expect(criticalErrors).toEqual([]);
  });

  // ── 6. Marker popup（注入模拟行程数据） ──
  test("模拟行程渲染后，景点 Marker 可点击显示 Popup", async ({ page }) => {
    await gotoPage(page, "/index.html");
    await waitForMapReady(page);
    await ensureMapView(page);

    // 注入模拟数据
    await injectMockTrip(page);

    // 等待 marker 渲染
    await page.waitForFunction(() => {
      return document.querySelectorAll(".leaflet-marker-icon").length >= 2;
    }, { timeout: 5000 });

    // 点击第一个 attraction-marker
    const markerCount = await page.evaluate(() =>
      document.querySelectorAll(".attraction-marker").length
    );
    expect(markerCount).toBeGreaterThanOrEqual(1);

    // 点击 marker，等待 popup 出现
    const firstMarker = await page.locator(".attraction-marker").first();
    await firstMarker.click();
    await page.waitForTimeout(500);

    const popupVisible = await page.evaluate(() => {
      const popup = document.querySelector(".leaflet-popup");
      return popup ? getComputedStyle(popup).display !== "none" : false;
    });
    expect(popupVisible).toBe(true);

    // 验证 popup 内容包含景点名称
    const popupText = await page.evaluate(() => {
      const popup = document.querySelector(".leaflet-popup");
      return popup ? popup.textContent : "";
    });
    expect(popupText).toContain("西湖");
  });

  // ── 6b. 骨架数据不应渲染 marker ──
  test("骨架 tripPlan（无坐标）不应渲染景点 marker", async ({ page }) => {
    await gotoPage(page, "/index.html");
    await waitForMapReady(page);

    // 注入骨架数据（无坐标）
    await page.evaluate(() => {
      (window as any)._lastTripPlan = {
        city: "西安",
        days: [
          {
            day: 1,
            city: "西安",
            attractions: [
              { name: "西安城墙", nameZh: "西安城墙" },  // 无 location
              { name: "钟楼", nameZh: "钟楼" },          // 无 location
            ],
          },
        ],
      };
      if ((window as any)._renderTripOnPageMap) {
        (window as any)._renderTripOnPageMap((window as any)._lastTripPlan);
      }
    });
    await page.waitForTimeout(1200);

    // 骨架数据不应渲染任何 attraction-marker
    const markerCount = await page.evaluate(() =>
      document.querySelectorAll(".attraction-marker").length
    );
    expect(markerCount).toBe(0);
  });

  // ── 7. 状态栏与图例更新 ──
  test("模拟行程渲染后，状态栏和图例正确显示", async ({ page }) => {
    await gotoPage(page, "/index.html");
    await waitForMapReady(page);

    await injectMockTrip(page);

    // 等待状态栏更新
    await page.waitForFunction(() => {
      const statusBar = document.getElementById("page-map-statusbar");
      return statusBar?.classList.contains("show");
    }, { timeout: 5000 });

    const stats = await page.evaluate(() => ({
      attractions: document.getElementById("status-attractions")?.textContent,
      routes: document.getElementById("status-routes")?.textContent,
      days: document.getElementById("status-days")?.textContent,
      legendVisible: document.getElementById("page-map-legend")?.classList.contains("show"),
    }));

    expect(stats.attractions).toContain("景点");
    expect(stats.days).toContain("天");
    expect(stats.legendVisible).toBe(true);
  });

  // ── 8. POI 点击反查（缩放足够后点击地图空白处） ──
  test("POI 点击反查：放大地图后点击空白处", async ({ page }) => {
    await gotoPage(page, "/index.html");
    await waitForMapReady(page);
    await ensureMapView(page);

    // 缩放到足够级别（zoom >= 12）
    await page.evaluate(() => {
      const map = (window as any)._pageMapInstance;
      if (map) map.setView([30.2458, 120.1484], 14);
    });
    await page.waitForTimeout(800);

    // 点击地图空白处（避开 marker）
    const mapContainer = await page.locator("#page-map-leaflet");
    const box = await mapContainer.boundingBox();
    expect(box).not.toBeNull();

    // 点击地图右下角空白区域（通常没有 marker）
    await page.mouse.click(box!.x + box!.width * 0.8, box!.y + box!.height * 0.8);
    await page.waitForTimeout(1200); // 等待 POI 查询 + 弹窗

    // 验证：没有关键 JS 错误（POI 查询失败是网络问题，不计入）
    const criticalErrors = filterCriticalErrors(consoleErrors);
    expect(criticalErrors).toEqual([]);
  });

  // ── 9. 地图搜索输入交互 ──
  test("地图搜索框可输入并触发搜索", async ({ page }) => {
    await gotoPage(page, "/index.html");
    await waitForMapReady(page);
    await ensureMapView(page);

    const searchInput = await page.locator("#map-search-input");
    await searchInput.fill("西湖");
    await searchInput.press("Enter");
    await page.waitForTimeout(500);

    // 验证输入值保留、无报错即可
    const value = await searchInput.inputValue();
    expect(value).toBe("西湖");

    const criticalErrors = filterCriticalErrors(consoleErrors);
    expect(criticalErrors).toEqual([]);
  });

  // ── 10. 快捷提示点击 ──
  test("快捷提示卡片可点击并填入输入框", async ({ page }) => {
    await gotoPage(page, "/index.html");
    await waitForAppReady(page, 20000);
    await waitForMapReady(page);

    const promptCard = await page.locator("#map-chat-welcome .quick-prompt").first();
    const expectedPrompt = "我想去旅行，帮我规划一下";
    await expect(promptCard).toHaveAttribute("data-prompt", expectedPrompt);

    await page.evaluate(() => {
      const agentInterface = (window as any)._chatPanel?.agentInterface;
      if (!agentInterface) throw new Error("AgentInterface 未初始化");

      (window as any).__quickPromptRuns = [];
      agentInterface.sendMessage = async (prompt: string) => {
        (window as any).__quickPromptRuns.push(prompt);
      };
    });

    await promptCard.click();

    await expect.poll(() =>
      page.evaluate(() => (window as any).__quickPromptRuns)
    ).toEqual([expectedPrompt]);
    await expect(page.locator("#map-chat-welcome")).toBeHidden();
    await expect(page.locator(".quick-prompt-user-msg")).toHaveCount(1);
    await expect(page.locator(".quick-prompt-user-msg")).toContainText(expectedPrompt);

    const criticalErrors = filterCriticalErrors(consoleErrors);
    expect(criticalErrors).toEqual([]);
  });
});
