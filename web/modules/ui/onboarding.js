/**
 * 引导模块（onboarding + demo guide）
 *
 * - 首次访问：4 步新手引导（onboarding）
 * - 游客加载示例后：3 步示例导览（demo guide，仅在 onboarding 完成后展示，避免叠加）
 *
 * 两者共用 runGuide() 渲染器：弹窗 + 高亮 + 步骤指示 + localStorage 去重。
 */

import { currentLang } from '../infra/context.js';
import { I18N } from '../i18n.js';

export const ONBOARDING_STORAGE_KEY = 'travel-agent-onboarding-done';
export const DEMO_GUIDE_STORAGE_KEY = 'travel-agent-demo-guide-done';

const ONBOARDING_STEPS = [
  {
    icon: '💬',
    title: '告诉我你的旅行计划',
    desc: '输入目的地、天数、预算等需求，AI 为你生成详细行程',
    highlight: '#map-chat-panel',
  },
  {
    icon: '📋',
    title: '查看智能行程',
    desc: 'AI 会生成包含景点、餐饮、住宿的完整行程方案',
    highlight: '#map-chat-body',
  },
  {
    icon: '🗺️',
    title: '地图实时预览',
    desc: '右侧地图自动展示路线、景点标记和导航信息',
    highlight: '#map-right-area',
  },
  {
    icon: '📤',
    title: '分享与导出',
    desc: '生成图片、PDF 或分享链接，一键发送给旅伴',
    highlight: '#export-toolbar',
  },
];

function dictionary() {
  return I18N[currentLang] || I18N.zh;
}

/** 示例导览步骤（文案走 i18n） */
function demoGuideSteps() {
  const d = dictionary();
  return [
    {
      icon: '📍',
      title: d.demoGuideTitle1 || '点击地图标记',
      desc: d.demoGuideDesc1 || '查看景点详情、门票与游玩时长',
      highlight: '#page-map-container',
    },
    {
      icon: '🛤️',
      title: d.demoGuideTitle2 || '试试路线与图层',
      desc: d.demoGuideDesc2 || '切换每日路线、卫星地图与定位',
      highlight: '#btn-map-routes',
    },
    {
      icon: '📤',
      title: d.demoGuideTitle3 || '导出分享行程',
      desc: d.demoGuideDesc3 || '生成海报图片、链接或二维码发送给旅伴',
      highlight: '#export-toolbar',
    },
  ];
}

/**
 * 检查是否需要显示新手引导
 */
export function shouldShowOnboarding() {
  // 已完成引导则不显示
  if (localStorage.getItem(ONBOARDING_STORAGE_KEY)) return false;
  return true;
}

/**
 * 检查是否需要显示示例导览：
 * - 已看过则不显示
 * - onboarding 未完成时不显示（避免两个引导叠加）
 */
export function shouldShowDemoGuide() {
  if (localStorage.getItem(DEMO_GUIDE_STORAGE_KEY)) return false;
  if (!localStorage.getItem(ONBOARDING_STORAGE_KEY)) return false;
  return true;
}

/**
 * 显示新手引导弹窗
 */
export function showOnboarding() {
  if (!shouldShowOnboarding()) return;
  runGuide(ONBOARDING_STEPS, { storageKey: ONBOARDING_STORAGE_KEY });
}

/**
 * 显示示例导览（游客加载示例行程后调用）
 */
export function showDemoGuide() {
  if (!shouldShowDemoGuide()) return;
  runGuide(demoGuideSteps(), { storageKey: DEMO_GUIDE_STORAGE_KEY });
}

/**
 * 通用引导渲染器：弹窗 + 高亮 + 步骤指示
 * @param {Array<{icon: string, title: string, desc: string, highlight: string}>} steps
 * @param {{storageKey: string}} opts
 * @returns {{close: () => void}|null} 返回关闭句柄（供测试使用）
 */
