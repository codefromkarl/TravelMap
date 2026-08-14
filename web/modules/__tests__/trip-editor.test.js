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

describe('openTripEditorForPlan（实时行程编辑）', () => {
  it('直接编辑传入的 tripPlan，不依赖历史记录 ID', async () => {
    const plan = basePlan();
    await tripEditor.openTripEditorForPlan(plan);

    const days = renderedDays();
    expect(days).toHaveLength(2);
    expect(days[0].names).toEqual(['西湖', '灵隐寺']);
    expect(document.getElementById('trip-editor-overlay').classList.contains('open')).toBe(true);
    expect(db.loadTripById).not.toHaveBeenCalled();
  });

  it('深拷贝：编辑操作不修改传入的 tripPlan', async () => {
    const plan = basePlan();
    await tripEditor.openTripEditorForPlan(plan);

    btn('up', 0, 1).click();

    expect(plan.days[0].attractions.map((a) => a.nameZh)).toEqual(['西湖', '灵隐寺']);
    expect(renderedDays()[0].names).toEqual(['灵隐寺', '西湖']);
  });

  it('保存走 saveTripPlan（live- id）并触发 _renderTripAnimated、更新 _lastTripPlan', async () => {
    const plan = basePlan();
    db.saveTripPlan.mockResolvedValue({ id: 'live-x' });
    window._renderTripAnimated = vi.fn();
    window._lastTripPlan = plan; // 模拟 AI 生成完成后的全局状态

    await tripEditor.openTripEditorForPlan(plan, { title: '杭州实时调整' });
    btn('up', 0, 1).click();
    document.getElementById('btn-save-trip-editor').click();

    await vi.waitFor(() => {
      expect(db.saveTripPlan).toHaveBeenCalledTimes(1);
    });

    const saved = db.saveTripPlan.mock.calls[0][0];
    expect(saved.id).toMatch(/^live-\d+$/);
    expect(saved.title).toBe('杭州实时调整');
    expect(saved.days).toBe(2);
    expect(saved.tripPlan.days[0].attractions.map((a) => a.nameZh)).toEqual(['灵隐寺', '西湖']);
    expect(saved.summary).toBe('');
    expect(typeof saved.updatedAt).toBe('string');
    expect(window._renderTripAnimated).toHaveBeenCalledWith(saved.tripPlan);
    // 保存后全局 _lastTripPlan 被更新为编辑后的行程
    expect(window._lastTripPlan.days[0].attractions[0].nameZh).toBe('灵隐寺');
    expect(ctx.showToast).toHaveBeenCalledWith(expect.stringContaining('已保存到历史行程'), 2500, 'success');
  });

  it('未传 title 时使用默认标题「实时编辑行程」', async () => {
    const plan = basePlan();
    db.saveTripPlan.mockResolvedValue({ id: 'live-x' });

    await tripEditor.openTripEditorForPlan(plan);
    document.getElementById('btn-save-trip-editor').click();

    await vi.waitFor(() => {
      expect(db.saveTripPlan).toHaveBeenCalledTimes(1);
    });
    expect(db.saveTripPlan.mock.calls[0][0].title).toBe('实时编辑行程');
  });

  it('无 window._lastTripPlan 时保存不崩溃', async () => {
    const plan = basePlan();
    db.saveTripPlan.mockResolvedValue({ id: 'live-x' });
    window._renderTripAnimated = vi.fn();
    // beforeEach 已清空 _lastTripPlan，此处显式断言为 undefined
    expect(window._lastTripPlan).toBeUndefined();

    await tripEditor.openTripEditorForPlan(plan);
    document.getElementById('btn-save-trip-editor').click();

    await vi.waitFor(() => {
      expect(db.saveTripPlan).toHaveBeenCalledTimes(1);
    });
    expect(window._lastTripPlan.days).toHaveLength(2);
    expect(window._renderTripAnimated).toHaveBeenCalled();
  });

  it('重复打开时先关闭旧编辑器，不叠加 overlay', async () => {
    const planA = basePlan();
    const planB = {
      days: [
        {
          date: '07-01',
          attractions: [{ nameZh: '黄山', lat: 30.13, lng: 118.16 }],
        },
      ],
    };

    await tripEditor.openTripEditorForPlan(planA);
    expect(document.querySelectorAll('#trip-editor-overlay')).toHaveLength(1);

    await tripEditor.openTripEditorForPlan(planB);
    expect(document.querySelectorAll('#trip-editor-overlay')).toHaveLength(1);
    expect(document.getElementById('trip-editor-overlay').classList.contains('open')).toBe(true);
    expect(renderedDays()[0].names).toEqual(['黄山']);
  });

  it('无结构化数据时提示且不打开编辑器', async () => {
    await tripEditor.openTripEditorForPlan({ city: '杭州', days: null });
    expect(ctx.showToast).toHaveBeenCalledWith(expect.stringContaining('没有可编辑的结构化数据'), 3000, 'warning');
    expect(document.querySelectorAll('#trip-editor-overlay')).toHaveLength(0);
  });
});
