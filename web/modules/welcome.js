import { agent, chatPanel } from './context.js';

// ─── 欢迎状态 + 示例卡片 ──────────────────────────────
export function initWelcome() {
  const welcomeEl = document.getElementById("welcome");
  if (!welcomeEl) return;

  welcomeEl.querySelectorAll(".prompt-card").forEach(card => {
    card.addEventListener("click", () => {
      const prompt = card.dataset.prompt;
      if (!prompt) return;
      const ta = document.querySelector("message-editor textarea");
      if (ta) {
        ta.value = prompt;
        ta.dispatchEvent(new Event("input", { bubbles: true }));
        setTimeout(() => {
          const sendBtn = document.querySelector("message-editor input[type=submit]");
          if (sendBtn) {
            sendBtn.click();
          } else {
            ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
          }
        }, 100);
      }
      welcomeEl.classList.add("hidden");
    });
  });

  if (agent) {
    agent.subscribe((event) => {
      if (event.type === "user_message" || event.type === "turn_start") {
        welcomeEl.classList.add("hidden");
      }
    });
  }
}