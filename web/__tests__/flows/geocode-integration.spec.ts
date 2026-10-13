/**
 * 地理编码集成测试 — 验证前端自动补全 → marker 渲染的完整链路
 *
 * 场景：
 *   1. 注入骨架行程 → 自动触发地理编码 → marker 渲染
 *   2. 注入完整行程 → 不触发地理编码 → 直接渲染
 *   3. 地理编码失败 → showToast 告警 → 保留缺失坐标，不生成虚构 marker
 *   4. 行程变更 → 重新触发地理编码 → marker 更新
 */

import { expect, type Page } from "@playwright/test";
import { test, GEOCODE_TEST_KEY } from "../fixtures/geocode";
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

// ─── 测试数据 ─────────────────────────────────────────

const SKELETON_TRIP = {
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
          // 无 location — 骨架数据
        },
        {
          name: "灵隐寺",
          nameZh: "灵隐寺",
          description: "千年古刹",
          // 无 location — 骨架数据
        },
      ],
    },
  ],
};

const FULL_TRIP = {
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
          location: { latitude: 30.2458, longitude: 120.1484 },
        },
        {
          name: "灵隐寺",
          nameZh: "灵隐寺",
          description: "千年古刹",
          location: { latitude: 30.2414, longitude: 120.1017 },
        },
      ],
    },
  ],
};

