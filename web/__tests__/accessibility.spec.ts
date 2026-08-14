/**
 * 活动界面交互可用性验证
 *
 * 只检查真实处于活动 DOM、与视口相交的交互目标。隐藏兼容容器、关闭的
 * off-canvas 面板以及祖先不可见的元素不属于当前用户可操作界面。
 */

import { expect, test, type Page } from "@playwright/test";

const INTERACTIVE_SELECTOR = [
  "button",
  '[role="button"]',
  "a[href]",
  'input:not([type="hidden"])',
  "select",
  "textarea",
  ".quick-prompt[data-prompt]",
].join(", ");

interface InteractiveState {
  name: string;
  visible: boolean;
  obscured: boolean;
  disabled: boolean;
  width: number;
  height: number;
}

/** 等待 JS 模块加载完成 */
async function waitForJsModules(page: Page, timeout = 15000): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => {
        const panel = document.querySelector("pi-chat-panel");
        return panel && panel.constructor.name !== "HTMLElement";
      },
      { timeout },
    );
    return true;
  } catch {
    return false;
  }
}

async function collectInteractiveStates(
  page: Page,
  selector = INTERACTIVE_SELECTOR,
): Promise<InteractiveState[]> {
  return page.locator(selector).evaluateAll((elements) => {
    const hasInvisibleAncestor = (element: Element): boolean => {
      for (let current: Element | null = element; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (
          current.hasAttribute("hidden") ||
          current.getAttribute("aria-hidden") === "true" ||
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.visibility === "collapse" ||
          style.contentVisibility === "hidden" ||
          Number.parseFloat(style.opacity) === 0
        ) {
          return true;
        }
      }
      return false;
    };

    const describe = (element: Element): string => {
      const htmlElement = element as HTMLElement;
      const accessibleName =
        element.getAttribute("aria-label") ||
        element.getAttribute("title") ||
        element.getAttribute("data-i18n") ||
        htmlElement.innerText?.trim().replace(/\s+/g, " ").slice(0, 40);
      const className = [...element.classList].slice(0, 2).join(".");
      return element.id || accessibleName || `${element.tagName.toLowerCase()}${className ? `.${className}` : ""}`;
    };

    return elements.map((element) => {
      const rect = element.getBoundingClientRect();
      const hasLayoutBox = element.getClientRects().length > 0 && rect.width > 0 && rect.height > 0;
      const intersectsViewport =
        rect.right > 0 &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.top < window.innerHeight;
      const visible = !hasInvisibleAncestor(element) && hasLayoutBox && intersectsViewport;
      const disabled =
        (element as HTMLButtonElement | HTMLInputElement).disabled === true ||
        element.getAttribute("aria-disabled") === "true" ||
        element.classList.contains("disabled-ghost");

      let obscured = false;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const centerInViewport =
        centerX >= 0 && centerY >= 0 && centerX < window.innerWidth && centerY < window.innerHeight;
      if (visible && centerInViewport) {
        const topElement = document.elementFromPoint(centerX, centerY);
        obscured = topElement !== element && !element.contains(topElement);
      }

      return {
        name: describe(element),
        visible,
        obscured,
        disabled,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    });
  });
}

test.describe("活动界面交互可用性", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/config.local.js", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: "export default {};",
      });
    });
    await page.addInitScript(() => {
      localStorage.setItem("travel-agent-onboarding-done", "true");
    });
  });

  test("所有可见交互目标应无遮挡", async ({ page }) => {
    await page.goto("index.html");
    const jsLoaded = await waitForJsModules(page);
    expect(jsLoaded, "JS 模块应成功加载，不能把加载失败当作无障碍测试通过").toBe(true);

    const states = await collectInteractiveStates(page);
    const visibleTargets = states.filter((state) => state.visible);
    const obscuredTargets = visibleTargets.filter((state) => state.obscured && !state.disabled);

    expect(visibleTargets.length).toBeGreaterThan(0);
    expect(
      obscuredTargets,
      `以下活动交互目标被遮挡: ${obscuredTargets.map((state) => state.name).join(", ")}`,
    ).toEqual([]);
  });

  test("可见且启用的交互目标应至少为 44x44", async ({ page }) => {
    await page.goto("index.html");
    const jsLoaded = await waitForJsModules(page);
    expect(jsLoaded, "JS 模块应成功加载，不能把加载失败当作触摸目标测试通过").toBe(true);

    const states = await collectInteractiveStates(page);
    const smallTargets = states.filter(
      (state) =>
        state.visible && !state.disabled && (state.width < 44 || state.height < 44),
    );

    expect(
      smallTargets,
      `以下活动交互目标小于 44x44: ${smallTargets
        .map((state) => `${state.name}(${state.width}x${state.height})`)
        .join(", ")}`,
    ).toEqual([]);
  });

  test("可见 disabled-ghost 按钮移除禁用类后应可点击", async ({ page }) => {
    await page.goto("index.html");
    const jsLoaded = await waitForJsModules(page);
    expect(jsLoaded, "JS 模块应成功加载，不能把加载失败当作交互测试通过").toBe(true);

    const states = await collectInteractiveStates(page, "button.disabled-ghost[id]");
    const visibleCandidate = states.find((state) => state.visible);
    test.skip(!visibleCandidate, "活动界面中没有可见的 disabled-ghost 按钮");

    const disabledBtnId = visibleCandidate?.name;
    expect(disabledBtnId).toBeTruthy();
    const btn = page.locator(`#${disabledBtnId}`);
    await btn.evaluate((element) => element.classList.remove("disabled-ghost"));
    await expect(btn).not.toHaveClass(/disabled-ghost/);

    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await btn.click();
    await page.waitForTimeout(500);

    const criticalErrors = errors.filter(
      (error) =>
        !error.includes("Failed to resolve module specifier") &&
        !error.includes("esm.sh") &&
        !error.includes("Failed to fetch") &&
        !error.includes("net::ERR") &&
        !error.includes("Cross-Origin") &&
        !error.includes("CORS"),
    );

    expect(
      criticalErrors,
      `点击 ${disabledBtnId} 后出现错误: ${criticalErrors.join(", ")}`,
    ).toEqual([]);
  });
});