function runGuide(steps, { storageKey }) {
  if (localStorage.getItem(storageKey)) return null;
  if (!steps || steps.length === 0) return null;

  const d = dictionary();
  const skipText = d.guideSkip || '跳过';
  const prevText = d.guidePrev || '上一步';
  const nextText = d.guideNext || '下一步';
  const doneText = d.guideDone || '开始使用';

  let currentStep = 0;

  // 创建弹窗 DOM
  const overlay = document.createElement('div');
  overlay.id = 'onboarding-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', steps[0].title);
  overlay.innerHTML = `
    <div class="onboarding-card">
      <div class="onboarding-header">
        <span class="onboarding-step-indicator"></span>
        <button class="onboarding-skip" type="button">${skipText}</button>
      </div>
      <div class="onboarding-icon"></div>
      <div class="onboarding-title"></div>
      <div class="onboarding-desc"></div>
      <div class="onboarding-footer">
        <div class="onboarding-dots"></div>
        <div class="onboarding-actions">
          <button class="onboarding-prev" type="button" style="display:none">${prevText}</button>
          <button class="onboarding-next" type="button">${nextText}</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // 注入样式
  const style = document.createElement('style');
  style.textContent = `
    #onboarding-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.6);
      z-index: 2000;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: onboardingFadeIn 0.3s ease-out;
    }
    @keyframes onboardingFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .onboarding-card {
      background: var(--color-bg-elevated, #1e1e2e);
      border-radius: 20px;
      padding: 32px;
      width: 90%;
      max-width: 380px;
      text-align: center;
      box-shadow: 0 12px 48px rgba(0,0,0,0.4);
      animation: onboardingSlideUp 0.3s ease-out;
    }
    @keyframes onboardingSlideUp {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .onboarding-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .onboarding-step-indicator {
      font-size: 12px;
      color: var(--color-text-muted, #94a3b8);
    }
    .onboarding-skip {
      background: none;
      border: none;
      color: var(--color-text-muted, #94a3b8);
      font-size: 13px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 6px;
    }
    .onboarding-skip:hover {
      background: var(--color-bg-hover, rgba(255,255,255,0.1));
    }
    .onboarding-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }
    .onboarding-title {
      font-size: 18px;
      font-weight: 700;
      color: var(--color-text-primary, #e2e8f0);
      margin-bottom: 10px;
    }
    .onboarding-desc {
      font-size: 14px;
      color: var(--color-text-secondary, #94a3b8);
      line-height: 1.6;
      margin-bottom: 24px;
    }
    .onboarding-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .onboarding-dots {
      display: flex;
      gap: 6px;
    }
    .onboarding-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--color-border-default, #475569);
      transition: all 0.2s;
    }
    .onboarding-dot.active {
      background: var(--color-accent, #4f8ef7);
      width: 24px;
      border-radius: 4px;
    }
    .onboarding-actions {
      display: flex;
      gap: 8px;
    }
    .onboarding-prev {
      background: none;
      border: 1px solid var(--color-border-default, #475569);
      color: var(--color-text-secondary, #94a3b8);
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      cursor: pointer;
    }
    .onboarding-next {
      background: var(--color-accent, #4f8ef7);
      border: none;
      color: #fff;
      padding: 8px 20px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .onboarding-next:hover { opacity: 0.9; }
    .onboarding-highlight {
      outline: 3px solid var(--color-accent, #4f8ef7);
      outline-offset: 4px;
      border-radius: 8px;
      transition: outline-color 0.3s;
    }
  `;
  document.head.appendChild(style);

  // 获取 DOM 元素
  const iconEl = overlay.querySelector('.onboarding-icon');
  const titleEl = overlay.querySelector('.onboarding-title');
  const descEl = overlay.querySelector('.onboarding-desc');
  const dotsEl = overlay.querySelector('.onboarding-dots');
  const prevBtn = overlay.querySelector('.onboarding-prev');
  const nextBtn = overlay.querySelector('.onboarding-next');
  const skipBtn = overlay.querySelector('.onboarding-skip');
  const stepIndicator = overlay.querySelector('.onboarding-step-indicator');

  // 创建圆点
  steps.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = 'onboarding-dot' + (i === 0 ? ' active' : '');
    dotsEl.appendChild(dot);
  });

  // 高亮元素
  let highlightedEl = null;
  function clearHighlight() {
    if (highlightedEl) {
      highlightedEl.classList.remove('onboarding-highlight');
      highlightedEl = null;
    }
  }
  function setHighlight(selector) {
    clearHighlight();
    const el = document.querySelector(selector);
    if (el) {
      el.classList.add('onboarding-highlight');
      highlightedEl = el;
    }
  }

  // 更新步骤
  function updateStep() {
    const step = steps[currentStep];
    iconEl.textContent = step.icon;
    titleEl.textContent = step.title;
    descEl.textContent = step.desc;
    stepIndicator.textContent = `${currentStep + 1}/${steps.length}`;

    // 更新圆点
    dotsEl.querySelectorAll('.onboarding-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === currentStep);
    });

    // 按钮状态
    prevBtn.style.display = currentStep === 0 ? 'none' : '';
    nextBtn.textContent = currentStep === steps.length - 1 ? doneText : nextText;

    // 高亮
    setHighlight(step.highlight);
  }

  // 关闭引导
  function close() {
    clearHighlight();
    overlay.remove();
    style.remove();
    localStorage.setItem(storageKey, '1');
  }

  // 事件绑定
  nextBtn.addEventListener('click', () => {
    if (currentStep < steps.length - 1) {
      currentStep++;
      updateStep();
    } else {
      close();
    }
  });

  prevBtn.addEventListener('click', () => {
    if (currentStep > 0) {
      currentStep--;
      updateStep();
    }
  });

  skipBtn.addEventListener('click', close);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  // 初始化
  updateStep();
  return { close };
}
