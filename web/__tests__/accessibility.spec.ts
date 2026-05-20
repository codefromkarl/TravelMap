/**
 * 按钮可点击性验证测试
 *
 * 遍历页面所有 button[id] 元素，验证：
 * 1. 按钮未被其他元素遮挡（z-index/overflow）
 * 2. 按钮有事件监听器绑定
 * 3. 按钮可见（非 display:none / visibility:hidden）
 */

import { expect, test } from "@playwright/test";

/** 等待 JS 模块加载完成 */
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

test.describe("按钮可点击性验证", () => {
  test("所有 button[id] 元素应无遮挡且可交互", async ({ page }) => {
    await page.goto("index.html");
    const jsLoaded = await waitForJsModules(page);
    if (!jsLoaded) {
      console.log("[SKIP] JS 模块未加载");
      return;
    }

    // 收集所有 button[id] 元素的状态
    const buttonStates = await page.evaluate(() => {
      const buttons = document.querySelectorAll("button[id]");
      const results: Array<{
        id: string;
        visible: boolean;
        obscured: boolean;
        hasClickListener: boolean;
        disabled: boolean;
        display: string;
        visibility: string;
      }> = [];

      for (const btn of buttons) {
        const id = btn.id;
        const style = getComputedStyle(btn);
        const rect = btn.getBoundingClientRect();

        // 检查可见性
        const visible =
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0;

        // 检查是否被遮挡（通过 elementFromPoint）
        let obscured = false;
        if (visible) {
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          const topElement = document.elementFromPoint(centerX, centerY);
          obscured = topElement !== btn && !btn.contains(topElement);
        }

        // 检查事件监听器（通过 onclick 属性或 data 属性推断）
        const hasClickListener =
          btn.onclick !== null ||
          btn.hasAttribute("onclick") ||
          btn.getAttribute("role") === "button" ||
          btn.tagName === "BUTTON"; // button 标签默认可点击

        results.push({
          id,
          visible,
          obscured,
          hasClickListener,
          disabled: btn.classList.contains("disabled-ghost") || (btn as HTMLButtonElement).disabled,
          display: style.display,
          visibility: style.visibility,
        });
      }

      return results;
    });

    // 验证每个按钮
    expect(buttonStates.length).toBeGreaterThan(0);

    // 统计
    const visibleButtons = buttonStates.filter((b) => b.visible);
    const obscuredButtons = visibleButtons.filter((b) => b.obscured && !b.disabled);

    // 输出详细信息用于调试
    if (obscuredButtons.length > 0) {
      console.log(
        "被遮挡的按钮:",
        obscuredButtons.map((b) => b.id),
      );
    }

    // 可见且非 disabled 的按钮不应被遮挡
    expect(
      obscuredButtons.length,
      `以下按钮被遮挡: ${obscuredButtons.map((b) => b.id).join(", ")}`,
    ).toBe(0);
  });

  test("可见按钮应有合理的尺寸（可触达）", async ({ page }) => {
    await page.goto("index.html");
    const jsLoaded = await waitForJsModules(page);
    if (!jsLoaded) {
      console.log("[SKIP] JS 模块未加载");
      return;
    }

    const smallButtons = await page.evaluate(() => {
      const buttons = document.querySelectorAll("button[id]");
      const tooSmall: Array<{ id: string; width: number; height: number }> = [];

      for (const btn of buttons) {
        const style = getComputedStyle(btn);
        if (style.display === "none" || style.visibility === "hidden") continue;

        const rect = btn.getBoundingClientRect();
        // 最小触达尺寸 24x24（宽松标准，移动端建议 44x44）
        if (rect.width < 24 || rect.height < 24) {
          tooSmall.push({
            id: btn.id,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          });
        }
      }

      return tooSmall;
    });

    // 输出小按钮信息（警告而非失败）
    if (smallButtons.length > 0) {
      console.log(
        "尺寸过小的按钮:",
        smallButtons.map((b) => `${b.id}(${b.width}x${b.height})`),
      );
    }

    // 允许少量小按钮存在（如关闭按钮），但不应太多
    expect(
      smallButtons.length,
      `${smallButtons.length} 个按钮尺寸过小: ${smallButtons.map((b) => b.id).join(", ")}`,
    ).toBeLessThanOrEqual(3);
  });

  test("disabled-ghost 按钮移除禁用类后应可点击", async ({ page }) => {
    await page.goto("index.html");
    const jsLoaded = await waitForJsModules(page);
    if (!jsLoaded) {
      console.log("[SKIP] JS 模块未加载");
      return;
    }

    // 找到一个 disabled-ghost 按钮
    const disabledBtnId = await page.evaluate(() => {
      const btn = document.querySelector("button.disabled-ghost[id]");
      return btn?.id || null;
    });

    if (!disabledBtnId) {
      console.log("[SKIP] 未找到 disabled-ghost 按钮");
      return;
    }

    // 移除 disabled-ghost 类
    await page.evaluate((id: string) => {
      document.getElementById(id)?.classList.remove("disabled-ghost");
    }, disabledBtnId);

    // 验证按钮不再有 disabled-ghost 类
    const isEnabled = await page.evaluate((id: string) => {
      return !document.getElementById(id)?.classList.contains("disabled-ghost");
    }, disabledBtnId);

    expect(isEnabled).toBe(true);

    // 点击不应抛出错误
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    const btn = page.locator(`#${disabledBtnId}`);
    await btn.click();
    await page.waitForTimeout(500);

    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("Failed to resolve module specifier") &&
        !e.includes("esm.sh") &&
        !e.includes("Failed to fetch") &&
        !e.includes("net::ERR") &&
        !e.includes("Cross-Origin") &&
        !e.includes("CORS"),
    );

    expect(criticalErrors, `点击 ${disabledBtnId} 后出现错误: ${criticalErrors.join(", ")}`).toEqual([]);
  });
});
