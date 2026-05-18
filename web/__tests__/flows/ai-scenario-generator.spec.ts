/**
 * AI 测试场景生成器 — 自动生成边界测试场景
 *
 * 设计思路：
 *   1. 定义 Action 原语（click, type, press, refresh, resize, wait...）
 *   2. 用场景生成器组合这些原语，产生多样化的测试路径
 *   3. 每个场景自动附带健康检查断言
 *   4. 支持 seed 重放 — 发现问题时可精确定位
 *
 * 后续迭代：
 *   - 用 LLM 根据页面结构生成更智能的测试场景
 *   - 记录测试覆盖的 DOM 路径，发现未覆盖区域
 */

import { expect, test } from "@playwright/test";

// ─── Action 原语 ──────────────────────────────────────────────

type Action =
  | { type: "type"; text: string }
  | { type: "press"; key: string }
  | { type: "click"; x: number; y: number }
  | { type: "refresh" }
  | { type: "goBack" }
  | { type: "goForward" }
  | { type: "resize"; w: number; h: number }
  | { type: "wait"; ms: number }
  | { type: "clearStorage" }
  | { type: "setStorage"; key: string; value: string };

interface Scenario {
  name: string;
  seed: number;
  actions: Action[];
}

// ─── 场景生成器 ────────────────────────────────────────────────

/** 伪随机数生成器（可 seed 重放） */
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

/** 边界输入集合 */
const EDGE_INPUTS = [
  "",
  " ",
  "  ",
  "\n",
  "\t",
  "a",
  "你好世界",
  "🇨🇳🎉",
  "<script>alert(1)</script>",
  "'; DROP TABLE--",
  "Null\u0000Byte",
  "\u200B",          // 零宽空格
  "\uFEFF",          // BOM
  "a".repeat(100),   // 长
  "a".repeat(1000),  // 很长
  "a".repeat(5000),  // 超长
  "第1天故宫第2天长城第3天颐和园第4天天坛",  // 密集
  "!!!???###",
  "1234567890".repeat(20),
  "北京/上海\\广州|深圳",
];

