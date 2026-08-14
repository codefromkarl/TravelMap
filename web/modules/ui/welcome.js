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

  // 「我来描述需求」→ 聚焦聊天输入框
  const composeBtn = welcomeEl.querySelector('.quick-prompt[data-action="compose"]');
  if (composeBtn) {
    composeBtn.addEventListener('click', () => {
      const editor = document.querySelector('message-editor textarea')
        || document.querySelector('#chat message-editor textarea');
      if (editor) {
        editor.focus({ preventScroll: false });
        editor.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      }
    });
  }
}

// ─── 导出：供其他模块判断欢迎页是否仍可见 ────────────────
export function isWelcomeVisible() {
  const welcomeEl = document.getElementById('map-chat-welcome');
  return !!welcomeEl && welcomeEl.style.display !== 'none';
}

// ─── 隐藏欢迎页 ────────────────────────────────────────
function _hideWelcome(welcomeEl) {
  if (welcomeEl) welcomeEl.style.display = 'none';
}
