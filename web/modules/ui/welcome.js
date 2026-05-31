import { agent } from '../infra/context.js';
import { showToast } from '../infra/context.js';

// ─── 欢迎状态 + 快捷提示卡片 ──────────────────────────
export function initWelcome() {
  const welcomeEl = document.getElementById("map-chat-welcome");
  if (!welcomeEl) return;

  // 处理快捷提示卡片
  welcomeEl.querySelectorAll(".quick-prompt[data-prompt]").forEach(card => {
    card.addEventListener("click", () => {
      const prompt = card.dataset.prompt;
      if (!prompt) return;
      sendPrompt(prompt);
      _hideWelcome(welcomeEl);
    });
  });

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

// ─── 发送 prompt 辅助函数 ──────────────────────────────────
function sendPrompt(prompt) {
  if (!agent) {
    console.error('[Welcome] Agent 未初始化');
    return;
  }
  agent.run(prompt).catch(err => {
    console.error('[Welcome] 发送失败:', err);
    showToast('发送失败，请重试', 3000, 'error');
  });
}
