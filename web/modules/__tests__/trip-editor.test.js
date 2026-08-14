/**
 * trip-editor.js 单元测试
 *
 * 测试历史行程编辑器：
 * - openTripEditor 渲染天数与景点列表
 * - 景点上移 / 下移
 * - 景点跨天移动（前一天 / 后一天，含边界 disabled）
 * - 删除景点
 * - 整天上移 / 下移 / 删除（仅一天时拒绝）
 * - 保存（saveTripPlan + window._renderTripAnimated）
 * - 深拷贝（修改不影响原对象）
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock 依赖
vi.mock('../db.js', () => ({
  loadTripById: vi.fn(),
  saveTripPlan: vi.fn(),
}));

vi.mock('../infra/context.js', () => ({
  currentLang: 'zh',
  showToast: vi.fn(),
}));

vi.mock('../logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

let db;
let ctx;
let tripEditor;

function makeTrip(tripPlan) {
  return { id: 't1', title: '测试行程', tripPlan };
}

function basePlan() {
  return {
    days: [
      {
        date: '06-01',
        attractions: [
          { nameZh: '西湖', lat: 30.1, lng: 120.1 },
          { nameZh: '灵隐寺', lat: 30.2, lng: 120.2 },
        ],
      },
      {
        date: '06-02',
        attractions: [
          { nameZh: '西溪湿地', lat: 30.3, lng: 120.3 },
        ],
      },
    ],
  };
}

function btn(act, day, attr) {
  const attrSel = attr != null ? '[data-attr="' + attr + '"]' : '';
  return document.querySelector('.trip-editor-btn[data-act="' + act + '"][data-day="' + day + '"]' + attrSel);
}

function renderedDays() {
  return [...document.querySelectorAll('.trip-editor-day')].map((dayEl) => ({
    title: dayEl.querySelector('.trip-editor-day-title').textContent.trim(),
    names: [...dayEl.querySelectorAll('.trip-editor-item-name')].map((el) => el.textContent.trim()),
  }));
}

beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML = '';
  window._renderTripAnimated = undefined;
  window._lastTripPlan = undefined;

  db = await import('../db.js');
  ctx = await import('../infra/context.js');
  db.loadTripById.mockReset();
  db.saveTripPlan.mockReset();
  ctx.showToast.mockReset();

  tripEditor = await import('../trip/trip-editor.js');
});

describe('trip-editor.js', () => {
  it('openTripEditor 渲染天数与景点列表', async () => {
    const plan = basePlan();
    db.loadTripById.mockResolvedValue(makeTrip(plan));
    await tripEditor.openTripEditor('t1');

    const days = renderedDays();
    expect(days).toHaveLength(2);
    expect(days[0].names).toEqual(['西湖', '灵隐寺']);
    expect(days[1].names).toEqual(['西溪湿地']);
    expect(days[0].title).toContain('第 1 天');
    expect(days[1].title).toContain('第 2 天');
    expect(document.querySelectorAll('.trip-editor-item')).toHaveLength(3);
    expect(document.getElementById('trip-editor-overlay').classList.contains('open')).toBe(true);
  });

  it('点击上移交换相邻景点', async () => {
    db.loadTripById.mockResolvedValue(makeTrip(basePlan()));
    await tripEditor.openTripEditor('t1');

    btn('up', 0, 1).click();
    expect(renderedDays()[0].names).toEqual(['灵隐寺', '西湖']);
  });

  it('点击下移交换相邻景点', async () => {
    db.loadTripById.mockResolvedValue(makeTrip(basePlan()));
    await tripEditor.openTripEditor('t1');

    btn('down', 0, 0).click();
    expect(renderedDays()[0].names).toEqual(['灵隐寺', '西湖']);
  });

  it('移动到前一天/后一天（含边界 disabled）', async () => {
    db.loadTripById.mockResolvedValue(makeTrip(basePlan()));
    await tripEditor.openTripEditor('t1');

    expect(btn('prev-day', 0, 0).disabled).toBe(true);
    expect(btn('next-day', 1, 0).disabled).toBe(true);

    btn('prev-day', 1, 0).click();
    expect(renderedDays()[0].names).toEqual(['西湖', '灵隐寺', '西溪湿地']);
    expect(renderedDays()[1].names).toEqual([]);
  });

  it('删除景点', async () => {
    db.loadTripById.mockResolvedValue(makeTrip(basePlan()));
    await tripEditor.openTripEditor('t1');

    btn('del', 0, 0).click();
    expect(renderedDays()[0].names).toEqual(['灵隐寺']);
    expect(document.querySelectorAll('.trip-editor-item')).toHaveLength(2);
  });

  it('整天上移/下移/删除（仅一天时拒绝）', async () => {
    db.loadTripById.mockResolvedValue(makeTrip(basePlan()));
    await tripEditor.openTripEditor('t1');

    btn('day-down', 0).click();
    expect(renderedDays()[0].names).toEqual(['西溪湿地']);
    expect(renderedDays()[1].names).toEqual(['西湖', '灵隐寺']);

    btn('day-up', 1).click();
    expect(renderedDays()[0].names).toEqual(['西湖', '灵隐寺']);
    expect(renderedDays()[1].names).toEqual(['西溪湿地']);

    btn('day-del', 1).click();
    expect(document.querySelectorAll('.trip-editor-day')).toHaveLength(1);

    ctx.showToast.mockClear();
    btn('day-del', 0).click();
    expect(ctx.showToast).toHaveBeenCalledWith(expect.stringContaining('至少保留一天'), 2500, 'warning');
    expect(document.querySelectorAll('.trip-editor-day')).toHaveLength(1);
  });

  it('保存调用 saveTripPlan 且触发 window._renderTripAnimated', async () => {
    const plan = basePlan();
    const trip = makeTrip(plan);
    db.loadTripById.mockResolvedValue(trip);
    db.saveTripPlan.mockResolvedValue(trip);
    window._renderTripAnimated = vi.fn();

    await tripEditor.openTripEditor('t1');
    btn('up', 0, 1).click();
    document.getElementById('btn-save-trip-editor').click();

    await vi.waitFor(() => {
      expect(db.saveTripPlan).toHaveBeenCalledTimes(1);
    });

    const saved = db.saveTripPlan.mock.calls[0][0];
    expect(saved.id).toBe('t1');
    expect(saved.tripPlan.days[0].attractions.map((a) => a.nameZh)).toEqual(['灵隐寺', '西湖']);
    expect(window._renderTripAnimated).toHaveBeenCalledWith(saved.tripPlan);
    expect(ctx.showToast).toHaveBeenCalledWith(expect.stringContaining('已保存'), 2500, 'success');
  });

  it('深拷贝：修改不直接改原对象', async () => {
    const plan = basePlan();
    db.loadTripById.mockResolvedValue(makeTrip(plan));
    await tripEditor.openTripEditor('t1');

    btn('up', 0, 1).click();

    expect(plan.days[0].attractions.map((a) => a.nameZh)).toEqual(['西湖', '灵隐寺']);
    expect(renderedDays()[0].names).toEqual(['灵隐寺', '西湖']);
  });

  it('加载行程失败时提示', async () => {
    db.loadTripById.mockRejectedValue(new Error('boom'));
    await tripEditor.openTripEditor('t1');
    expect(ctx.showToast).toHaveBeenCalledWith(expect.stringContaining('加载行程失败'), 2500, 'error');
  });

  it('无结构化数据时提示', async () => {
    db.loadTripById.mockResolvedValue({ id: 't1', title: 'x', tripPlan: null });
    await tripEditor.openTripEditor('t1');
    expect(ctx.showToast).toHaveBeenCalledWith(expect.stringContaining('没有可编辑的结构化数据'), 3000, 'warning');
  });
});
