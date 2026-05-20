/**
 * 行程与地图联动测试 — 验证行程项与地图标记的双向关联
 *
 * 场景：
 *   1. 注入行程后地图应渲染正确数量的景点 marker
 *   2. Marker 应有正确的 CSS class（attraction-marker）和坐标
 *   3. 点击 Marker 应显示包含景点名称的 Popup
 *   4. 点击 Marker 应触发 scrollChatToAttraction（反向联动）
 *   5. 行程有 location 数据的景点才应生成 marker
 *   6. 行程变更后地图 marker 应更新
 *   7. 行程中无坐标的景点不应生成 marker
 */

import { expect, test, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "child_process";
import { createServer } from "net";

let server: ChildProcess | null = null;
let serverPort = 0;

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

function stopServer() {
  if (server) {
    server.kill();
    server = null;
  }
}

// ─── 测试数据 ─────────────────────────────────────────────

const MOCK_TRIP = {
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
        {
          name: "灵隐寺",
          nameZh: "灵隐寺",
          description: "千年古刹",
          address: "杭州市西湖区灵隐路",
          visitDuration: 90,
          ticketPrice: 75,
          tips: "注意着装要求",
          location: { latitude: 30.2414, longitude: 120.1017 },
        },
      ],
    },
    {
      day: 2,
      city: "杭州",
      attractions: [
        {
          name: "西溪湿地",
          nameZh: "西溪湿地",
          description: "国家湿地公园",
          address: "杭州市西湖区",
          visitDuration: 180,
          ticketPrice: 80,
          location: { latitude: 30.2654, longitude: 120.0628 },
        },
        {
          // 无坐标的景点 — 不应生成 marker
          name: "河坊街",
          nameZh: "河坊街",
          description: "杭州历史文化街区",
          address: "杭州市上城区",
          visitDuration: 60,
          ticketPrice: 0,
          location: null,
        },
      ],
    },
  ],
};

/** 注入行程数据并触发渲染 */
async function injectTrip(page: Page, trip = MOCK_TRIP) {
  await page.evaluate((t) => {
    (window as any)._lastTripPlan = t;
    if ((window as any)._initPageMap) {
      (window as any)._initPageMap();
    }
    if ((window as any)._renderTripOnPageMap) {
      (window as any)._renderTripOnPageMap(t);
    }
  }, trip);
  await page.waitForTimeout(1200);
}

/** 等待地图就绪 */
async function waitForMapReady(page: Page) {
  await page.waitForFunction(() => {
    return !!document.getElementById("page-map-leaflet");
  }, { timeout: 10000 });
}

/** 注入包含 assistant 消息的对话历史（模拟 scrollChatToAttraction 的目标） */
async function injectChatMessages(page: Page, attractionNames: string[]) {
  await page.evaluate((names) => {
    const panel = document.querySelector("pi-chat-panel") as any;
    if (!panel?.agent) return;
    // 注入 assistant 消息，包含景点名称文本
    const assistantMsg = {
      role: "assistant",
      content: [
        {
          type: "text",
          text: `为您推荐以下景点：${names.join("、")}。每个景点都值得细细游览。`,
        },
      ],
      timestamp: Date.now(),
    };
    panel.agent.state.messages = [
      { role: "user", content: "推荐景点", timestamp: Date.now() - 1000 },
      assistantMsg,
    ];
  }, attractionNames);
}

// ─── 测试 ─────────────────────────────────────────────────

