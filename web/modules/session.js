/**
 * Session Lifecycle 模块
 *
 * 把"恢复/保存/迁移"从散落逻辑中收敛到一个模块。
 *
 * 接口：
 *   session.restore()    → 恢复一切（tripPlan + messages + 坐标迁移 + UI 状态）
 *   session.startFresh() → 清空状态，开始新对话
 */

import { agent, currentTripId, setCurrentTripId, currentLang } from './context.js?v=7';
import { feedback, showToast } from './feedback.js?v=7';
import { listTrips } from './db.js?v=7';
import { appState } from './app-state.js?v=7';

// ─── 坐标完整性检查 ────────────────────────────────────
function countMissingLocations(tripPlan) {
  if (!tripPlan?.days) return 0;
  let missing = 0;
  for (const day of tripPlan.days) {
    for (const attr of day.attractions || []) {
      const loc = attr.location;
      if (!loc || !loc.latitude || !loc.longitude || (loc.latitude === 0 && loc.longitude === 0)) {
        missing++;
      }
    }
  }
  return missing;
}

// ─── 坐标系检查 ──────────────────────────────────────
// 现在统一使用 GCJ-02 坐标系，无需转换
async function migrateCoordinates(tripPlan) {
  if (!tripPlan || (tripPlan.coordVersion && tripPlan.coordVersion >= 3)) return 0;

  // 标记为已迁移（GCJ-02 坐标系）
  tripPlan.coordVersion = 3;
  return 0;
}

// ─── 恢复对话历史 ──────────────────────────────────────
function restoreMessages(messages) {
  if (!messages || !Array.isArray(messages) || messages.length === 0) return;

  agent.state.messages = messages.map(m => ({
    role: m.role,
    // assistant 消息 content 必须是数组格式（pi-agent-core 要求）
    content: m.role === "assistant" && typeof m.content === "string"
      ? [{ type: "text", text: m.content }]
      : m.content,
    timestamp: m.timestamp,
  }));

  // 直接更新 message-list 的 messages 属性（绕过 Lit 绑定问题）
  setTimeout(() => {
    const ai = document.querySelector('agent-interface');
    const ml = ai?.querySelector('message-list');
    if (ml && ai?.session) {
      ml.messages = [...ai.session.state.messages];
      ml.requestUpdate();
    }
  }, 100);
}

// ─── 恢复 UI 状态 ──────────────────────────────────────
function restoreUIState(tripPlan, markdown) {
  // 隐藏欢迎页
  document.getElementById("welcome")?.classList.add("hidden");
  const welcomeEl = document.getElementById('map-chat-welcome');
  if (welcomeEl) welcomeEl.style.display = 'none';

  // 显示导出工具栏
  if (tripPlan || markdown) {
    document.getElementById("export-toolbar")?.classList.add("visible");
    ["btn-export-md", "btn-export-pdf", "btn-share-image", "btn-share-link-new", "btn-share-qr", "btn-map", "btn-tts", "btn-poster", "btn-voice-companion"].forEach(id => {
      document.getElementById(id)?.classList.remove("disabled-ghost");
    });
  }
}

// ─── 渲染地图 ──────────────────────────────────────────
function renderMap(tripPlan) {
  if (!tripPlan) return;

  const missingCount = countMissingLocations(tripPlan);
  if (missingCount > 0) {
    console.warn(`[Session] 行程有 ${missingCount} 个景点缺少坐标，正在自动补全...`);
    feedback.info(`正在补全 ${missingCount} 个景点坐标...`, 2000);
  }

  if (typeof window._renderTripAnimated === "function") {
    window._renderTripAnimated(tripPlan);
  } else if (typeof window._initPageMap === "function") {
    window._initPageMap();
  }
}

// ─── 时间格式化 ──────────────────────────────────────
function _formatTimeAgo(ms, lang) {
  const min = Math.floor(ms / 60000);
  if (min < 1) return lang === 'zh' ? '刚刚' : lang === 'ja' ? 'たった今' : 'just now';
  if (min < 60) return lang === 'zh' ? `${min}分钟前` : lang === 'ja' ? `${min}分前` : `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return lang === 'zh' ? `${hr}小时前` : lang === 'ja' ? `${hr}時間前` : `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return lang === 'zh' ? `${day}天前` : lang === 'ja' ? `${day}日前` : `${day}d ago`;
}

