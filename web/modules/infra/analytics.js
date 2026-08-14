/**
 * 前端轻量埋点 — 批量节流上报到 POST /api/track（自建分析）
 *
 * 与 error-report 相同的 pending/flush 模式：8 秒间隔、上限 20 条。
 * 上报失败静默，不阻塞主流程；游客与登录用户均可上报。
 * 服务端对 meta 做二次脱敏与 IP 限流。
 */

const MAX_PENDING = 20;
const FLUSH_INTERVAL_MS = 8000;

/**
 * 语义化埋点事件名（全局唯一标识，上报为 body.type）。
 * 服务端只做字符串透传与脱敏，不校验枚举；新增事件在这里登记即可。
 */
export const EVENT = Object.freeze({
  SHARE_CLICK: "share_click",       // 点击任一分享入口（meta.type: image | link | qr）
  SHARE_GENERATED: "share_generated", // 成功生成分享图片/二维码（meta.type: image | qr）
  THEME_TOGGLE: "theme_toggle",     // 切换明暗主题
});

// 埋点仅在线上生效：本地开发 / E2E 的静态服务器没有 /api/track 路由，
// 上报会产生 501 控制台噪音（与 pwa.js 的 isLocalHost 策略一致）。
function isLocalHost() {
  if (typeof location === "undefined") return true;
  return ["localhost", "127.0.0.1"].includes(location.hostname);
}

let pending = [];
let lastFlush = 0;
let flushTimer = null;
let enabled = true;

function summarizeUserAgent() {
  if (typeof navigator === "undefined") return undefined;
  const ua = navigator.userAgent || "";
  const match = /(?:Edg|Edge|OPR|Opera|Firefox|Chrome|Safari)\/[\d.]+/.exec(ua);
  if (match) return match[0];
  return ua.slice(0, 80) || undefined;
}

async function flush() {
  if (pending.length === 0) return;
  const batch = pending.splice(0, MAX_PENDING);
  try {
    await Promise.all(batch.map((body) =>
      fetch("/api/track", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body,
      }).catch(() => null),
    ));
  } catch {
    // 网络失败静默忽略，不阻塞主流程
  }
}

function scheduleFlush() {
  if (flushTimer !== null) return;
  const elapsed = Date.now() - lastFlush;
  const delay = elapsed >= FLUSH_INTERVAL_MS ? 0 : FLUSH_INTERVAL_MS - elapsed;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    lastFlush = Date.now();
    void flush();
  }, delay);
}

/**
 * 上报一条埋点事件（节流批量，失败静默）。
 *
 * 类型校验容错（异常输入不抛错、不进队列）：
 *   - type 允许 string / number / boolean，统一 String() 归一化；
 *     null / undefined / object / function 等非法类型直接丢弃。
 *   - meta 仅接受可 JSON 序列化的普通对象（非数组）；
 *     含 BigInt、循环引用、函数的 meta 由 JSON.stringify 抛错后整体丢弃。
 *
 * meta 字段白名单约定（服务端会保留哪些字段）：
 *   服务端 /api/track 将 meta 原样序列化为 JSON 文本保存（上限 4096 字符），
 *   只对疑似密钥做正则脱敏，因此前端只应发送以下非 PII 字段：
 *     - type: "image" | "link" | "qr" 等短枚举值（由 EVENT 配套定义）
 *     - 数量/布尔聚合字段，如 success: true、count: 3
 *     - 语言、UA 摘要等非个人标识字段
 *   禁止放入：邮箱、手机号、坐标、行程正文、用户输入原文等 PII。
 *
 * @param {string|number|boolean} type 事件类型，最长 64 字符
 * @param {object} [meta] 附加结构化数据（普通对象）
 */
export function track(type, meta) {
  if (!enabled) return;
  if (typeof window === "undefined") return;

  // 容错归一化：数字/布尔转字符串，其余非法类型丢弃
  const typeText = (typeof type === "string" || typeof type === "number" || typeof type === "boolean")
    ? String(type).trim()
    : "";
  if (typeText === "") return;

  const safeMeta = meta !== null && typeof meta === "object" && !Array.isArray(meta) ? meta : undefined;

  let body;
  try {
    body = JSON.stringify({
      type: typeText.slice(0, 64),
      meta: safeMeta,
    });
  } catch {
    return; // 不可序列化的 meta 直接丢弃
  }

  pending.push(body);
  if (pending.length > MAX_PENDING) pending.splice(0, pending.length - MAX_PENDING);
  scheduleFlush();
}

/**
 * 初始化埋点：上报一次 page_view（含 referrer、语言、UA 摘要），
 * 并在页面隐藏前尽力冲刷待上报队列。
 */
export function initAnalytics() {
  if (typeof window === "undefined") return;
  if (isLocalHost()) {
    enabled = false;
    return;
  }
  track("page_view", {
    referrer: document.referrer || undefined,
    language: navigator.language || undefined,
    userAgent: summarizeUserAgent(),
  });
  window.addEventListener("pagehide", () => { void flush(); });
}