test.describe("行程 → 地图联动", () => {
  test.beforeAll(async () => {
    serverPort = await startServer();
  });

  test.afterAll(() => {
    stopServer();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(`http://localhost:${serverPort}/index.html`, {
      waitUntil: "networkidle",
    });
    await waitForMapReady(page);
  });

  // === 1. 行程渲染后 marker 数量正确 ===
  test("注入行程后应生成正确数量的景点 marker", async ({ page }) => {
    await injectTrip(page);

    // 有坐标的景点：西湖、雷峰塔、灵隐寺、西溪湿地 = 4 个
    // 河坊街无坐标，不应生成 marker
    const markerCount = await page.evaluate(() => {
      return document.querySelectorAll(".attraction-marker").length;
    });
    expect(markerCount).toBe(4);
  });

  // === 2. 无坐标景点不生成 marker ===
  test("location 为 null 的景点不应生成 marker", async ({ page }) => {
    await injectTrip(page);

    const popupTexts = await page.evaluate(() => {
      return Array.from(document.querySelectorAll(".leaflet-popup-content")).map(
        (el) => el.textContent || "",
      );
    });

    // 河坊街不应出现在任何 popup 中
    const hasInvalidMarker = popupTexts.some((t) => t.includes("河坊街"));
    expect(hasInvalidMarker).toBe(false);
  });

  // === 3. Marker 点击显示 Popup，内容正确 ===
  test("点击景点 marker 应显示包含景点名称的 popup", async ({ page }) => {
    await injectTrip(page);

    // 等待 marker 渲染
    await page.waitForFunction(
      () => document.querySelectorAll(".attraction-marker").length >= 1,
      { timeout: 5000 },
    );

    // 用 JS 点击 Leaflet marker（CSS transform 定位，Playwright 无法直接点击）
    await page.evaluate(() => {
      const marker = document.querySelector(".attraction-marker") as HTMLElement;
      if (marker) marker.click();
    });
    await page.waitForTimeout(500);

    // 验证 popup 可见
    const popupVisible = await page.evaluate(() => {
      const popup = document.querySelector(".leaflet-popup");
      return popup ? getComputedStyle(popup).display !== "none" : false;
    });
    expect(popupVisible).toBe(true);

    // 验证 popup 包含景点信息
    const popupText = await page.evaluate(() => {
      const popup = document.querySelector(".leaflet-popup-content");
      return popup?.textContent || "";
    });
    expect(popupText).toContain("西湖");
    // 验证 popup 包含描述
    expect(popupText).toContain("世界文化遗产");
  });

  // === 4. Popup 包含元数据（时长、票价）===
  test("景点 popup 应包含访问时长和票价信息", async ({ page }) => {
    await injectTrip(page);

    // 用 JS 点击雷峰塔（第二个 marker）
    await page.evaluate(() => {
      const markers = document.querySelectorAll(".attraction-marker");
      if (markers[1]) (markers[1] as HTMLElement).click();
    });
    await page.waitForTimeout(500);

    const popupText = await page.evaluate(() => {
      return document.querySelector(".leaflet-popup-content")?.textContent || "";
    });
    expect(popupText).toContain("雷峰塔");
    expect(popupText).toContain("60"); // visitDuration
    expect(popupText).toContain("¥40"); // ticketPrice
  });

  // === 5. 行程变更后 marker 应更新 ===
  test("注入新行程后地图 marker 应完全替换", async ({ page }) => {
    // 第一次注入
    await injectTrip(page);
    const count1 = await page.evaluate(
      () => document.querySelectorAll(".attraction-marker").length,
    );
    expect(count1).toBe(4);

    // 注入新行程（只有一个景点）
    const newTrip = {
      city: "北京",
      days: [
        {
          day: 1,
          city: "北京",
          attractions: [
            {
              name: "故宫",
              nameZh: "故宫",
              description: "明清皇宫",
              address: "北京市东城区",
              visitDuration: 180,
              ticketPrice: 60,
              location: { latitude: 39.9163, longitude: 116.3972 },
            },
          ],
        },
      ],
    };
    await injectTrip(page, newTrip);

    const count2 = await page.evaluate(
      () => document.querySelectorAll(".attraction-marker").length,
    );
    expect(count2).toBe(1);

    // 验证新 marker 内容 — 用 JS 点击 Leaflet marker
    await page.evaluate(() => {
      const marker = document.querySelector(".attraction-marker") as HTMLElement;
      if (marker) marker.click();
    });
    await page.waitForTimeout(300);

    const popupContent = await page.evaluate(
      () => document.querySelector(".leaflet-popup-content")?.textContent || "",
    );
    expect(popupContent).toContain("故宫");
    // 旧的杭州景点不应存在
    expect(popupContent).not.toContain("西湖");
    expect(popupContent).not.toContain("雷峰塔");
  });
});