// ─── 恢复确认提示 ──────────────────────────────────────
function _showRestorePrompt(msg, trip, lang, resolve) {
  // 创建提示条
  const bar = document.createElement('div');
  bar.id = 'session-restore-prompt';
  bar.style.cssText = `
    position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
    background: var(--color-bg-elevated, #1e1e2e); color: var(--color-text-primary);
    padding: 12px 20px; border-radius: 10px; font-size: 14px; z-index: 1100;
    box-shadow: 0 4px 24px rgba(0,0,0,0.25); display: flex; align-items: center; gap: 12px;
    max-width: 90vw; animation: feedbackFadeIn 0.2s ease-out;
  `;
  const label = document.createElement('span');
  label.textContent = msg;
  label.style.flex = '1';

  const btnRestore = document.createElement('button');
  btnRestore.textContent = lang === 'zh' ? '恢复' : lang === 'ja' ? '復元' : 'Restore';
  btnRestore.style.cssText = 'padding:4px 14px;border-radius:6px;border:none;background:var(--color-accent-primary,#4f8ef7);color:#fff;font-size:13px;cursor:pointer;white-space:nowrap';

  const btnDismiss = document.createElement('button');
  btnDismiss.textContent = lang === 'zh' ? '不用了' : lang === 'ja' ? 'スキップ' : 'Skip';
  btnDismiss.style.cssText = 'padding:4px 10px;border-radius:6px;border:1px solid var(--color-border-default,#cbd5e1);background:transparent;color:var(--color-text-secondary,#475569);font-size:13px;cursor:pointer;white-space:nowrap';

  bar.append(label, btnRestore, btnDismiss);
  document.body.appendChild(bar);

  // 自动消失 10 秒
  const autoTimeout = setTimeout(() => { cleanup(); resolve(false); }, 10000);

  function cleanup() {
    clearTimeout(autoTimeout);
    bar.remove();
  }

  btnRestore.addEventListener('click', async () => {
    cleanup();
    await _doRestore(trip, lang);
    resolve(true);
  });

  btnDismiss.addEventListener('click', () => {
    cleanup();
    resolve(false);
  });
}

// ─── 执行恢复 ──────────────────────────────────────────
async function _doRestore(trip, lang) {
  // 恢复 tripPlan + 坐标迁移
  if (trip.tripPlan) {
    window._lastTripPlan = trip.tripPlan;
    await migrateCoordinates(trip.tripPlan);

    // 校验坐标完整性
    try {
      const { validateAndWarn } = await import('./tools/validate-trip.js?v=7');
      const result = validateAndWarn(trip.tripPlan);
      if (result.hasIssues) {
        feedback.warning(
          (lang === 'zh' ? '行程数据不完整：' : 'Trip data incomplete: ') +
          result.missingCoords.length +
          (lang === 'zh' ? ' 个景点缺少坐标，建议重新生成' : ' attractions missing coordinates'),
          5000
        );
      }
    } catch (_) { /* 校验模块加载失败不阻塞恢复 */ }
  }

  // 恢复对话历史
  restoreMessages(trip.messages);

  // 恢复当前行程 ID
  setCurrentTripId(trip.id);

  // 渲染地图
  renderMap(trip.tripPlan);

  // 恢复 UI 状态
  restoreUIState(trip.tripPlan, trip.markdown);

  appState.transition('history');
  const title = trip.title || (lang === 'zh' ? '未命名行程' : 'Untitled');
  feedback.success((lang === 'zh' ? '已恢复：' : 'Restored: ') + title, 2500);
}

// ─── Public API ────────────────────────────────────────

export const session = {
  /**
   * 恢复最近的会话（24 小时内），带确认提示
   * @returns {Promise<boolean>} 是否成功恢复
   */
  async restore() {
    try {
      const trips = await listTrips();
      if (trips.length === 0) return false;

      // URL 有 ?trip= 参数时不自动恢复
      if (new URLSearchParams(window.location.search).get("trip")) return false;

      const latest = trips[0];
      const timeDiff = Date.now() - new Date(latest.updatedAt).getTime();
      // 只恢复 24 小时内的行程
      if (timeDiff >= 24 * 60 * 60 * 1000) return false;

      // ── 确认提示：让用户选择是否恢复 ──
      const lang = currentLang || 'zh';
      const title = latest.title || (lang === 'zh' ? '未命名行程' : 'Untitled Trip');
      const timeAgo = _formatTimeAgo(timeDiff, lang);
      const confirmMsg = {
        zh: `发现上次行程「${title}」(${timeAgo})，是否恢复？`,
        en: `Found previous trip "${title}" (${timeAgo}). Restore?`,
        ja: `前回の旅行「${title}」(${timeAgo})が見つかりました。復元しますか？`,
      }[lang] || `Found previous trip "${title}". Restore?`;

      // 使用 toast + 按钮方式，不阻塞页面
      return new Promise((resolve) => {
        _showRestorePrompt(confirmMsg, latest, lang, resolve);
      });
    } catch (err) {
      console.error("[Session] 恢复失败:", err);
      return false;
    }
  },

  /**
   * 开始新对话（清空状态）
   */
  startFresh() {
    agent.state.messages = [];
    setCurrentTripId(null);
    window._lastTripPlan = null;

    // 显示欢迎页
    const welcomeEl = document.getElementById('map-chat-welcome');
    if (welcomeEl) welcomeEl.style.display = '';

    // 隐藏导出工具栏
    document.getElementById("export-toolbar")?.classList.remove("visible");
  },
};

/**
 * 向后兼容的 tryRestoreSession
 */
export async function tryRestoreSession() {
  return session.restore();
}
