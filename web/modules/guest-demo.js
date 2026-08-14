import {
  agent,
  currentLang,
  setCurrentTripId,
  setLastTripContent,
  showToast,
} from './infra/context.js';
import { I18N } from './i18n.js';
import { saveTripPlan } from './db.js';
import { getPresetTrip, getPresetTripList } from './data/preset-trips.js';
import { appState } from './app-state.js';

const RESULT_ACTION_IDS = [
  'btn-export-md', 'btn-export-pdf', 'btn-share-image', 'btn-share-link-new',
  'btn-share-qr', 'btn-map', 'btn-tts', 'btn-poster', 'btn-voice-companion',
];

function dictionary() {
  return I18N[currentLang] || I18N.zh;
}

export function buildPresetMarkdown(preset) {
  const plan = preset.tripPlan;
  const daySections = plan.days.map((day, index) => {
    const attractions = (day.attractions || [])
      .map(item => `- **${item.nameZh || item.name}**：${item.description || item.address || ''}`)
      .join('\n');
    const meals = (day.meals || []).map(item => item.name).filter(Boolean).join('、');
    return `## 第 ${index + 1} 天 · ${day.description || day.city}\n\n${attractions}${meals ? `\n\n餐饮参考：${meals}` : ''}`;
  }).join('\n\n');
  return `# ${preset.icon} ${preset.title}\n\n> ⚠️ 演示行程：日期、天气、价格和预约信息均为预设数据，并非实时旅行建议。\n\n${preset.description}\n\n${daySections}\n\n## 预算参考\n\n预计合计：¥${plan.budget?.total ?? '—'}\n\n${plan.overallSuggestions || ''}`;
}

function syncMessages() {
  setTimeout(() => {
    const ai = document.querySelector('agent-interface');
    const messageList = ai?.querySelector('message-list');
    if (messageList && ai?.session) {
      messageList.messages = ai.session.state.messages.map(message => ({
        ...message,
        content: message.role === 'assistant' && typeof message.content === 'string'
          ? [{ type: 'text', text: message.content }]
          : message.content,
      }));
      messageList.requestUpdate();
    }
  }, 0);
}

function enableResultActions() {
  document.getElementById('export-toolbar')?.classList.add('visible');
  for (const id of RESULT_ACTION_IDS) {
    document.getElementById(id)?.classList.remove('disabled-ghost');
  }
}

export async function loadPresetTrip(key) {
  const preset = getPresetTrip(key);
  if (!preset || !agent) return false;

  const tripPlan = typeof structuredClone === 'function'
    ? structuredClone(preset.tripPlan)
    : JSON.parse(JSON.stringify(preset.tripPlan));
  const markdown = buildPresetMarkdown({ ...preset, tripPlan });
  const timestamp = Date.now();
  const messages = [
    { role: 'user', content: `体验示例：${preset.title}`, timestamp },
    { role: 'assistant', content: markdown, timestamp: timestamp + 1 },
  ];

  agent.state.messages = messages;
  window._lastTripPlan = tripPlan;
  setCurrentTripId(preset.id);
  setLastTripContent(markdown);
  document.getElementById('map-chat-welcome')?.style.setProperty('display', 'none');
  enableResultActions();
  syncMessages();
  appState.transition('result');

  let renderPromise = Promise.resolve();
  if (typeof window._renderTripOnMap === 'function') {
    renderPromise = Promise.resolve(window._renderTripOnMap(tripPlan));
  } else if (typeof window._renderTripAnimated === 'function') {
    renderPromise = Promise.resolve(window._renderTripAnimated(tripPlan));
  } else if (typeof window._initPageMap === 'function') {
    window._initPageMap();
  }
  void renderPromise.catch(error => {
    console.warn('[GuestDemo] 示例地图渲染失败', error);
  });

  try {
    await saveTripPlan({
      id: preset.id,
      title: preset.title,
      city: tripPlan.city,
      cities: tripPlan.cities || [tripPlan.city],
      startDate: tripPlan.startDate,
      endDate: tripPlan.endDate,
      days: tripPlan.days?.length || 0,
      summary: `${preset.description}（演示数据，非实时）`,
      tripPlan,
      markdown,
      messages,
      status: 'demo',
    });
  } catch (error) {
    console.warn('[GuestDemo] 示例行程未能写入本地历史', error);
  }

  showToast(dictionary().demoLoaded || `已加载示例：${preset.title}`, 2500, 'success');
  return true;
}

function closePicker() {
  document.getElementById('preset-trip-picker')?.remove();
}

export function openPresetPicker() {
  closePicker();
  const dict = dictionary();
  const overlay = document.createElement('div');
  overlay.id = 'preset-trip-picker';
  overlay.className = 'preset-modal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'preset-picker-title');
  overlay.innerHTML = `
    <div class="preset-modal-content">
      <div class="preset-modal-header">
        <span id="preset-picker-title">${dict.chooseDemo || '选择示例行程'}</span>
        <button class="preset-modal-close" type="button" aria-label="${dict.shareClose || '关闭'}">✕</button>
      </div>
      <p class="preset-demo-notice">${dict.demoNotice || '示例中的日期、天气和价格为演示数据，并非实时信息。'}</p>
      <div class="preset-trip-list"></div>
    </div>`;

  const list = overlay.querySelector('.preset-trip-list');
  for (const preset of getPresetTripList()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'preset-trip-item';
    button.innerHTML = `<span class="preset-trip-icon">${preset.icon}</span><span class="preset-trip-info"><span class="preset-trip-title">${preset.title}</span><span class="preset-trip-desc">${preset.description}</span></span><span class="preset-trip-badge">${preset.days} 天</span>`;
    button.addEventListener('click', async () => {
      button.disabled = true;
      closePicker();
      await loadPresetTrip(preset.key);
    });
    list.appendChild(button);
  }

  overlay.querySelector('.preset-modal-close')?.addEventListener('click', closePicker);
  overlay.addEventListener('click', event => {
    if (event.target === overlay) closePicker();
  });
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') closePicker();
  });
  document.body.appendChild(overlay);
  overlay.querySelector('.preset-trip-item')?.focus();
}

export function initGuestDemo() {
  const header = document.getElementById('map-chat-header');
  const toolbar = document.getElementById('export-toolbar');
  if (header && toolbar && toolbar.parentElement?.getAttribute('aria-hidden') === 'true') {
    header.insertAdjacentElement('afterend', toolbar);
  }
  const quota = document.getElementById('quota-bar');
  const headerActions = header?.lastElementChild;
  if (quota && headerActions && quota.parentElement?.getAttribute('aria-hidden') === 'true') {
    headerActions.prepend(quota);
  }
  document.getElementById('btn-guest-demo')?.addEventListener('click', openPresetPicker);
  document.getElementById('btn-guest-presets')?.addEventListener('click', openPresetPicker);
}
