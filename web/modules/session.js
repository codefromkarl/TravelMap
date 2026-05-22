/**
 * Session Lifecycle 模块
 *
 * 把"恢复/保存/迁移"从散落逻辑中收敛到一个模块。
 *
 * 接口：
 *   session.restore()    → 恢复一切（tripPlan + messages + 坐标迁移 + UI 状态）
 *   session.startFresh() → 清空状态，开始新对话
 */

import { agent, currentTripId, setCurrentTripId } from './context.js?v=4';
import { feedback } from './feedback.js?v=4';
import { listTrips } from './db.js?v=4';
import { appState } from './app-state.js?v=4';

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

// ─── Public API ────────────────────────────────────────

export const session = {
  /**
   * 恢复最近的会话（24 小时内）
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

      // 恢复 tripPlan + 坐标迁移
      if (latest.tripPlan) {
        window._lastTripPlan = latest.tripPlan;
        await migrateCoordinates(latest.tripPlan);

        // 校验坐标完整性
        try {
          const { validateAndWarn } = await import('./tools/validate-trip.js?v=4');
          const result = validateAndWarn(latest.tripPlan);
          if (result.hasIssues) {
            feedback.warning('行程数据不完整：' + result.missingCoords.length + ' 个景点缺少坐标，建议重新生成', 5000);
          }
        } catch (_) { /* 校验模块加载失败不阻塞恢复 */ }
      }

      // 恢复对话历史
      restoreMessages(latest.messages);

      // 恢复当前行程 ID
      setCurrentTripId(latest.id);

      // 渲染地图
      renderMap(latest.tripPlan);

      // 恢复 UI 状态
      restoreUIState(latest.tripPlan, latest.markdown);

      appState.transition('history');
      feedback.success(`已恢复：${latest.title}`, 2500);
      return true;
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
