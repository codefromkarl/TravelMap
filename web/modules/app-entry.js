/**
 * TravelMap 应用入口 — 浏览器启动逻辑
 *
 * 由 scripts/build-app-bundle.cjs 打包为 app.bundle.js（内容哈希缓存）。
 * 所有业务模块通过这里统一装载，index.html 只保留一个模块引用。
 */

// ─── 反馈弹窗 ──────────────────────────────────────
(function initFeedback() {
  const feedbackOverlay = document.getElementById('feedback-overlay');
  const btnFeedback = document.getElementById('btn-feedback');
  const btnCloseFeedback = document.getElementById('btn-close-feedback');
  const btnSubmitFeedback = document.getElementById('btn-submit-feedback');
  if (!btnFeedback || !feedbackOverlay) return;
  btnFeedback.addEventListener('click', () => { feedbackOverlay.style.display = 'flex'; });
  btnCloseFeedback?.addEventListener('click', () => { feedbackOverlay.style.display = 'none'; });
  feedbackOverlay.addEventListener('click', (e) => {
    if (e.target === feedbackOverlay) feedbackOverlay.style.display = 'none';
  });
  btnSubmitFeedback?.addEventListener('click', () => {
    const type = document.getElementById('feedback-type')?.value || 'other';
    const desc = document.getElementById('feedback-desc')?.value?.trim();
    const email = document.getElementById('feedback-email')?.value?.trim();
    if (!desc) { window.alert('请填写描述内容'); return; }
    const labels = { bug: '问题报告', feature: '功能建议', experience: '体验优化', other: '其他' };
    const subject = encodeURIComponent(`[旅图反馈] ${labels[type] || '反馈'}`);
    const body = encodeURIComponent(`类型: ${labels[type]}\n描述: ${desc}\n联系方式: ${email || '未填写'}\n\n---\nUA: ${navigator.userAgent}\nURL: ${location.href}`);
    window.open(`mailto:feedback@codefromkarl.xyz?subject=${subject}&body=${body}`);
    feedbackOverlay.style.display = 'none';
    const descEl = document.getElementById('feedback-desc');
    if (descEl) descEl.value = '';
    if (typeof showToast === 'function') showToast('感谢您的反馈！', 3000, 'success');
  });
})();

// ─── Trace 面板入口 ────────────────────────────────
import { showPanel } from './waterfall.js';
import { getCurrentTraceId } from './trace.js';
document.getElementById('trace-id-display')?.addEventListener('click', () => {
  const traceId = getCurrentTraceId();
  if (traceId) {
    navigator.clipboard?.writeText(traceId);
    showPanel(traceId);
  }
});

// ─── 主题初始化（暗黑模式）──────────────────────────
import { applyTheme, initTheme } from './infra/theme.js';
initTheme();

// ─── 前端错误上报 ──────────────────────────────────
import { initErrorReporting } from './infra/error-report.js';
initErrorReporting();

// ─── 前端轻量埋点 ──────────────────────────────────
import { initAnalytics } from './infra/analytics.js';
initAnalytics();

// ─── 自初始化模块（执行 side-effect）───────────────
import './infra/storage.js';
import './ui/panels.js';
import './auth/auth.js';
import './trip/travelers.js';
import './trip/export.js';
import './trip/history.js';
import './ui/map.js';
import './weather-chart.js';
import './infra/model-config.js';
import { initPageMap } from './ui/map.js';
import { showToast } from './infra/context.js';

// ─── 启动应用 ──────────────────────────────────────
import { initApp } from './trip/chat-init.js';
import { detectProxyMode, checkAuth } from './auth/auth.js';

// 代理模式检测 + 认证
await detectProxyMode();
await checkAuth();

// 初始化完成前保留骨架屏，避免游客入口先于交互监听器变为可点击
try {
  await initApp();
  initPageMap();
  // initPageMap installs prompt listeners inside its deferred Leaflet setup.
  // Keep the skeleton above the guest controls until that callback finishes.
  const mapReadyDeadline = Date.now() + 2000;
  while (!window._pageMapInstance && Date.now() < mapReadyDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
} catch (err) {
  console.error('[App] 初始化失败:', err);
} finally {
  document.getElementById('map-skeleton')?.remove();
}

// ─── PWA Service Worker 注册（仅生产环境）──────────
import { registerServiceWorker } from './infra/pwa.js';
registerServiceWorker();
