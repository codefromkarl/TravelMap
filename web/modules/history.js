import { agent, currentTripId, setCurrentTripId, showToast } from './context.js';
import { listTrips, loadTripById, deleteTripById } from './db.js';

// ─── 历史面板 ──────────────────────────────────────────
export const historyList = document.getElementById("history-list");

export async function renderHistory() {
  try {
    const trips = await listTrips();
    if (trips.length === 0) {
      historyList.innerHTML = '<div id="history-empty">暂无历史行程</div>';
      return;
    }
    historyList.innerHTML = trips.map(trip => {
      const date = new Date(trip.updatedAt).toLocaleDateString("zh-CN");
      return `<div class="history-item" data-id="${trip.id}">
        <div class="item-title">${trip.title}</div>
        <div class="item-date">${date}</div>
        <div class="item-summary">${trip.summary}</div>
        <div class="item-actions">
          <button class="restore-btn" data-id="${trip.id}">恢复</button>
          <button class="delete-btn" data-id="${trip.id}">删除</button>
        </div>
      </div>`;
    }).join("");

    historyList.querySelectorAll(".restore-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const trip = await loadTripById(id);
        if (trip?.messages && Array.isArray(trip.messages)) {
          agent.state.messages = [...trip.messages];
          setCurrentTripId(id);
          showToast("已恢复行程", 2500, 'success');
          document.getElementById("history-panel")?.classList.remove("open");
        } else {
          showToast("无法恢复", 2500, 'error');
        }
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
document.getElementById("btn-history")?.addEventListener("click", () => {
  const { activePanel, openPanel, closePanel } = window._panels || {};
  if (activePanel === "history-panel") {
    closePanel?.("history-panel");
  } else {
    openPanel?.("history-panel");
  }
});

document.getElementById("btn-close-history")?.addEventListener("click", () => {
  const { closePanel } = window._panels || {};
  closePanel?.("history-panel");
});