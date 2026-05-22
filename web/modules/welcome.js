import { agent } from './context.js?v=7';
import { getUserLocation, buildDiscoverPrompt } from './location.js?v=7';
import { showToast } from './context.js?v=7';

// ─── 欢迎状态 + 示例卡片 ──────────────────────────────
export function initWelcome() {
  // 修复：index.html 中实际元素是 #map-chat-welcome，不是 #welcome
  const welcomeEl = document.getElementById("map-chat-welcome");
  if (!welcomeEl) return;

  // 处理普通快捷提示卡片
  welcomeEl.querySelectorAll(".quick-prompt[data-prompt]").forEach(card => {
    card.addEventListener("click", () => {
      const prompt = card.dataset.prompt;
      if (!prompt) return;
      sendPrompt(prompt);
      _hideWelcome(welcomeEl);
    });
  });

  // 处理发现模式按钮
  const discoverBtn = welcomeEl.querySelector(".quick-prompt[data-action='discover']");
  if (discoverBtn) {
    discoverBtn.addEventListener("click", () => handleDiscover(welcomeEl));
  }

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
    _hideWelcome(welcomeEl);
  } catch (err) {
    console.error('[Discover] 失败:', err);
    showToast(err.message || "定位失败，请手动输入位置", 3000, "error");
  }
}

// ─── 发送 prompt 辅助函数 ──────────────────────────────────
// 改用 Agent API 直接发送，不再依赖 DOM 模拟用户操作
function sendPrompt(prompt) {
  if (!agent) {
    console.error('[Welcome] Agent 未初始化');
    return;
  }
  // 直接调用 Agent 的 run 方法，跳过 DOM 层
  // 这避免了对 pi-bundle message-editor 内部 DOM 结构的依赖
  agent.run(prompt).catch(err => {
    console.error('[Welcome] 发送失败:', err);
    showToast('发送失败，请重试', 3000, 'error');
  });
}
