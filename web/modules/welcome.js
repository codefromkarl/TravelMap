import { agent, chatPanel } from './context.js?v=3';
import { getUserLocation, buildDiscoverPrompt } from './location.js';
import { showToast } from './context.js?v=3';

// ─── 欢迎状态 + 示例卡片 ──────────────────────────────
export function initWelcome() {
  const welcomeEl = document.getElementById("welcome");
  if (!welcomeEl) return;

  // 处理普通快捷提示卡片
  welcomeEl.querySelectorAll(".quick-prompt[data-prompt]").forEach(card => {
    card.addEventListener("click", () => {
      const prompt = card.dataset.prompt;
      if (!prompt) return;
      sendPrompt(prompt);
      welcomeEl.classList.add("hidden");
    });
  });

  // 处理发现模式按钮
  const discoverBtn = welcomeEl.querySelector(".quick-prompt[data-action='discover']");
  if (discoverBtn) {
    discoverBtn.addEventListener("click", () => handleDiscover(welcomeEl));
  }

  if (agent) {
    agent.subscribe((event) => {
      if (event.type === "user_message" || event.type === "turn_start") {
        welcomeEl.classList.add("hidden");
      }
    });
  }
}

// ─── 发现模式处理 ──────────────────────────────────────────

async function handleDiscover(welcomeEl) {
  try {
    showToast("正在获取您的位置...", 2000, "info");

    // 获取用户位置
    const location = await getUserLocation();

    // 构建推荐 prompt
    const prompt = buildDiscoverPrompt(location, {
      maxTravelHours: 3,
      duration: 'weekend',
    });

    // 发送消息
    sendPrompt(prompt);
    welcomeEl.classList.add("hidden");
  } catch (err) {
    console.error('[Discover] 失败:', err);
    showToast(err.message || "定位失败，请手动输入位置", 3000, "error");
  }
}

// ─── 发送 prompt 辅助函数 ──────────────────────────────────

function sendPrompt(prompt) {
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
}