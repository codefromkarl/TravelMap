import { activePanel, setActivePanel } from './context.js?v=6';

// ─── 移动端视图切换（对话/地图） ─────────────────────
const pageMap = document.getElementById('page-map');
const toggleChat = document.getElementById('mobile-view-toggle-chat');
const toggleMap = document.getElementById('mobile-view-toggle');

function isMobile() { return window.innerWidth <= 768; }

document.getElementById('btn-mobile-map')?.addEventListener('click', () => {
  if (!pageMap) return;
  pageMap.classList.add('mobile-map-focused');
  pageMap.classList.remove('mobile-chat-focused');
  if (toggleChat) toggleChat.style.display = 'flex';
  if (toggleMap) toggleMap.style.display = 'none';
  // 触发地图 invalidateSize
  window.dispatchEvent(new Event('resize'));
});

document.getElementById('btn-mobile-chat')?.addEventListener('click', () => {
  if (!pageMap) return;
  pageMap.classList.remove('mobile-map-focused');
  pageMap.classList.add('mobile-chat-focused');
  if (toggleChat) toggleChat.style.display = 'none';
  if (toggleMap) toggleMap.style.display = 'flex';
});

// 窗口大小变化时重置移动端状态
window.addEventListener('resize', () => {
  if (!isMobile() && pageMap) {
    pageMap.classList.remove('mobile-map-focused', 'mobile-chat-focused');
    if (toggleChat) toggleChat.style.display = 'none';
    if (toggleMap) toggleMap.style.display = 'none';
  } else if (isMobile() && pageMap) {
    if (!pageMap.classList.contains('mobile-map-focused')) {
      pageMap.classList.add('mobile-chat-focused');
      if (toggleMap) toggleMap.style.display = 'flex';
    }
  }
});

// 初始化：移动端默认显示对话
if (isMobile() && pageMap) {
  pageMap.classList.add('mobile-chat-focused');
  if (toggleMap) toggleMap.style.display = 'flex';
}

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
export function trapFocus(panelEl, openCheck) {
  const focusable = panelEl.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  first.focus();
  panelEl.addEventListener('keydown', function handler(e) {
    if (e.key !== 'Tab') return;
    // openCheck 是一个函数返回 boolean，或默认检查 .open 类
    const isOpen = openCheck ? openCheck() : panelEl.classList.contains('open');
    if (!isOpen) {
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

// ─── 登录弹窗 Focus Trap ─────────────────────────────
const authOverlay = document.getElementById('auth-overlay');
if (authOverlay) {
  const authCard = authOverlay.querySelector('.auth-card');
  const observer = new MutationObserver(() => {
    if (authOverlay.classList.contains('visible') && authCard) {
      trapFocus(authCard, () => authOverlay.classList.contains('visible'));
    }
  });
  observer.observe(authOverlay, { attributes: true, attributeFilter: ['class'] });
}

// Esc 键关闭面板
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && activePanel) {
    closeAllPanels();
  }
});