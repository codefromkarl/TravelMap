/**
 * onboarding.js 单元测试
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../infra/context.js', () => ({
  currentLang: 'zh',
}));

import {
  shouldShowOnboarding,
  shouldShowDemoGuide,
  showOnboarding,
  showDemoGuide,
  ONBOARDING_STORAGE_KEY,
  DEMO_GUIDE_STORAGE_KEY,
} from '../ui/onboarding.js';

describe('onboarding + demo guide', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="page-map-container"></div><div id="btn-map-routes"></div><div id="export-toolbar"></div>';
  });

  it('shows onboarding on first visit and records completion', () => {
    expect(shouldShowOnboarding()).toBe(true);
    showOnboarding();
    const overlay = document.getElementById('onboarding-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay.querySelectorAll('.onboarding-dot').length).toBe(4);
    // 完成全部步骤
    const next = overlay.querySelector('.onboarding-next');
    next.click(); next.click(); next.click(); next.click();
    expect(document.getElementById('onboarding-overlay')).toBeNull();
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe('1');
    // 二次访问不再显示
    showOnboarding();
    expect(document.getElementById('onboarding-overlay')).toBeNull();
  });

  it('does not show the demo guide before onboarding is done', () => {
    expect(shouldShowDemoGuide()).toBe(false);
    showDemoGuide();
    expect(document.getElementById('onboarding-overlay')).toBeNull();
  });

  it('shows the 3-step demo guide after onboarding, once only', () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    expect(shouldShowDemoGuide()).toBe(true);

    showDemoGuide();
    const overlay = document.getElementById('onboarding-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay.querySelectorAll('.onboarding-dot').length).toBe(3);
    expect(overlay.textContent).toContain('地图标记');

    // 跳过 → 记录完成
    overlay.querySelector('.onboarding-skip').click();
    expect(document.getElementById('onboarding-overlay')).toBeNull();
    expect(localStorage.getItem(DEMO_GUIDE_STORAGE_KEY)).toBe('1');

    // 只显示一次
    showDemoGuide();
    expect(document.getElementById('onboarding-overlay')).toBeNull();
  });

  it('demo guide escape key closes and records completion', () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    showDemoGuide();
    const overlay = document.getElementById('onboarding-overlay');
    overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.getElementById('onboarding-overlay')).toBeNull();
    expect(localStorage.getItem(DEMO_GUIDE_STORAGE_KEY)).toBe('1');
  });
});
