/**
 * 实时行程编辑 / 行程统计条 / 主题切换 — E2E 覆盖
 *
 * 覆盖三个近期新增功能：
 *   1. 实时行程编辑按钮（#btn-edit-live-trip）
 *      - chat-init.js 在初始化时创建按钮（挂到 .map-chat-actions，初始 display:none）
 *      - 行程就绪信号：finalize_complete / agent_end 且 window._lastTripPlan 存在 → 显示按钮
 *      - 点击 → 动态导入 trip-editor.js 的 openTripEditorForPlan → 打开 #trip-editor-overlay
 *      - 保存（#btn-save-trip-editor）→ saveTripPlan 以 id "live-*" 落库（IndexedDB TravelAgentDB/trips）
 *        + 更新 window._lastTripPlan + 重新 _renderTripAnimated + toast「已保存到历史行程」
 *   2. 行程统计条（#trip-stats-bar，trip-stats.js）
 *      - agent_end 处理器发现 toolResult.details.tripPlan 时调用 renderTripStats
 *      - DOM 结构：.trip-stats-chip 徽章（🗓 天数 / 📍 景点数 / 🏙 城市数 / 💰 预算 / 🌤 天气）
 *   3. 主题切换（#btn-theme，infra/theme.js）
 *      - 点击切换 documentElement 的 data-theme，并持久化到 localStorage「travel-agent-theme」
 *
 * 策略：与 cross-layer-integration.spec.ts 一致 —— 注入 window._lastTripPlan +
 *       向 Agent 注入 toolResult 消息，再遍历 agent.listeners 分发 agent_end 事件，
 *       走 chat-init.js 的真实事件处理器（而非直接调用内部函数）。
 * 元素缺失时通过 expect 的 message 参数给出明确失败信息，避免裸超时。
 */

import { expect, test, type Page } from "@playwright/test";

// ─── 测试数据 ─────────────────────────────────────────────

