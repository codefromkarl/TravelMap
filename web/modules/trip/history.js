import { agent, currentLang, currentTripId, setCurrentTripId, showToast } from '../infra/context.js';
import { listTrips, loadTripById, deleteTripById } from '../db.js';
import { I18N } from '../infra/i18n.js';

// ─── 格式化日期 ────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  if (diffHour < 24) return `${diffHour}小时前`;
  if (diffDay < 7) return `${diffDay}天前`;
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

// ─── 生成行程卡片 HTML ──────────────────────────────────
function renderTripCard(trip) {
  const dict = I18N[currentLang] || I18N.zh;
  const date = formatDate(trip.updatedAt);
  const city = trip.city || "";
  const days = trip.days || 0;
  const coverImage = trip.coverImage || "";
  const title = trip.title || "未命名行程";
  const summary = trip.summary || "";

  // 日期范围
  let dateRange = "";
  if (trip.startDate && trip.endDate) {
    const start = new Date(trip.startDate);
    const end = new Date(trip.endDate);
    dateRange = `${start.getMonth() + 1}/${start.getDate()} - ${end.getMonth() + 1}/${end.getDate()}`;
  }

  // 人群标签
  let travelerTag = "";
  if (trip.travelerProfile) {
    const t = trip.travelerProfile;
    const parts = [];
    if (t.adults > 0) parts.push(`${t.adults}大`);
    if (t.children > 0) parts.push(`${t.children}小`);
    if (t.seniors > 0) parts.push(`${t.seniors}老`);
    if (parts.length > 0) travelerTag = `👥 ${parts.join(" ")}`;
  }

  return `<div class="history-item" data-id="${trip.id}">
    ${coverImage ? `<div class="item-cover" style="background-image:url(${coverImage})"></div>` : ""}
    <div class="item-body">
      <div class="item-header">
        <div class="item-title">${title}</div>
        <div class="item-meta">
          ${city ? `<span class="item-city">📍 ${city}</span>` : ""}
          ${days > 0 ? `<span class="item-days">📅 ${days}天</span>` : ""}
          ${dateRange ? `<span class="item-dates">${dateRange}</span>` : ""}
          ${travelerTag ? `<span class="item-travelers">${travelerTag}</span>` : ""}
        </div>
      </div>
      ${summary ? `<div class="item-summary">${summary}</div>` : ""}
      <div class="item-footer">
        <span class="item-date">${date}</span>
        <div class="item-actions">
          <button class="restore-btn" data-id="${trip.id}">恢复</button>
          <button class="edit-btn" data-id="${trip.id}" title="${dict.tripEditorEditTitle}">编辑</button>
          <button class="delete-btn" data-id="${trip.id}">删除</button>
        </div>
      </div>
    </div>
  </div>`;
}

// ─── 历史面板 ──────────────────────────────────────────
export const historyList = document.getElementById("history-list");

export async function renderHistory() {
  try {
    const trips = await listTrips();
    if (trips.length === 0) {
      historyList.innerHTML = '<div id="history-empty">暂无历史行程</div>';
      return;
    }
    historyList.innerHTML = trips.map(renderTripCard).join("");

    historyList.querySelectorAll(".edit-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const { openTripEditor } = await import('./trip-editor.js');
        openTripEditor(id);
      });
    });

    historyList.querySelectorAll(".restore-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const trip = await loadTripById(id);
        if (!trip) {
          showToast("行程不存在", 2500, 'error');
          return;
        }

        // 恢复 tripPlan（结构化数据）
        if (trip.tripPlan) {
          window._lastTripPlan = trip.tripPlan;
          // 校验坐标完整性
          try {
            const { validateAndWarn } = await import('../tools/validate-trip.js');
            const result = validateAndWarn(trip.tripPlan);
            if (result.hasIssues) {
              showToast('行程数据不完整：' + result.missingCoords.length + ' 个景点缺少坐标', 5000, 'warning');
            }
          } catch (_) { /* 校验模块加载失败不阻塞恢复 */ }
          // 触发地图渲染
          if (typeof window._renderTripAnimated === "function") {
            window._renderTripAnimated(trip.tripPlan);
          } else if (typeof window._initPageMap === "function") {
            window._initPageMap();
          }
        }

        // 恢复对话历史
        if (trip.messages && Array.isArray(trip.messages) && trip.messages.length > 0) {
          agent.state.messages = trip.messages.map(m => ({
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

        setCurrentTripId(trip.id);

        // 恢复 UI 状态
        document.getElementById('map-chat-welcome')?.style.setProperty('display', 'none');
        if (trip.tripPlan || trip.markdown) {
          document.getElementById('export-toolbar')?.classList.add('visible');
          ['btn-export-md', 'btn-export-pdf', 'btn-share-image', 'btn-share-link-new', 'btn-share-qr', 'btn-map', 'btn-tts', 'btn-poster', 'btn-voice-companion'].forEach(id => {
            document.getElementById(id)?.classList.remove('disabled-ghost');
          });
        }

        showToast(`已恢复：${trip.title}`, 2500, 'success');
        document.getElementById("history-panel")?.classList.remove("open");
        document.getElementById("overlay")?.classList.remove("visible");
      });
    });

    historyList.querySelectorAll(".delete-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await deleteTripById(btn.dataset.id);
        showToast("已删除", 2500, 'success');
        renderHistory();
      });
    });
  } catch (err) {
    console.error("Render history failed:", err);
  }
}

// 供 panels.js 通过 window._renderHistory 调用
window._renderHistory = renderHistory;

// ─── 历史按钮事件 ─────────────────────────────────────
function toggleHistoryPanel() {
  const { activePanel, openPanel, closePanel } = window._panels || {};
  if (activePanel === "history-panel") {
    closePanel?.("history-panel");
  } else {
    openPanel?.("history-panel");
  }
}
document.getElementById("btn-history")?.addEventListener("click", toggleHistoryPanel);
document.getElementById("btn-history-map")?.addEventListener("click", toggleHistoryPanel);

document.getElementById("btn-close-history")?.addEventListener("click", () => {
  const { closePanel } = window._panels || {};
  closePanel?.("history-panel");
});// deploy test 2026年 05月 22日 星期五 10:51:56 CST
// FORCE REDEPLOY 1779428250
