/**
 * plan-compare.js 单元测试
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  showToast: vi.fn(),
  renderTripStats: vi.fn(),
  subscribeCb: null,
  agent: {
    state: { messages: [] },
    subscribe: (cb) => { mocks.subscribeCb = cb; },
  },
}));

vi.mock('../infra/context.js', () => ({
  agent: mocks.agent,
  currentLang: 'zh',
  showToast: mocks.showToast,
}));
vi.mock('../trip/trip-stats.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    renderTripStats: mocks.renderTripStats,
  };
});

import { initPlanCompare, getCompareState, extractOriginalPrompt, buildComparePrompt } from '../trip/plan-compare.js';

const planA = {
  city: '杭州',
  days: [{ city: '杭州', attractions: [{ name: '西湖' }, { name: '断桥' }] }],
  budget: { total: 1550 },
};

const planB = {
  city: '杭州',
  days: [{ city: '杭州', attractions: [{ name: '西湖' }, { name: '雷峰塔' }, { name: '灵隐寺' }] }],
  budget: { total: 980 },
};

describe('plan-compare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.subscribeCb = null;
    mocks.agent.state.messages = [{ role: 'user', content: '杭州亲子3日游' }];
    document.body.innerHTML = `
      <div id="map-chat-body">
        <div id="trip-stats-bar" hidden></div>
      </div>
      <button id="btn-compare-plans"></button>
    `;
    window._chatPanel = { agentInterface: { sendMessage: vi.fn(async () => true) } };
    window._lastTripPlan = structuredClone(planA);
    window._renderTripOnMap = vi.fn(async () => {});
  });

  it('extracts the first real user prompt, skipping demo messages', () => {
    mocks.agent.state.messages = [
      { role: 'assistant', content: 'hi' },
      { role: 'user', content: '体验示例：杭州三日经典游' },
      { role: 'user', content: [{ type: 'text', text: '西湖两日游' }] },
    ];
    expect(extractOriginalPrompt()).toBe('西湖两日游');
  });

  it('builds a compare prompt with the original request and comparison table', () => {
    const prompt = buildComparePrompt('杭州亲子3日游');
    expect(prompt).toContain('杭州亲子3日游');
    expect(prompt).toContain('替代方案');
    expect(prompt).toContain('两版方案对比');
  });

  it('clicking compare with no trip shows a warning', async () => {
    window._lastTripPlan = null;
    initPlanCompare();
    document.getElementById('btn-compare-plans').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.showToast).toHaveBeenCalledWith(expect.stringContaining('方案'), expect.any(Number), 'warning');
    expect(document.getElementById('plan-compare-bar')).toBeNull();
  });

  it('starts generation: panel appears with A active and B generating', async () => {
    initPlanCompare();
    document.getElementById('btn-compare-plans').click();
    await new Promise((r) => setTimeout(r, 0));

    const bar = document.getElementById('plan-compare-bar');
    expect(bar).not.toBeNull();
    const cards = bar.querySelectorAll('.compare-card');
    expect(cards.length).toBe(2);
    expect(cards[0].classList.contains('active')).toBe(true);
    expect(cards[1].disabled).toBe(true);
    expect(bar.textContent).toContain('生成中');
    expect(window._chatPanel.agentInterface.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('替代方案'),
    );
    expect(getCompareState().generating).toBe(true);
    expect(getCompareState().planA).toBe(true);
  });

  it('captures plan B on agent_end and allows switching back to A', async () => {
    initPlanCompare();
    document.getElementById('btn-compare-plans').click();
    await new Promise((r) => setTimeout(r, 0));

    // 模拟方案 B 生成完成：chat-init 先更新 _lastTripPlan，随后派发 agent_end
    window._lastTripPlan = structuredClone(planB);
    mocks.subscribeCb({ type: 'agent_end' });

    const state = getCompareState();
    expect(state.generating).toBe(false);
    expect(state.planB).toBe(true);
    expect(state.activeSide).toBe('B');

    // 切回方案 A：地图渲染 + 统计条 + _lastTripPlan 同步
    document.querySelector('.compare-card[data-side="A"]').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(window._renderTripOnMap).toHaveBeenCalledWith(expect.objectContaining({ city: '杭州' }));
    expect(mocks.renderTripStats).toHaveBeenCalled();
    expect(window._lastTripPlan.budget.total).toBe(1550);
    expect(getCompareState().activeSide).toBe('A');
  });

  it('close button removes the panel and resets state', () => {
    initPlanCompare();
    document.getElementById('btn-compare-plans').click();
    document.querySelector('.compare-close').click();
    expect(document.getElementById('plan-compare-bar')).toBeNull();
    expect(getCompareState().active).toBe(false);
  });

  it('new turn_start while compare is idle resets the panel', () => {
    initPlanCompare();
    document.getElementById('btn-compare-plans').click();
    window._lastTripPlan = structuredClone(planB);
    mocks.subscribeCb({ type: 'agent_end' });
    mocks.subscribeCb({ type: 'turn_start' });
    expect(document.getElementById('plan-compare-bar')).toBeNull();
    expect(getCompareState().active).toBe(false);
  });
});