/** 单天 2 景点行程（用于编辑生命周期 / 保存链路，动画耗时最短） */
const TRIP_PLAN_1DAY = {
  city: "杭州",
  days: [
    {
      day: 1,
      city: "杭州",
      attractions: [
        {
          name: "西湖",
          nameZh: "西湖",
          description: "杭州最著名的景点，世界文化遗产",
          address: "杭州市西湖区",
          visitDuration: 120,
          ticketPrice: 0,
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

/** 多天 3 景点行程（用于统计条：2 天 / 3 景点） */
const TRIP_PLAN_2DAYS = {
  city: "杭州",
  days: [
    {
      day: 1,
      city: "杭州",
      attractions: [
        {
          name: "西湖",
          nameZh: "西湖",
          location: { latitude: 30.2458, longitude: 120.1484 },
        },
        {
          name: "雷峰塔",
          nameZh: "雷峰塔",
          location: { latitude: 30.2312, longitude: 120.1495 },
        },
      ],
    },
    {
      day: 2,
      city: "杭州",
      attractions: [
        {
          name: "灵隐寺",
          nameZh: "灵隐寺",
          location: { latitude: 30.2414, longitude: 120.1017 },
        },
      ],
    },
  ],
};

// ─── 工具函数 ─────────────────────────────────────────────

/** 等待页面就绪（地图容器 + pi-chat-panel.agent 可用） */
async function gotoReady(page: Page) {
  await page.goto("/index.html");
  await page.waitForFunction(
    () =>
      !!document.getElementById("page-map-leaflet") &&
      !!(document.querySelector("pi-chat-panel") as any)?.agent &&
      typeof (window as any)._renderTripAnimated === "function",
    undefined,
    { timeout: 20000 },
  );
}

/**
 * 向 Agent 分发事件：遍历 agent.listeners（pi-agent-core 的公开订阅表），
 * 逐个调用 chat-init.js 等模块注册的事件处理器。
 */
async function dispatchAgentEvent(page: Page, event: Record<string, unknown>) {
  await page.evaluate(async (e) => {
    const panel = document.querySelector("pi-chat-panel") as any;
    const agent = panel?.agent;
    const listeners = agent?.listeners;
    if (!listeners || typeof listeners.forEach !== "function") {
      throw new Error("Agent not ready: pi-chat-panel.agent.listeners 不可用");
    }
    let dispatched = 0;
    for (const fn of listeners) {
      dispatched++;
      try {
        await fn(e);
      } catch {
        // 单个监听器失败不应影响事件分发（真实运行中亦互不阻塞）
      }
    }
    if (dispatched === 0) {
      throw new Error("Agent 未注册任何事件监听器，无法分发 " + e.type);
    }
  }, event);
}

/**
 * 模拟「行程生成完成」：
 *   1. 直接注入 window._lastTripPlan（参考 itinerary-map-linkage.spec.ts 的注入写法）
 *   2. 向 agent.state.messages 注入 toolResult（details.tripPlan），
 *      再分发 agent_end —— 走 chat-init.js 的真实链路：
 *      渲染地图 / 渲染统计条 / 显示实时编辑按钮 / 自动保存
 */
async function simulateTripReady(page: Page, plan: Record<string, unknown>) {
  await page.evaluate((p) => {
    (window as any)._lastTripPlan = p;
    const panel = document.querySelector("pi-chat-panel") as any;
    const agent = panel?.agent;
    if (!agent?.state) {
      throw new Error("pi-chat-panel.agent 未就绪，无法注入 toolResult 消息");
    }
    const messages = Array.isArray(agent.state.messages) ? agent.state.messages.slice() : [];
    messages.push({
      role: "toolResult",
      toolCallId: "e2e-live-edit",
      toolName: "plan_trip",
      content: "ok",
      details: { tripPlan: p },
    });
    agent.state.messages = messages;
  }, plan);
  await dispatchAgentEvent(page, { type: "agent_end" });
}

/**
 * 点击元素：优先真实 locator 点击；移动端视口下头部按钮可能溢出被裁切，
 * 回退到 DOM click（仍触发真实事件处理器，避免 actionability 误报）。
 */
async function clickSmart(page: Page, selector: string) {
  const locator = page.locator(selector);
  try {
    await locator.click({ timeout: 5000 });
  } catch (err) {
    const clicked = await page.evaluate((sel) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) return false;
      el.click();
      return true;
    }, selector);
    if (!clicked) throw err;
  }
}

// ─── 测试 ─────────────────────────────────────────────────

test.describe("实时编辑按钮 / 行程统计条 / 主题切换", () => {
  test.beforeEach(async ({ page }) => {
    await gotoReady(page);
  });

  // =============================================
  // 1. 实时编辑按钮生命周期
  // =============================================
  test("行程就绪后显示实时编辑按钮，点击打开编辑器并显示天数标题，可关闭", async ({ page }) => {
    const btn = page.locator("#btn-edit-live-trip");
    await expect(btn, "页面初始化后应创建 #btn-edit-live-trip（初始隐藏）").toHaveCount(1);
    await expect(btn, "行程未就绪时 #btn-edit-live-trip 应隐藏").toBeHidden();

    await simulateTripReady(page, TRIP_PLAN_1DAY);

    await expect(btn, "行程就绪后（agent_end 且 _lastTripPlan 存在）#btn-edit-live-trip 应显示").toBeVisible();

    await clickSmart(page, "#btn-edit-live-trip");

    const overlay = page.locator("#trip-editor-overlay");
    await expect(overlay, "点击实时编辑按钮后应打开 #trip-editor-overlay").toHaveCount(1);
    await expect(overlay, "编辑器 overlay 应可见").toBeVisible();
    await expect(overlay, "编辑器应包含天数标题「第 1 天」").toContainText("第 1 天");
    await expect(page.locator("#trip-editor-overlay .trip-editor-item"), "编辑器应列出全部景点").toHaveCount(2);

    await clickSmart(page, "#btn-close-trip-editor");
    await expect(overlay, "点击关闭按钮后编辑器 overlay 应隐藏").toBeHidden();
  });

  // =============================================
  // 2. 编辑保存链路
  // =============================================
  test("编辑器内下移第一个景点并保存后更新 _lastTripPlan、落库并重绘地图", async ({ page }) => {
    await simulateTripReady(page, TRIP_PLAN_1DAY);
    await expect(page.locator("#btn-edit-live-trip"), "行程就绪后编辑按钮应可见").toBeVisible();

    await clickSmart(page, "#btn-edit-live-trip");
    await expect(page.locator("#trip-editor-overlay"), "编辑器应打开").toBeVisible();
    await expect(page.locator("#trip-editor-overlay .trip-editor-item-name").first(), "编辑器首个景点应为西湖").toContainText("西湖");

    // 点击第一个景点的「下移」按钮
    const downBtn = page.locator(
      '#trip-editor-overlay .trip-editor-item[data-day="0"][data-attr="0"] button[data-act="down"]',
    );
    await expect(downBtn, "第一个景点应有「下移」按钮").toHaveCount(1);
    await clickSmart(
      page,
      '#trip-editor-overlay .trip-editor-item[data-day="0"][data-attr="0"] button[data-act="down"]',
    );

    await clickSmart(page, "#btn-save-trip-editor");

    // 保存后 window._lastTripPlan 景点顺序已变化（西湖 ↔ 雷峰塔）
    await expect
      .poll(
        async () =>
          page.evaluate(
            () =>
              (window as any)._lastTripPlan?.days?.[0]?.attractions?.map(
                (a: any) => a.name,
              ) ?? null,
          ),
        { message: "保存后 _lastTripPlan 中景点顺序应变为 [雷峰塔, 西湖]", timeout: 10000 },
      )
      .toEqual(["雷峰塔", "西湖"]);

    // 保存成功 toast（tripEditorSavedToHistory）
    await expect(page.locator("#toast"), "保存后应弹出「已保存到历史行程」toast").toContainText("已保存");

    // 落库校验：IndexedDB TravelAgentDB/trips 中应存在 id 以 live- 开头且顺序已更新的记录
    await expect
      .poll(
        async () =>
          page.evaluate(
            () =>
              new Promise<boolean>((resolve) => {
                let settled = false;
                const done = (value: boolean) => {
                  if (!settled) {
                    settled = true;
                    resolve(value);
                  }
                };
                let req: any;
                try {
                  req = indexedDB.open("TravelAgentDB", 3);
                } catch {
                  done(false);
                  return;
                }
                req.onsuccess = () => {
                  const db = req.result;
                  try {
                    const tx = db.transaction("trips", "readonly");
                    const getAll = tx.objectStore("trips").getAll();
                    getAll.onsuccess = () => {
                      const found = (getAll.result || []).some(
                        (t: any) =>
                          String(t.id).startsWith("live-") &&
                          t.tripPlan?.days?.[0]?.attractions?.[0]?.name === "雷峰塔",
                      );
                      db.close();
                      done(!!found);
                    };
                    getAll.onerror = () => {
                      db.close();
                      done(false);
                    };
                  } catch {
                    db.close();
                    done(false);
                  }
                };
                req.onerror = () => done(false);
                req.onblocked = () => done(false);
              }),
          ),
        {
          message: "保存后应写入 IndexedDB（id 以 live- 开头且景点顺序已更新）",
          timeout: 10000,
        },
      )
      .toBe(true);

    // 保存后地图重新渲染未崩溃（2 个景点均有坐标 → 2 个 marker）
    await expect
      .poll(
        () => page.evaluate(() => document.querySelectorAll(".attraction-marker").length),
        { message: "保存后地图应重新渲染出 2 个景点 marker", timeout: 10000 },
      )
      .toBe(2);
  });

  // =============================================
  // 3. 行程统计条
  // =============================================
  test("多天行程就绪后统计条显示天数与景点数徽章", async ({ page }) => {
    await simulateTripReady(page, TRIP_PLAN_2DAYS);

    const bar = page.locator("#trip-stats-bar");
    await expect(bar, "行程加载后应存在 #trip-stats-bar").toHaveCount(1);
    await expect(bar, "行程加载后统计条应显示").toBeVisible();

    const stats = await page.evaluate(() => {
      const el = document.getElementById("trip-stats-bar");
      if (!el) return null;
      const chips = Array.from(el.querySelectorAll(".trip-stats-chip")).map(
        (c) => c.textContent || "",
      );
      return { hidden: el.hidden, chips };
    });

    expect(stats, "#trip-stats-bar 应存在于 DOM 中").not.toBeNull();
    expect(stats!.hidden, "统计条不应处于 hidden 状态").toBe(false);
    expect(stats!.chips.length, "统计条至少应包含天数与景点数两枚徽章").toBeGreaterThanOrEqual(2);
    expect(stats!.chips[0], "第一枚徽章应为天数（🗓 2 天）").toContain("🗓");
    expect(stats!.chips[0], "天数徽章应显示 2").toContain("2");
    expect(stats!.chips[1], "第二枚徽章应为景点数（📍 3 个景点）").toContain("📍");
    expect(stats!.chips[1], "景点数徽章应显示 3").toContain("3");
  });

  // =============================================
  // 4. 主题切换
  // =============================================
  test("点击主题按钮切换 data-theme 并持久化到 localStorage", async ({ page }) => {
    const initialTheme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    expect(initialTheme, "页面加载后 documentElement 应已设置 data-theme（light 或 dark）").toBeTruthy();

    await clickSmart(page, "#btn-theme");
    await expect
      .poll(
        () => page.evaluate(() => document.documentElement.getAttribute("data-theme")),
        { message: "点击 #btn-theme 后 data-theme 应切换", timeout: 5000 },
      )
      .not.toBe(initialTheme);

    const toggledTheme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    await expect
      .poll(
        () => page.evaluate(() => localStorage.getItem("travel-agent-theme")),
        { message: "主题选择应持久化到 localStorage travel-agent-theme", timeout: 5000 },
      )
      .toBe(toggledTheme);

    await clickSmart(page, "#btn-theme");
    await expect
      .poll(
        () => page.evaluate(() => document.documentElement.getAttribute("data-theme")),
        { message: "再次点击 #btn-theme 应恢复初始主题", timeout: 5000 },
      )
      .toBe(initialTheme);
    await expect
      .poll(
        () => page.evaluate(() => localStorage.getItem("travel-agent-theme")),
        { message: "恢复后的主题应同样写回 localStorage", timeout: 5000 },
      )
      .toBe(initialTheme);
  });

  // =============================================
  // 5. 无行程时不显示编辑按钮
  // =============================================
  test("未注入行程时实时编辑按钮不存在或保持隐藏", async ({ page }) => {
    const btn = page.locator("#btn-edit-live-trip");
    const count = await btn.count();
    expect(count, "无行程时 #btn-edit-live-trip 应不存在（当前实现为创建后隐藏）").toBeLessThanOrEqual(1);
    if (count === 1) {
      await expect(btn, "无行程时 #btn-edit-live-trip 应隐藏（display:none）").toBeHidden();
    }

    // finalize_complete 但无 _lastTripPlan：chat-init 的守卫条件不成立，按钮不应显示
    await page.evaluate(() => {
      (window as any)._lastTripPlan = null;
    });
    await dispatchAgentEvent(page, { type: "finalize_complete" });

    const afterCount = await page.locator("#btn-edit-live-trip").count();
    if (afterCount === 1) {
      await expect(
        page.locator("#btn-edit-live-trip"),
        "finalize_complete 且无行程数据时编辑按钮不应显示",
      ).toBeHidden();
    }
  });
});
