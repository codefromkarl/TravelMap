/**
 * 新手引导模块
 *
 * 首次访问时显示 4 步引导：
 * 1. 输入旅行需求
 * 2. 查看生成行程
 * 3. 地图联动预览
 * 4. 分享导出
 */

const STORAGE_KEY = 'travel-agent-onboarding-done';

/**
 * 检查是否需要显示引导
 */
export function shouldShowOnboarding() {
  // 已完成引导则不显示
  if (localStorage.getItem(STORAGE_KEY)) return false;
  // 有历史行程则不显示（非首次用户）
  return true;
}

/**
 * 显示新手引导弹窗
 */
export function showOnboarding() {
  if (!shouldShowOnboarding()) return;

  const steps = [
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

  let currentStep = 0;

  // 创建弹窗 DOM
  const overlay = document.createElement('div');
  overlay.id = 'onboarding-overlay';
  overlay.innerHTML = `
    <div class="onboarding-card">
      <div class="onboarding-header">
        <span class="onboarding-step-indicator"></span>
        <button class="onboarding-skip">跳过</button>
      </div>
      <div class="onboarding-icon"></div>
      <div class="onboarding-title"></div>
      <div class="onboarding-desc"></div>
      <div class="onboarding-footer">
        <div class="onboarding-dots"></div>
        <div class="onboarding-actions">
          <button class="onboarding-prev" style="display:none">上一步</button>
          <button class="onboarding-next">下一步</button>
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
    nextBtn.textContent = currentStep === steps.length - 1 ? '开始使用' : '下一步';

    // 高亮
    setHighlight(step.highlight);
  }

  // 关闭引导
  function close() {
    clearHighlight();
    overlay.remove();
    style.remove();
    localStorage.setItem(STORAGE_KEY, '1');
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

  // 初始化
  updateStep();
}
