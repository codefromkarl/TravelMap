/**
 * 行程方案对比模块
 *
 * 基于同一需求生成第二版行程（方案 B），与当前方案（方案 A）对比：
 * - 一键再生成：prompt 要求风格/节奏/预算侧重与 A 明显不同，并在结尾输出对比表
 * - 对比条：A/B 两版统计卡片（复用 computeTripStats），点击切换地图与统计条
 * - 全程复用现有渲染链路：renderTripOnMap / renderTripStats / agent 事件流
 *
 * 入口: initPlanCompare()（在 chat-init 初始化末尾调用，确保 agent 订阅顺序
 * 排在 chat-init 之后，agent_end 时能读到已更新的 _lastTripPlan）。
 */

import { agent, currentLang, showToast } from '../infra/context.js';
import { renderTripStats, computeTripStats } from '../trip/trip-stats.js';
import { I18N } from '../i18n.js';

const BAR_ID = 'plan-compare-bar';

// ─── 内部状态 ────────────────────────────────────────────

let _state = {
  active: false,
  generating: false,
  planA: null,
  planB: null,
  activeSide: 'A',
};

function dictionary() {
  return I18N[currentLang] || I18N.zh;
}

// ─── 工具函数 ────────────────────────────────────────────

function deepClone(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

/** 从会话消息中提取原始用户需求（跳过「体验示例」类消息） */
function extractOriginalPrompt() {
  const messages = agent?.state?.messages || [];
  for (const msg of messages) {
    if (msg.role !== 'user') continue;
    let text = msg.content;
    if (Array.isArray(text)) {
      text = text.map((part) => part?.text ?? '').join('');
    }
    if (typeof text === 'string' && text.trim() && !text.includes('体验示例')) {
      return text.trim().slice(0, 500);
    }
  }
  return null;
}

function buildComparePrompt(originalPrompt) {
  return `基于我最初的旅行需求（${originalPrompt}），请重新规划一份【替代方案】：

1. 与当前已生成的方案在风格/节奏/预算侧重上明显不同（例如：更紧凑高效 / 更悠闲深度 / 更低预算 / 更强美食属性）
2. 保持完整输出：每日行程、景点、住宿推荐、预算明细、天气信息
3. 最后用 Markdown 表格输出【两版方案对比】，列包含：方案、天数、景点数、总预算、行程节奏、适合人群、亮点

请直接生成完整方案，不要询问确认。`;
}

function computeStats(tripPlan) {
  const stats = computeTripStats(tripPlan);
  return {
    days: stats?.days ?? 0,
    attractions: stats?.attractions ?? 0,
    budget: stats?.budgetTotal ?? null,
  };
}

// ─── 对比条 UI ───────────────────────────────────────────

function ensureBar() {
  let bar = document.getElementById(BAR_ID);
  if (bar) return bar;

  const body = document.getElementById('map-chat-body');
  if (!body) return null;

  bar = document.createElement('div');
  bar.id = BAR_ID;
  bar.className = 'plan-compare-bar';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', dictionary().comparePlans);

  const statsBar = document.getElementById('trip-stats-bar');
  if (statsBar) {
    statsBar.after(bar);
  } else {
    body.prepend(bar);
  }
  return bar;
}

function cardHtml(side, label, hint, stats, active, generating) {
  const d = dictionary();
  const parts = [];
  if (generating) {
    parts.push(`<span class="compare-badge generating">${escapeHtml(d.compareGenerating)}</span>`);
  } else {
    if (stats.days > 0) parts.push(`🗓 <b>${stats.days}</b> ${escapeHtml(d.statsDays)}`);
    if (stats.attractions > 0) parts.push(`📍 <b>${stats.attractions}</b> ${escapeHtml(d.statsAttractions)}`);
    if (stats.budget != null) parts.push(`💰 ¥${stats.budget.toLocaleString('zh-CN')}`);
  }
  return `
    <button type="button" class="compare-card ${active ? 'active' : ''}" data-side="${side}" ${generating ? 'disabled' : ''}>
      <span class="compare-card-top">
        <span class="compare-side">${side === 'A' ? 'A' : 'B'}</span>
        <span class="compare-info">
          <span class="compare-label">${escapeHtml(label)}</span>
          <span class="compare-meta">${parts.join(' · ') || escapeHtml(d.compareGenerating)}</span>
        </span>
      </span>
      <span class="compare-hint">${escapeHtml(hint)}</span>
    </button>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderBar() {
  const bar = ensureBar();
  if (!bar) return;
  const d = dictionary();

  const aStats = _state.planA ? computeStats(_state.planA) : { days: 0, attractions: 0, budget: null };
  const bStats = _state.planB ? computeStats(_state.planB) : { days: 0, attractions: 0, budget: null };

  bar.innerHTML = `
    <div class="compare-header">
      <span class="compare-title">⚖️ ${escapeHtml(d.comparePlans)}</span>
      <button type="button" class="compare-close" title="${escapeHtml(d.compareClose)}" aria-label="${escapeHtml(d.compareClose)}">✕</button>
    </div>
    <div class="compare-cards">
      ${cardHtml('A', d.compareOriginal, d.comparePlanA, aStats, _state.activeSide === 'A', false)}
      ${cardHtml('B', d.compareAlt, d.comparePlanB, bStats, _state.activeSide === 'B', _state.generating)}
    </div>
    <div class="compare-note">${escapeHtml(d.compareHint)}</div>
  `;

  bar.querySelector('.compare-close')?.addEventListener('click', () => {
    closeCompare();
  });
  bar.querySelectorAll('.compare-card').forEach((card) => {
    card.addEventListener('click', () => {
      const side = card.dataset.side;
      switchTo(side);
    });
  });
}

// ─── 对外流程 ────────────────────────────────────────────

/** 开启对比：快照方案 A 并生成方案 B */
async function startCompare() {
  const current = window._lastTripPlan;
  if (!current) {
    showToastMsg(dictionary().compareNeedPlan, 3000, 'warning');
    return;
  }
  const originalPrompt = extractOriginalPrompt();
  if (!originalPrompt) {
    showToastMsg(dictionary().compareNeedPrompt, 3000, 'warning');
    return;
  }
  const chatPanel = window._chatPanel;
  if (!chatPanel?.agentInterface) {
    showToastMsg('聊天组件未初始化，请刷新页面', 3000, 'error');
    return;
  }

  _state = {
    active: true,
    generating: true,
    planA: deepClone(current),
    planB: null,
    activeSide: 'A',
  };
  renderBar();

  try {
    const ok = await chatPanel.agentInterface.sendMessage(buildComparePrompt(originalPrompt));
    if (!ok) {
      // 登录被拦截或发送失败 → 关闭对比面板
      closeCompare();
    }
  } catch (err) {
    console.warn('[PlanCompare] 生成替代方案失败:', err);
    closeCompare();
  }
}

/** 切换激活方案（A/B），同步地图与统计条 */
function switchTo(side) {
  const plan = side === 'A' ? _state.planA : _state.planB;
  if (!plan || side === _state.activeSide) return;

  _state.activeSide = side;
  window._lastTripPlan = deepClone(plan);

  const render = typeof window._renderTripOnMap === 'function'
    ? window._renderTripOnMap
    : window._renderTripAnimated;
  if (typeof render === 'function') {
    Promise.resolve(render(plan)).catch((err) => {
      console.warn('[PlanCompare] 切换方案渲染失败:', err);
    });
  }
  renderTripStats(plan);
  renderBar();
  showToastMsg(`${dictionary().compareSwitch} ${side === 'A' ? dictionary().comparePlanA : dictionary().comparePlanB}`, 1800, 'success');
}

/** 关闭对比条（保留当前激活方案） */
function closeCompare() {
  _state = { active: false, generating: false, planA: null, planB: null, activeSide: 'A' };
  const bar = document.getElementById(BAR_ID);
  if (bar) bar.remove();
}

// ─── 事件接入 ────────────────────────────────────────────

function showToastMsg(message, duration = 2500, type = 'info') {
  try {
    showToast(message, duration, type);
  } catch {
    /* toast 不可用时静默 */
  }
}

export function initPlanCompare() {
  const btn = document.getElementById('btn-compare-plans');
  btn?.addEventListener('click', () => {
    void startCompare();
  });

  if (agent) {
    agent.subscribe((event) => {
      // 对比生成完成：chat-init 的 agent_end 处理器先执行（先注册），
      // 此时 window._lastTripPlan 已是最新方案 B
      if (event.type === 'agent_end' && _state.active && _state.generating) {
        if (window._lastTripPlan) {
          _state.planB = deepClone(window._lastTripPlan);
          _state.activeSide = 'B';
          _state.generating = false;
          renderBar();
        }
      }
      // 新一轮普通规划开始时重置对比状态
      if (event.type === 'turn_start' && _state.active && !_state.generating) {
        closeCompare();
      }
    });
  }
}

/** 供测试使用：读取内部状态 */
export function getCompareState() {
  return { ..._state, planA: !!_state.planA, planB: !!_state.planB };
}

export { buildComparePrompt, extractOriginalPrompt };
