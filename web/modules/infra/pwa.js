/**
 * PWA — Service Worker 注册、安装提示与版本更新提示
 *
 * 仅在生产（https + 非 localhost）注册，避免影响本地开发。
 * SW 采用运行时缓存策略 + 构建期注入预缓存清单（见 web/sw.js），部署工件首次访问即可离线可用。
 *
 * 安装提示（beforeinstallprompt / appinstalled）与更新提示（controllerchange）
 * 只挂事件监听，事件本身由浏览器决定是否触发；埋点由 analytics.js 在本地环境静默。
 * sw.js 的 skipWaiting + clients.claim 保证新 SW 激活时会触发 controllerchange。
 */

import { track } from "./analytics.js";
import { I18N } from "./i18n.js";
import { currentLang } from "./context.js";

const INSTALL_BTN_ID = "btn-install-pwa";
const UPDATE_TOAST_ID = "pwa-update-toast";

let deferredInstallPrompt = null;

/** 运行时读取当前语言，避免捕获过期的语言快照 */
function t(key) {
  const dict = I18N[currentLang] || I18N.zh;
  return dict[key] || I18N.zh[key] || "";
}

export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:') return;
  if (['localhost', '127.0.0.1'].includes(location.hostname)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[PWA] Service Worker 注册失败:', err);
    });
  });
}

// ─── 安装提示 ────────────────────────────────────────

function removeInstallButton() {
  document.getElementById(INSTALL_BTN_ID)?.remove();
}

function showInstallButton() {
  if (document.getElementById(INSTALL_BTN_ID)) return;
  const btn = document.createElement("button");
  btn.id = INSTALL_BTN_ID;
  btn.textContent = `📱 ${t("installPwa")}`;
  btn.title = t("installPwa");
  btn.setAttribute("aria-label", t("installPwa"));
  btn.style.cssText = [
    "position: fixed",
    "right: 20px",
    "bottom: 20px",
    "z-index: 10000",
    "display: flex",
    "align-items: center",
    "gap: 8px",
    "padding: 12px 18px",
    "border: none",
    "border-radius: 24px",
    "background: #6366f1",
    "color: #ffffff",
    "font-size: 14px",
    "font-weight: 600",
    "cursor: pointer",
    "box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35)",
  ].join("; ");
  btn.addEventListener("click", async () => {
    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    removeInstallButton();
    if (!promptEvent) return;
    try {
      promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      track(outcome === "accepted" ? "install_prompt_accepted" : "install_prompt_dismissed");
    } catch {
      // prompt 被浏览器拒绝（如已安装或非用户手势）时按取消处理
      track("install_prompt_dismissed");
    }
  });
  document.body.appendChild(btn);
}

/**
 * 安装提示：浏览器满足 PWA 安装条件时触发 beforeinstallprompt，
 * 展示「安装到主屏幕」浮动按钮；安装完成（appinstalled）后移除按钮。
 */
export function setupInstallPrompt() {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    showInstallButton();
  });
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    removeInstallButton();
  });
}

// ─── 更新提示 ────────────────────────────────────────

function showUpdateToast() {
  if (document.getElementById(UPDATE_TOAST_ID)) return;
  const toast = document.createElement("button");
  toast.id = UPDATE_TOAST_ID;
  toast.textContent = `🔄 ${t("updateReady")}`;
  toast.title = t("updateReady");
  toast.setAttribute("aria-label", t("updateReady"));
  toast.style.cssText = [
    "position: fixed",
    "left: 50%",
    "bottom: 24px",
    "transform: translateX(-50%)",
    "z-index: 10000",
    "padding: 10px 20px",
    "border: 1px solid #3f3f46",
    "border-radius: 24px",
    "background: #18181b",
    "color: #e4e4e7",
    "font-size: 14px",
    "cursor: pointer",
    "box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35)",
  ].join("; ");
  toast.addEventListener("click", () => {
    location.reload();
  });
  document.body.appendChild(toast);
}

/**
 * 更新提示：新版本 Service Worker 接管页面（controllerchange）后，
 * 显示「新版本已就绪，点击刷新」提示；点击整条提示刷新页面。
 * sw.js 激活时 skipWaiting + clients.claim，因此新版本激活必然触发该事件。
 */
export function setupUpdatePrompt() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    showUpdateToast();
  });
}
