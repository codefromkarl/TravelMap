import { agent } from '../infra/context.js';
import { getUserLocation, buildDiscoverPrompt } from '../location.js';
import { showToast } from '../infra/context.js';
import { getPresetTripList, getPresetTrip } from '../data/preset-trips.js';
import { saveTripPlan } from '../infra/db.js';

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

  // 处理预设行程按钮
  const presetBtn = welcomeEl.querySelector(".quick-prompt[data-action='preset']");
  if (presetBtn) {
    presetBtn.addEventListener("click", () => handlePreset(welcomeEl));
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

// ─── 预设行程处理 ──────────────────────────────────────────

function handlePreset(welcomeEl) {
  const modal = document.getElementById('preset-trip-modal');
  const list = document.getElementById('preset-trip-list');
  if (!modal || !list) return;

  // 填充列表
  const trips = getPresetTripList();
  list.innerHTML = trips.map(t => `
    <div class="preset-trip-item" data-key="${t.key}">
      <div class="preset-trip-icon">${t.icon}</div>
      <div class="preset-trip-info">
        <div class="preset-trip-title">${t.title}</div>
        <div class="preset-trip-desc">${t.description}</div>
      </div>
      <div class="preset-trip-badge">${t.days}天${t.city}</div>
    </div>
  `).join('');

  // 绑定点击事件
  list.querySelectorAll('.preset-trip-item').forEach(item => {
    item.addEventListener('click', async () => {
      const key = item.dataset.key;
      const preset = getPresetTrip(key);
      if (!preset) return;

      modal.style.display = 'none';
      _hideWelcome(welcomeEl);

      await _loadPresetTrip(preset);
    });
  });

  // 显示弹窗
  modal.style.display = 'flex';

  // 点击背景关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });
}

async function _loadPresetTrip(preset) {
  try {
    showToast(`正在加载「${preset.title}」...`, 2000, 'info');

    // 保存到 IndexedDB
    const tripRecord = {
      id: preset.id,
      title: preset.title,
      tripPlan: preset.tripPlan,
      messages: [{
        role: 'assistant',
        content: `# ${preset.icon} ${preset.title}\n\n${preset.description}\n\n---\n\n${_formatPresetSummary(preset.tripPlan)}`,
        timestamp: Date.now(),
      }],
      status: 'active',
    };
    await saveTripPlan(tripRecord);

    // 设置全局状态
    window._lastTripPlan = preset.tripPlan;

    // 渲染地图
    if (typeof window._renderTripAnimated === 'function') {
      await window._renderTripAnimated(preset.tripPlan);
    }

    // 更新 Agent 消息列表
    if (agent && agent.state) {
      agent.state.messages = tripRecord.messages;
      // 触发 UI 更新
      const ai = document.querySelector('agent-interface');
      const ml = ai?.querySelector('message-list');
      if (ml && ai?.session) {
        ml.messages = [...ai.session.state.messages];
        ml.requestUpdate();
      }
    }

    // 显示导出工具栏
    document.getElementById('export-toolbar')?.classList.add('visible');
    ['btn-export-md', 'btn-export-pdf', 'btn-share-image', 'btn-share-link-new', 'btn-share-qr', 'btn-map', 'btn-tts', 'btn-poster', 'btn-voice-companion'].forEach(id => {
      document.getElementById(id)?.classList.remove('disabled-ghost');
    });

    showToast(`已加载「${preset.title}」`, 3000, 'success');
  } catch (err) {
    console.error('[Preset] 加载失败:', err);
    showToast('加载示例行程失败', 3000, 'error');
  }
}

function _formatPresetSummary(tripPlan) {
  const lines = [];
  lines.push(`**城市**: ${tripPlan.city}`);
  lines.push(`**日期**: ${tripPlan.startDate} ~ ${tripPlan.endDate}`);
  lines.push(`**天数**: ${tripPlan.days.length} 天`);
  if (tripPlan.budget) {
    lines.push(`**预算**: ¥${tripPlan.budget.total}`);
  }
  lines.push('');

  for (const day of tripPlan.days) {
    lines.push(`### Day ${day.dayIndex} - ${day.description}`);
    const names = day.attractions.map(a => a.nameZh || a.name).join(' → ');
    lines.push(names);
    lines.push('');
  }

  return lines.join('\n');
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
