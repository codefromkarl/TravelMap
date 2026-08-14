/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  agent: { state: { messages: [] } },
  saveTripPlan: vi.fn(async trip => trip),
  setCurrentTripId: vi.fn(),
  setLastTripContent: vi.fn(),
  showToast: vi.fn(),
  transition: vi.fn(),
}));

vi.mock('../infra/context.js', () => ({
  agent: mocks.agent,
  currentLang: 'zh',
  setCurrentTripId: mocks.setCurrentTripId,
  setLastTripContent: mocks.setLastTripContent,
  showToast: mocks.showToast,
}));
vi.mock('../db.js', () => ({ saveTripPlan: mocks.saveTripPlan }));
vi.mock('../app-state.js', () => ({ appState: { transition: mocks.transition } }));

import { buildPresetMarkdown, initGuestDemo, loadPresetTrip, openPresetPicker } from '../guest-demo.js';
import { getPresetTrip } from '../data/preset-trips.js';

describe('guest preset demo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.agent.state.messages = [];
    localStorage.clear();
    // 默认视为已看过巡游动画 → 走静态渲染路径（与大多数用户场景一致）
    localStorage.setItem('travel-agent-cinematic-seen', '1');
    document.body.innerHTML = `
      <div aria-hidden="true">
        <div id="export-toolbar"><button id="btn-export-md" class="disabled-ghost"></button></div>
        <div id="quota-bar"></div>
      </div>
      <div id="map-chat-header"><h3>TravelMap</h3><div id="header-actions"></div></div>
      <div id="map-chat-welcome"></div>
      <div id="page-map"></div>
      <button id="btn-guest-demo"></button>
      <button id="btn-guest-presets"></button>
      <agent-interface><message-list></message-list></agent-interface>`;
    const ai = document.querySelector('agent-interface');
    ai.session = { state: mocks.agent.state };
    ai.querySelector('message-list').requestUpdate = vi.fn();
    window._renderTripOnMap = vi.fn(async () => {});
    window._renderTripAnimated = vi.fn(async () => {});
    window._skipTripAnimation = vi.fn(() => {});
    global.fetch = vi.fn();
  });

  it('builds a complete, clearly labelled sample itinerary', () => {
    const markdown = buildPresetMarkdown(getPresetTrip('hangzhou'));
    expect(markdown).toContain('杭州三日经典游');
    expect(markdown).toContain('演示行程');
    expect(markdown).toContain('第 1 天');
    expect(markdown).toContain('预算参考');
  });

  it('moves result controls into the visible app and opens both preset choices', () => {
    initGuestDemo();
    expect(document.getElementById('export-toolbar').previousElementSibling.id).toBe('map-chat-header');
    expect(document.getElementById('quota-bar').parentElement.id).toBe('header-actions');

    openPresetPicker();
    expect(document.querySelectorAll('.preset-trip-item')).toHaveLength(2);
    expect(document.getElementById('preset-trip-picker').textContent).toContain('演示数据');
  });

  it('loads the production TripPlan rendering path without calling AI', async () => {
    expect(await loadPresetTrip('hangzhou')).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(global.fetch).not.toHaveBeenCalled();
    expect(window._renderTripOnMap).toHaveBeenCalledWith(expect.objectContaining({ city: '杭州' }));
    expect(window._renderTripAnimated).not.toHaveBeenCalled();
    expect(window._lastTripPlan.city).toBe('杭州');
    expect(mocks.agent.state.messages[1].content).toContain('演示行程');
    expect(document.querySelector('message-list').messages[1].content[0]).toEqual(
      expect.objectContaining({ type: 'text', text: expect.stringContaining('演示行程') }),
    );
    expect(mocks.setCurrentTripId).toHaveBeenCalledWith('preset-hangzhou-3day');
    expect(mocks.saveTripPlan).toHaveBeenCalledWith(expect.objectContaining({ status: 'demo', days: 3 }));
    expect(document.getElementById('export-toolbar').classList.contains('visible')).toBe(true);
    expect(document.getElementById('btn-export-md').classList.contains('disabled-ghost')).toBe(false);
  });

  it('uses the cinematic animated tour on first visit and shows a skip chip', async () => {
    // 清除标记 → 模拟首次体验（jsdom 无 matchMedia，视为允许动画）
    localStorage.removeItem('travel-agent-cinematic-seen');

    // 动画用可控的 pending Promise，保证跳过浮标在断言期间存活
    let resolveAnimation;
    window._renderTripAnimated = vi.fn(
      () => new Promise(resolve => { resolveAnimation = resolve; }),
    );

    expect(await loadPresetTrip('hangzhou')).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(window._renderTripAnimated).toHaveBeenCalledWith(expect.objectContaining({ city: '杭州' }));
    expect(window._renderTripOnMap).not.toHaveBeenCalled();
    expect(localStorage.getItem('travel-agent-cinematic-seen')).toBe('1');
    // 跳过浮标出现，点击后调用跳过接口并移除
    const chip = document.querySelector('.tour-skip-chip');
    expect(chip).not.toBeNull();
    chip.click();
    expect(window._skipTripAnimation).toHaveBeenCalled();
    expect(document.querySelector('.tour-skip-chip')).toBeNull();
    // 结束动画（清理兜底计时器）
    resolveAnimation();
  });

  it('falls back to static rendering when the user prefers reduced motion', async () => {
    localStorage.removeItem('travel-agent-cinematic-seen');
    const realMatchMedia = globalThis.matchMedia;
    globalThis.matchMedia = () => ({ matches: true });
    try {
      expect(await loadPresetTrip('hangzhou')).toBe(true);
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(window._renderTripOnMap).toHaveBeenCalled();
      expect(window._renderTripAnimated).not.toHaveBeenCalled();
      expect(document.querySelector('.tour-skip-chip')).toBeNull();
    } finally {
      globalThis.matchMedia = realMatchMedia;
    }
  });
});

