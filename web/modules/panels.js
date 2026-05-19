import { activePanel, setActivePanel } from './context.js';

// ─── 面板互斥管理 ──────────────────────────────────────
export const overlay = document.getElementById("overlay");

export function openPanel(panelId) {
  if (activePanel === panelId) {
    closePanel(panelId);
    return;
  }
  if (activePanel) {
    closePanel(activePanel);
  }
  const panel = document.getElementById(panelId);
  if (panel) {
    panel.classList.add("open");
    setActivePanel(panelId);
    overlay?.classList.add("visible");
    trapFocus(panel);
  }
  // 特殊处理：打开历史面板时渲染历史
  if (panelId === "history-panel" && typeof window._renderHistory === 'function') {
    window._renderHistory();
  }
}

export function closePanel(panelId) {
  const panel = document.getElementById(panelId);
  if (panel) {
    panel.classList.remove("open");
  }
  if (activePanel === panelId) {
    setActivePanel(null);
    overlay?.classList.remove("visible");
  }
}

export function closeAllPanels() {
  ["travelers-panel", "history-panel"].forEach(id => {
    document.getElementById(id)?.classList.remove("open");
  });
  setActivePanel(null);
  overlay?.classList.remove("visible");
}

// 遮罩层点击关闭
overlay?.addEventListener("click", closeAllPanels);

// ─── Focus Trap ────────────────────────────────────────
export function trapFocus(panelEl) {
  const focusable = panelEl.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  first.focus();
  panelEl.addEventListener('keydown', function handler(e) {
    if (e.key !== 'Tab') return;
    if (!panelEl.classList.contains('open')) {
      panelEl.removeEventListener('keydown', handler);
      return;
    }
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
}

// Esc 键关闭面板
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && activePanel) {
    closeAllPanels();
  }
});