const ZERO_COORD_TRIP = {
  city: "杭州",
  days: [
    {
      day: 1,
      city: "杭州",
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

// ─── 辅助函数 ─────────────────────────────────────────

async function waitForMapReady(page: Page) {
  await page.waitForFunction(() => {
    return !!window._pageMapInstance && typeof window._renderTripAnimated === "function";
  }, { timeout: 10000 });
}

async function injectTrip(page: Page, trip: any) {
  await page.evaluate(async (t) => {
    window._lastTripPlan = t;
    await window._renderTripAnimated(t);
    // The animated pipeline previews its last popup; start explicit click checks from closed state.
    window._pageMapInstance.closePopup();
  }, trip);
}

// ─── 测试 ─────────────────────────────────────────────

test.describe("地理编码集成测试", () => {
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

  // === 1. 骨架行程自动触发地理编码 ===
  test("注入骨架行程（无坐标）应自动触发地理编码并渲染 marker", async ({ page, geocoder }) => {
    await injectTrip(page, SKELETON_TRIP);

    const markerCount = await page.evaluate(() => {
      return document.querySelectorAll(".attraction-marker").length;
    });

    // 两个景点都应被地理编码补全并渲染 marker
    expect(markerCount).toBe(2);
    expect(geocoder.queries).toEqual([
      { address: '西湖', city: '杭州', key: GEOCODE_TEST_KEY },
      { address: '灵隐寺', city: '杭州', key: GEOCODE_TEST_KEY },
    ]);
  });

  // === 2. 完整行程不触发地理编码 ===
  test("注入完整行程（有坐标）应直接渲染 marker，不触发地理编码", async ({ page }) => {
    // 监听 fetch 调用
    const fetchCalls: string[] = [];
    await page.evaluate(() => {
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        if (typeof args[0] === 'string' && args[0].includes('/v3/geocode/geo')) {
          window._geocodeFetchCalls = (window._geocodeFetchCalls || 0) + 1;
        }
        return originalFetch.apply(this, args);
      };
      window._geocodeFetchCalls = 0;
    });

    await injectTrip(page, FULL_TRIP);

    const markerCount = await page.evaluate(() => {
      return document.querySelectorAll(".attraction-marker").length;
    });

    const geocodeCalls = await page.evaluate(() => window._geocodeFetchCalls || 0);

    expect(markerCount).toBe(2);
    // 完整行程不应触发地理编码
    expect(geocodeCalls).toBe(0);
  });

  // === 3. 零坐标景点触发补全 ===
  test("坐标为 {0,0} 的景点应触发地理编码补全", async ({ page }) => {
    await injectTrip(page, ZERO_COORD_TRIP);

    const markerCount = await page.evaluate(() => {
      return document.querySelectorAll(".attraction-marker").length;
    });

    // 两个景点都应有 marker（零坐标被补全）
    expect(markerCount).toBe(2);
  });

  // === 4. 行程变更触发重新补全 ===
  test("注入新行程后应重新触发地理编码并更新 marker", async ({ page }) => {
    // 第一次注入骨架行程
    await injectTrip(page, SKELETON_TRIP);

    const count1 = await page.evaluate(() => {
      return document.querySelectorAll(".attraction-marker").length;
    });
    expect(count1).toBe(2);

    // 注入新行程（北京）
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
              // 无 location — 骨架数据
            },
          ],
        },
      ],
    };
    await injectTrip(page, newTrip);

    const count2 = await page.evaluate(() => {
      return document.querySelectorAll(".attraction-marker").length;
    });

    // 新行程应有 1 个 marker（故宫被补全）
    expect(count2).toBe(1);

    // 验证新 marker 内容
    await page.evaluate(() => {
      const marker = document.querySelector(".attraction-marker") as HTMLElement;
      if (marker) marker.click();
    });
    await page.waitForTimeout(500);

    const popupContent = await page.evaluate(() => {
      return document.querySelector(".leaflet-popup-content")?.textContent || "";
    });
    expect(popupContent).toContain("故宫");
    // 旧的杭州景点不应存在
    expect(popupContent).not.toContain("西湖");
  });

  // === 5. 地理编码补全后坐标合理 ===
  test("地理编码补全后的坐标应在合理范围内", async ({ page, geocoder }) => {
    await injectTrip(page, SKELETON_TRIP);

    // Validate actual Leaflet coordinates against mocked provider results, not DOM ids.
    const coords = await page.evaluate(() => {
      const result: Array<{ latitude: number; longitude: number }> = [];
      window._pageMapInstance.eachLayer((layer: any) => {
        if (String(layer.options?.icon?.options?.html || '').includes('attraction-marker')) {
          const point = layer.getLatLng();
          result.push({ latitude: point.lat, longitude: point.lng });
        }
      });
      return result;
    });
    const storedLocations = await page.evaluate(() => window._lastTripPlan.days[0].attractions.map((attr: any) => attr.location));
    expect(storedLocations).toEqual([
      { latitude: 30.2458, longitude: 120.1484 },
      { latitude: 30.2414, longitude: 120.1017 },
    ]);
    // Provider locations are GCJ-02; OSM Leaflet tiles display converted WGS-84 points.
    expect(coords).toHaveLength(2);
    expect(coords[0].latitude).toBeCloseTo(30.24811967465639, 6);
    expect(coords[0].longitude).toBeCloseTo(120.14368895736219, 6);
    expect(coords[1].latitude).toBeCloseTo(30.243672980288512, 6);
    expect(coords[1].longitude).toBeCloseTo(120.09689513509463, 6);
    expect(geocoder.queries).toHaveLength(2);

    // 验证 popup 包含景点信息
    await page.evaluate(() => {
      const marker = document.querySelector(".attraction-marker") as HTMLElement;
      if (marker) marker.click();
    });
    await page.waitForTimeout(500);

    const popupContent = await page.evaluate(() => {
      return document.querySelector(".leaflet-popup-content")?.textContent || "";
    });

    // popup 应包含景点名称
    const hasAttraction = popupContent.includes("西湖") || popupContent.includes("灵隐寺");
    expect(hasAttraction).toBe(true);
  });

  // === 6. 空行程不触发地理编码 ===
  test("空行程不应触发地理编码", async ({ page }) => {
    const emptyTrip = { city: "空城", days: [] };

    // 监听 fetch 调用
    await page.evaluate(() => {
      window._geocodeFetchCalls = 0;
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        if (typeof args[0] === 'string' && args[0].includes('/v3/geocode/geo')) {
          window._geocodeFetchCalls++;
        }
        return originalFetch.apply(this, args);
      };
    });

    await injectTrip(page, emptyTrip);

    const markerCount = await page.evaluate(() => {
      return document.querySelectorAll(".attraction-marker").length;
    });

    const geocodeCalls = await page.evaluate(() => window._geocodeFetchCalls || 0);

    expect(markerCount).toBe(0);
    expect(geocodeCalls).toBe(0);
  });
  test('provider unavailable leaves missing coordinates and produces no invented markers', async ({ page, geocoder }) => {
    geocoder.unavailable();
    await injectTrip(page, SKELETON_TRIP);
    expect(geocoder.queries).toHaveLength(2);
    expect(await page.locator('.attraction-marker').count()).toBe(0);
    const locations = await page.evaluate(() => window._lastTripPlan.days[0].attractions.map((attr: any) => attr.location ?? null));
    expect(locations).toEqual([null, null]);
    await expect(page.locator('#toast')).toContainText('坐标');
  });

});
