import { agent } from '../infra/context.js';

// ─── 欢迎状态 + 快捷提示卡片 ──────────────────────────
export function initWelcome() {
  const welcomeEl = document.getElementById("map-chat-welcome");
  if (!welcomeEl) return;

  // 当 Agent 开始工作时隐藏欢迎页
  if (agent) {
    agent.subscribe((event) => {
      if (event.type === "user_message" || event.type === "turn_start") {
        _hideWelcome(welcomeEl);
      }
    });
  }
}

// ─── 隐藏欢迎页 ────────────────────────────────────────
function _hideWelcome(welcomeEl) {
  if (welcomeEl) welcomeEl.style.display = 'none';
}
