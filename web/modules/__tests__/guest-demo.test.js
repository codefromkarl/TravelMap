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
    document.body.innerHTML = `
      <div aria-hidden="true">
        <div id="export-toolbar"><button id="btn-export-md" class="disabled-ghost"></button></div>
        <div id="quota-bar"></div>
      </div>
      <div id="map-chat-header"><h3>TravelMap</h3><div id="header-actions"></div></div>
      <div id="map-chat-welcome"></div>
      <button id="btn-guest-demo"></button>
      <button id="btn-guest-presets"></button>
      <agent-interface><message-list></message-list></agent-interface>`;
    const ai = document.querySelector('agent-interface');
    ai.session = { state: mocks.agent.state };
    ai.querySelector('message-list').requestUpdate = vi.fn();
    window._renderTripOnMap = vi.fn(async () => {});
    window._renderTripAnimated = vi.fn(async () => {});
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
});