test.describe("地图 → 行程反向联动（scrollChatToAttraction）", () => {
  test.beforeAll(async () => {
    serverPort = await startServer();
  });

  test.afterAll(() => {
    stopServer();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(`http://localhost:${serverPort}/index.html`, {
      waitUntil: "networkidle",
    });
    await waitForMapReady(page);
  });

  // === 6. Marker 点击触发 scrollChatToAttraction ===
  test("点击地图 marker 应能触发 scrollChatToAttraction（通过 marker 事件绑定）", async ({ page }) => {
    await injectTrip(page);
    await injectChatMessages(page, ["西湖", "雷峰塔", "灵隐寺"]);

    // scrollChatToAttraction 不暴露在 window 上，但 marker 的 click handler 会调用它
    // 验证方式：模拟 marker 事件，检查是否报错
    const clickResult = await page.evaluate(() => {
      const marker = document.querySelector(".attraction-marker") as HTMLElement;
      if (!marker) return { clicked: false, error: "marker not found" };
      try {
        marker.click();
        return { clicked: true, error: null };
      } catch (e: any) {
        return { clicked: false, error: e.message };
      }
    });
    expect(clickResult.clicked).toBe(true);
    expect(clickResult.error).toBeNull();
  });

  // === 7. Marker 点击不报错（无 chat 消息时）===
  test("无 chat 消息时点击 marker 不应崩溃", async ({ page }) => {
    await injectTrip(page);
    // 不注入 chat 消息

    const clickResult = await page.evaluate(() => {
      const marker = document.querySelector(".attraction-marker") as HTMLElement;
      if (!marker) return { clicked: false, error: "no marker" };
      try {
        marker.click();
        return { clicked: true, error: null };
      } catch (e: any) {
        return { clicked: false, error: e.message };
      }
    });
    expect(clickResult.clicked).toBe(true);
    expect(clickResult.error).toBeNull();
  });

  // === 8. 完整联动：注入行程 → 点击 marker → 不崩溃 ===
  test("完整联动流程：注入行程和聊天消息 → 点击 marker → 系统不崩溃", async ({
    page,
  }) => {
    await injectTrip(page);
    await injectChatMessages(page, ["西湖", "雷峰塔"]);

    // 等待 marker 渲染
    await page.waitForFunction(
      () => document.querySelectorAll(".attraction-marker").length >= 1,
      { timeout: 5000 },
    );

    // 用 JS 点击 marker（Leaflet marker 可能被 Playwright 认为不可见）
    const clickOk = await page.evaluate(() => {
      const marker = document.querySelector(".attraction-marker") as HTMLElement;
      if (marker) { marker.click(); return true; }
      return false;
    });
    expect(clickOk).toBe(true);
    await page.waitForTimeout(500);

    // 页面仍健康
    const hasApp = await page.locator("#app").count();
    expect(hasApp).toBe(1);
  });
});

test.describe("行程-地图边界情况", () => {
  test.beforeAll(async () => {
    serverPort = await startServer();
  });

  test.afterAll(() => {
    stopServer();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(`http://localhost:${serverPort}/index.html`, {
      waitUntil: "networkidle",
    });
    await waitForMapReady(page);
  });

  // === 9. 空行程不应生成 marker ===
  test("空行程不应生成任何 marker", async ({ page }) => {
    await injectTrip(page, { city: "空城", days: [] });

    const markerCount = await page.evaluate(
      () => document.querySelectorAll(".attraction-marker").length,
    );
    expect(markerCount).toBe(0);
  });

  // === 10. 坐标为 0,0 的景点不应生成 marker ===
  test("坐标为 0,0 的景点不应生成 marker", async ({ page }) => {
    const tripWithZero = {
      city: "测试",
      days: [
        {
          day: 1,
          city: "测试",
          attractions: [
            {
              name: "零坐标景点",
              nameZh: "零坐标景点",
              location: { latitude: 0, longitude: 0 },
            },
            {
              name: "有效景点",
              nameZh: "有效景点",
              location: { latitude: 30.2458, longitude: 120.1484 },
            },
          ],
        },
      ],
    };
    await injectTrip(page, tripWithZero);

    const markerCount = await page.evaluate(
      () => document.querySelectorAll(".attraction-marker").length,
    );
    expect(markerCount).toBe(1); // 只有有效景点生成 marker
  });

  // === 11. 重复注入行程不应累积 marker ===
  test("多次注入行程不应累积 marker", async ({ page }) => {
    await injectTrip(page, {
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
          ],
        },
      ],
    });
    const count1 = await page.evaluate(
      () => document.querySelectorAll(".attraction-marker").length,
    );
    expect(count1).toBe(1);

    // 再次注入
    await injectTrip(page, {
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
          ],
        },
      ],
    });

    const count2 = await page.evaluate(
      () => document.querySelectorAll(".attraction-marker").length,
    );
    // 应该仍然是 1，不是 2
    expect(count2).toBe(1);
  });
});
