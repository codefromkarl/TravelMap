/**
 * pwa.js 单元测试
 *
 * 覆盖：
 *   - beforeinstallprompt → 显示安装按钮（#btn-install-pwa），点击调用 prompt()
 *   - userChoice accepted / dismissed → 对应埋点 + 按钮移除
 *   - appinstalled → 按钮移除
 *   - controllerchange → 显示刷新提示，点击 → location.reload()
 *   - registerServiceWorker 本地静默（localhost / 非 https 不注册）、生产环境注册
 *
 * jsdom 没有 navigator.serviceWorker 与 beforeinstallprompt 事件：
 * 用 defineProperty mock navigator 属性 + 手动派发 window 事件模拟。
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../infra/analytics.js", () => ({
  track: vi.fn(),
}));

import { registerServiceWorker, setupInstallPrompt, setupUpdatePrompt } from "../infra/pwa.js";
import { track } from "../infra/analytics.js";

const INSTALL_BTN_ID = "btn-install-pwa";
const UPDATE_TOAST_ID = "pwa-update-toast";

/** 替换 window.location：pwa.js 通过全局 location 读取协议/主机名并调用 reload */
function stubLocation(overrides = {}) {
  const loc = { ...window.location, ...overrides };
  Object.defineProperty(window, "location", {
    value: loc,
    configurable: true,
    writable: true,
  });
  return loc;
}

/** mock navigator.serviceWorker（jsdom 默认没有该属性） */
function stubServiceWorker(extra = {}) {
  const listeners = {};
  const sw = {
    controller: null,
    addEventListener: vi.fn((type, callback) => { listeners[type] = callback; }),
    ...extra,
  };
  Object.defineProperty(navigator, "serviceWorker", {
    value: sw,
    configurable: true,
  });
  return { sw, listeners };
}

/** 构造带 prompt()/userChoice 的 beforeinstallprompt 事件（真实事件为 cancelable） */
function installPromptEvent(outcome = "accepted") {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  event.prompt = vi.fn();
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

beforeEach(() => {
  document.body.innerHTML = "";
  track.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  delete navigator.serviceWorker;
});

describe("setupInstallPrompt", () => {
  it("beforeinstallprompt → 显示安装按钮并阻止浏览器默认安装横幅", () => {
    setupInstallPrompt();
    const event = installPromptEvent();
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    const btn = document.getElementById(INSTALL_BTN_ID);
    expect(btn).not.toBeNull();
    expect(btn.textContent).toContain("安装到主屏幕");
  });

  it("点击安装按钮 → 调用 prompt()；accepted → 上报 install_prompt_accepted 并移除按钮", async () => {
    setupInstallPrompt();
    const event = installPromptEvent("accepted");
    window.dispatchEvent(event);

    document.getElementById(INSTALL_BTN_ID).click();

    expect(event.prompt).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(track).toHaveBeenCalledWith("install_prompt_accepted");
    });
    expect(document.getElementById(INSTALL_BTN_ID)).toBeNull();
  });

  it("userChoice dismissed → 上报 install_prompt_dismissed", async () => {
    setupInstallPrompt();
    const event = installPromptEvent("dismissed");
    window.dispatchEvent(event);

    document.getElementById(INSTALL_BTN_ID).click();

    await vi.waitFor(() => {
      expect(track).toHaveBeenCalledWith("install_prompt_dismissed");
    });
  });

  it("appinstalled → 移除安装按钮", () => {
    setupInstallPrompt();
    window.dispatchEvent(installPromptEvent());
    expect(document.getElementById(INSTALL_BTN_ID)).not.toBeNull();

    window.dispatchEvent(new Event("appinstalled"));
    expect(document.getElementById(INSTALL_BTN_ID)).toBeNull();
  });
});

describe("setupUpdatePrompt", () => {
  it("controllerchange → 显示刷新提示；点击 → location.reload()", () => {
    const reloadSpy = vi.fn();
    stubLocation({ reload: reloadSpy });
    const { sw, listeners } = stubServiceWorker();
    setupUpdatePrompt();

    expect(sw.addEventListener).toHaveBeenCalledWith("controllerchange", expect.any(Function));

    listeners["controllerchange"]();
    const toast = document.getElementById(UPDATE_TOAST_ID);
    expect(toast).not.toBeNull();
    expect(toast.textContent).toContain("新版本已就绪，点击刷新");

    toast.click();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it("无 serviceWorker 环境（jsdom 默认）静默不抛错", () => {
    expect(() => setupUpdatePrompt()).not.toThrow();
  });
});

describe("registerServiceWorker", () => {
  it("localhost（https）静默：不注册 Service Worker", () => {
    const { sw } = stubServiceWorker({ register: vi.fn(() => Promise.resolve()) });
    stubLocation({ protocol: "https:", hostname: "localhost" });

    registerServiceWorker();
    window.dispatchEvent(new Event("load"));

    expect(sw.register).not.toHaveBeenCalled();
  });

  it("非 https 环境静默：不注册 Service Worker", () => {
    const { sw } = stubServiceWorker({ register: vi.fn(() => Promise.resolve()) });
    stubLocation({ protocol: "http:", hostname: "example.com" });

    registerServiceWorker();
    window.dispatchEvent(new Event("load"));

    expect(sw.register).not.toHaveBeenCalled();
  });

  it("生产环境（https + 非 localhost）：load 后注册 /sw.js", () => {
    const { sw } = stubServiceWorker({ register: vi.fn(() => Promise.resolve()) });
    stubLocation({ protocol: "https:", hostname: "example.com" });

    registerServiceWorker();
    expect(sw.register).not.toHaveBeenCalled(); // load 事件之前不注册

    window.dispatchEvent(new Event("load"));
    expect(sw.register).toHaveBeenCalledTimes(1);
    expect(sw.register).toHaveBeenCalledWith("/sw.js");
  });
});