const KEYS = ["Tab", "Enter", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Backspace", "Delete", "Home", "End"];

const VIEWPORTS = [
  { w: 320, h: 568 },
  { w: 375, h: 812 },
  { w: 768, h: 1024 },
  { w: 1280, h: 720 },
  { w: 1920, h: 1080 },
  { w: 100, h: 100 },
  { w: 4000, h: 1000 },
];

/** 生成随机场景 */
function generateScenario(seed: number, actionCount: number): Scenario {
  const rand = seededRandom(seed);
  const actions: Action[] = [];

  for (let i = 0; i < actionCount; i++) {
    const r = rand();
    if (r < 0.30) {
      // 输入文字
      actions.push({
        type: "type",
        text: EDGE_INPUTS[Math.floor(rand() * EDGE_INPUTS.length)],
      });
    } else if (r < 0.50) {
      // 按键
      actions.push({
        type: "press",
        key: KEYS[Math.floor(rand() * KEYS.length)],
      });
    } else if (r < 0.60) {
      // 点击
      actions.push({
        type: "click",
        x: Math.floor(rand() * 1280),
        y: Math.floor(rand() * 720),
      });
    } else if (r < 0.70) {
      // 刷新
      actions.push({ type: "refresh" });
    } else if (r < 0.78) {
      // 视口变化
      const vp = VIEWPORTS[Math.floor(rand() * VIEWPORTS.length)];
      actions.push({ type: "resize", w: vp.w, h: vp.h });
    } else if (r < 0.85) {
      // 导航
      actions.push(rand() < 0.5 ? { type: "goBack" } : { type: "goForward" });
    } else if (r < 0.90) {
      // 存储
      if (rand() < 0.5) {
        actions.push({ type: "clearStorage" });
      } else {
        actions.push({
          type: "setStorage",
          key: "travel-agent-provider",
          value: ["openai", "anthropic", "", "invalid", "<script>"][Math.floor(rand() * 5)],
        });
      }
    } else {
      // 等待
      actions.push({ type: "wait", ms: Math.floor(rand() * 500) });
    }
  }

  return { name: `seed-${seed}`, seed, actions };
}

/** 执行场景 */
async function executeScenario(
  page: import("@playwright/test").Page,
  scenario: Scenario,
) {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("index.html");
  await page.waitForLoadState("domcontentloaded");

  for (const action of scenario.actions) {
    try {
      switch (action.type) {
        case "type":
          await page.keyboard.type(action.text, { delay: 2 });
          break;
        case "press":
          await page.keyboard.press(action.key);
          break;
        case "click":
          await page.mouse.click(action.x, action.y);
          break;
        case "refresh":
          await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
          break;
        case "goBack":
          await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
          break;
        case "goForward":
          await page.goForward({ waitUntil: "domcontentloaded" }).catch(() => {});
          break;
        case "resize":
          await page.setViewportSize({ width: action.w, height: action.h });
          break;
        case "wait":
          await page.waitForTimeout(action.ms);
          break;
        case "clearStorage":
          await page.evaluate(() => { try { localStorage.clear(); } catch {} });
          break;
        case "setStorage":
          await page.evaluate(
            ({ key, value }) => { try { localStorage.setItem(key, value); } catch {} },
            { key: action.key, value: action.value },
          );
          break;
      }
    } catch {
      // 单个操作失败不应中断整个场景（但要记录）
    }

    // 每 5 步检查页面健康
    const stepIdx = scenario.actions.indexOf(action);
    if (stepIdx % 5 === 4) {
      try {
        const url = page.url();
        if (!url.includes("index.html")) {
          await page.goto("index.html").catch(() => {});
        }
        const hasApp = await page.locator("#app").count();
        if (hasApp !== 1) {
          throw new Error(`页面在 seed=${scenario.seed} 第 ${stepIdx} 步后崩溃`);
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes("崩溃")) throw e;
        // 导航失败不终止，继续执行
      }
    }
  }

    // 最终验证
    const currentUrl = page.url();
    // 导航后可能离开了 index.html，重新导航回来检查
    if (!currentUrl.includes("index.html")) {
      await page.goto("index.html").catch(() => {});
    }
    const hasApp = await page.locator("#app").count();
    expect(hasApp, `场景 ${scenario.name} 结束后 #app 不存在`).toBe(1);

  const criticalErrors = errors.filter(
    (e) =>
      !e.includes("Failed to resolve module specifier") &&
      !e.includes("esm.sh") &&
      !e.includes("Failed to fetch") &&
      !e.includes("net::ERR"),
  );
  expect(criticalErrors, `场景 ${scenario.name} 产生了致命错误`).toEqual([]);
}

// ─── 预定义边界场景 ────────────────────────────────────────────

const MANUAL_SCENARIOS: Scenario[] = [
  {
    name: "快速刷新+输入",
    seed: 0,
    actions: [
      { type: "type", text: "北京" },
      { type: "press", key: "Enter" },
      { type: "refresh" },
      { type: "type", text: "上海" },
      { type: "press", key: "Enter" },
    ],
  },
  {
    name: "极端输入+刷新",
    seed: 0,
    actions: [
      { type: "type", text: "<script>alert(1)</script>" },
      { type: "press", key: "Enter" },
      { type: "wait", ms: 200 },
      { type: "refresh" },
      { type: "type", text: "'; DROP TABLE--" },
      { type: "press", key: "Enter" },
    ],
  },
  {
    name: "视口+输入+刷新",
    seed: 0,
    actions: [
      { type: "resize", w: 375, h: 812 },
      { type: "type", text: "移动端输入" },
      { type: "press", key: "Enter" },
      { type: "resize", w: 1920, h: 1080 },
      { type: "refresh" },
    ],
  },
  {
    name: "存储污染后恢复",
    seed: 0,
    actions: [
      { type: "setStorage", key: "travel-agent-provider", value: "<script>" },
      { type: "refresh" },
      { type: "type", text: "测试" },
      { type: "press", key: "Enter" },
      { type: "clearStorage" },
      { type: "refresh" },
    ],
  },
  {
    name: "连续空输入",
    seed: 0,
    actions: [
      { type: "type", text: "" },
      { type: "press", key: "Enter" },
      { type: "press", key: "Enter" },
      { type: "press", key: "Enter" },
      { type: "type", text: "   " },
      { type: "press", key: "Enter" },
    ],
  },
  {
    name: "长消息+中断",
    seed: 0,
    actions: [
      { type: "type", text: "a".repeat(2000) },
      { type: "press", key: "Enter" },
      { type: "wait", ms: 100 },
      { type: "refresh" },
      { type: "type", text: "恢复后" },
      { type: "press", key: "Enter" },
    ],
  },
];

// ─── 测试执行 ─────────────────────────────────────────────────

// 预定义场景
for (const scenario of MANUAL_SCENARIOS) {
  test(`边界场景: ${scenario.name}`, async ({ page }) => {
    await executeScenario(page, scenario);
  });
}

// 生成随机场景（5 个，seed 固定可重放）
const RANDOM_SEEDS = [42, 137, 256, 777, 1024];
for (const seed of RANDOM_SEEDS) {
  const scenario = generateScenario(seed, 20);
  test(`随机场景: ${scenario.name} (${scenario.actions.length} 步)`, async ({ page }) => {
    test.setTimeout(60_000); // 随机场景需要更长时间
    await executeScenario(page, scenario);
  });
}
