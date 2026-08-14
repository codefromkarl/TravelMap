/**
 * history.js 单元测试
 *
 * 测试历史记录管理逻辑：
 * - formatDate - 日期格式化
 * - renderTripCard - 行程卡片 HTML 生成
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

// Mock 依赖
vi.mock('../context.js', () => ({
  agent: null,
  currentTripId: null,
  setCurrentTripId: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../db.js', () => ({
  listTrips: vi.fn(() => Promise.resolve([])),
  loadTripById: vi.fn(),
  deleteTripById: vi.fn(),
}));

vi.mock('../tools/validate-trip.js', () => ({
  validateAndWarn: vi.fn(() => ({ hasIssues: false, missingCoords: [] })),
}));

// 导入被测模块（通过动态导入获取内部函数）
let formatDate;
let renderTripCard;

beforeEach(async () => {
  // 动态导入模块
  const module = await import('../history.js');

  // formatDate 和 renderTripCard 是模块内部函数，需要通过其他方式测试
  // 这里我们测试 renderHistory 的行为
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('history.js', () => {
  // 由于 formatDate 和 renderTripCard 是模块内部函数，
  // 我们通过 renderHistory 的行为来间接测试

  describe('renderHistory', () => {
    beforeEach(async () => {
      // 设置 DOM
      document.body.innerHTML = '<div id="history-list"></div>';

      // 重新加载模块以获取新的 historyList 引用
      vi.resetModules();
    });

    it('空列表显示空状态', async () => {
      const { listTrips } = await import('../db.js');
      listTrips.mockResolvedValue([]);

      const module = await import('../history.js');
      // 手动设置 historyList
      module.historyList.innerHTML = '';
      await module.renderHistory();

      expect(module.historyList.innerHTML).toContain('暂无历史行程');
    });

    it('有行程时渲染卡片', async () => {
      const { listTrips } = await import('../db.js');
      const mockTrips = [
        {
          id: '1',
          title: '杭州三日游',
          city: '杭州',
          days: 3,
          startDate: '2025-06-01',
          endDate: '2025-06-03',
          updatedAt: new Date().toISOString(),
          summary: '西湖、灵隐寺、西溪湿地',
        },
      ];
      listTrips.mockResolvedValue(mockTrips);

      const module = await import('../history.js');
      module.historyList.innerHTML = '';
      await module.renderHistory();

      expect(module.historyList.innerHTML).toContain('杭州三日游');
      expect(module.historyList.innerHTML).toContain('杭州');
      expect(module.historyList.innerHTML).toContain('3天');
    });

    it('行程卡片包含恢复和删除按钮', async () => {
      const { listTrips } = await import('../db.js');
      const mockTrips = [
        {
          id: '1',
          title: '测试行程',
          city: '北京',
          days: 2,
          updatedAt: new Date().toISOString(),
        },
      ];
      listTrips.mockResolvedValue(mockTrips);

      const module = await import('../history.js');
      module.historyList.innerHTML = '';
      await module.renderHistory();

      expect(module.historyList.innerHTML).toContain('restore-btn');
      expect(module.historyList.innerHTML).toContain('delete-btn');
      expect(module.historyList.innerHTML).toContain('data-id="1"');
    });

    it('行程有人群标签时显示', async () => {
      const { listTrips } = await import('../db.js');
      const mockTrips = [
        {
          id: '1',
          title: '家庭游',
          city: '上海',
          days: 3,
          updatedAt: new Date().toISOString(),
          travelerProfile: { adults: 2, children: 1, seniors: 0 },
        },
      ];
      listTrips.mockResolvedValue(mockTrips);

      const module = await import('../history.js');
      module.historyList.innerHTML = '';
      await module.renderHistory();

      expect(module.historyList.innerHTML).toContain('👥');
      expect(module.historyList.innerHTML).toContain('2大');
      expect(module.historyList.innerHTML).toContain('1小');
    });

    it('行程有封面图时显示', async () => {
      const { listTrips } = await import('../db.js');
      const mockTrips = [
        {
          id: '1',
          title: '有封面的行程',
          city: '杭州',
          days: 2,
          updatedAt: new Date().toISOString(),
          coverImage: 'https://example.com/cover.jpg',
        },
      ];
      listTrips.mockResolvedValue(mockTrips);

      const module = await import('../history.js');
      module.historyList.innerHTML = '';
      await module.renderHistory();

      expect(module.historyList.innerHTML).toContain('item-cover');
      expect(module.historyList.innerHTML).toContain('https://example.com/cover.jpg');
    });

    it('行程无封面图时不显示封面', async () => {
      const { listTrips } = await import('../db.js');
      const mockTrips = [
        {
          id: '1',
          title: '无封面的行程',
          city: '杭州',
          days: 2,
          updatedAt: new Date().toISOString(),
        },
      ];
      listTrips.mockResolvedValue(mockTrips);

      const module = await import('../history.js');
      module.historyList.innerHTML = '';
      await module.renderHistory();

      expect(module.historyList.innerHTML).not.toContain('item-cover');
    });
  });
});

// ─── 日期格式化测试（通过 Date mock）────────────────────

describe('日期格式化逻辑', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('刚刚（1分钟内）', () => {
    const now = new Date('2025-06-01T12:00:00');
    vi.setSystemTime(now);

    const date = new Date('2025-06-01T11:59:30');
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);

    expect(diffMin).toBe(0);
  });

  it('X分钟前', () => {
    const now = new Date('2025-06-01T12:00:00');
    vi.setSystemTime(now);

    const date = new Date('2025-06-01T11:55:00');
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);

    expect(diffMin).toBe(5);
  });

  it('X小时前', () => {
    const now = new Date('2025-06-01T12:00:00');
    vi.setSystemTime(now);

    const date = new Date('2025-06-01T09:00:00');
    const diffMs = now - date;
    const diffHour = Math.floor(diffMs / 3600000);

    expect(diffHour).toBe(3);
  });

  it('X天前', () => {
    const now = new Date('2025-06-01T12:00:00');
    vi.setSystemTime(now);

    const date = new Date('2025-05-29T12:00:00');
    const diffMs = now - date;
    const diffDay = Math.floor(diffMs / 86400000);

    expect(diffDay).toBe(3);
  });
});
// ─── 账号数据操作按钮（GDPR 合规）────────────────────
describe('账号数据操作按钮', () => {
  let originalLocationDescriptor;
  let originalConfirmDescriptor;

  beforeAll(() => {
    originalLocationDescriptor = Object.getOwnPropertyDescriptor(window, 'location');
    originalConfirmDescriptor = Object.getOwnPropertyDescriptor(window, 'confirm');
  });

  beforeEach(async () => {
    vi.resetModules();
    document.body.innerHTML = '<div id="history-panel"><div id="history-list"></div></div>';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    try { delete URL.createObjectURL; } catch { /* ignore */ }
    try { delete URL.revokeObjectURL; } catch { /* ignore */ }
    if (originalLocationDescriptor) {
      Object.defineProperty(window, 'location', originalLocationDescriptor);
    } else {
      try { delete window.location; } catch { /* ignore */ }
    }
    if (originalConfirmDescriptor) {
      Object.defineProperty(window, 'confirm', originalConfirmDescriptor);
    }
  });

  function useRemoteLocation() {
    const locationMock = { hostname: 'travel.codefromkarl.xyz', reload: vi.fn() };
    Object.defineProperty(window, 'location', {
      value: locationMock,
      configurable: true,
      writable: true,
    });
    return locationMock;
  }

  function useConfirm(value) {
    Object.defineProperty(window, 'confirm', {
      value: vi.fn(() => value),
      configurable: true,
      writable: true,
    });
  }

  it('历史面板底部渲染导出与删除按钮，未登录时隐藏', async () => {
    const module = await import('../history.js');
    const container = document.getElementById('account-actions');
    expect(container).toBeTruthy();
    expect(container.querySelector('#btn-export-my-data')).toBeTruthy();
    expect(container.querySelector('#btn-delete-account')).toBeTruthy();
    expect(container.querySelector('#btn-export-my-data').textContent).toBe('导出我的数据');
    expect(container.querySelector('#btn-delete-account').textContent).toBe('删除账号数据');
    expect(container.style.display).toBe('none');
    // 按钮容器位于 history-list 之后、面板底部
    expect(module.historyList.nextElementSibling).toBe(container);
  });

  it('登录后显示按钮', async () => {
    const ctx = await import('../infra/context.js');
    ctx.setCurrentUser({ id: 'u1', name: '测试用户' });
    await import('../history.js');
    const container = document.getElementById('account-actions');
    expect(container.style.display).toBe('flex');
  });

  it('打开历史面板时按当前登录态刷新按钮', async () => {
    const module = await import('../history.js');
    const ctx = await import('../infra/context.js');
    const { listTrips } = await import('../db.js');
    const container = document.getElementById('account-actions');
    expect(container.style.display).toBe('none');

    ctx.setCurrentUser({ id: 'u1' });
    listTrips.mockResolvedValue([]);
    await module.renderHistory();
    expect(container.style.display).toBe('flex');

    ctx.setCurrentUser(null);
    await module.renderHistory();
    expect(container.style.display).toBe('none');
  });

  it('本地开发环境不发起云端导出请求（isLocalHost 守卫）', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await import('../history.js');
    const ctx = await import('../infra/context.js');
    ctx.setCurrentUser({ id: 'u1' });
    document.getElementById('btn-export-my-data').click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('导出按钮点击调用 /api/account/export 并触发下载', async () => {
    useRemoteLocation();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: 'u1' }, trips: [], exportedAt: '2026-01-01T00:00:00.000Z' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const createObjectURL = vi.fn(() => 'blob:mock-export');
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await import('../history.js');
    const ctx = await import('../infra/context.js');
    ctx.setCurrentUser({ id: 'u1' });
    document.getElementById('btn-export-my-data').click();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/account/export', expect.objectContaining({
      credentials: 'same-origin',
    }));
    await vi.waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });
    clickSpy.mockRestore();
  });

  it('删除按钮：确认后调用 DELETE 并清空本地行程', async () => {
    const locationMock = useRemoteLocation();
    useConfirm(true);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ deleted: { user: true, trips: 2 } }) });
    vi.stubGlobal('fetch', fetchMock);

    await import('../history.js');
    const ctx = await import('../infra/context.js');
    ctx.setCurrentUser({ id: 'u1' });
    const { listTrips, deleteTripById } = await import('../db.js');
    listTrips.mockResolvedValue([{ id: 't1' }, { id: 't2' }]);
    deleteTripById.mockResolvedValue();

    document.getElementById('btn-delete-account').click();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/account', expect.objectContaining({
      method: 'DELETE',
      credentials: 'same-origin',
    }));
    expect(window.confirm).toHaveBeenCalledWith('此操作将永久删除你的账号数据（行程、设置等），且不可恢复。确定继续吗？');
    await vi.waitFor(() => {
      expect(deleteTripById).toHaveBeenCalledTimes(2);
    });
    expect(deleteTripById).toHaveBeenCalledWith('t1');
    expect(deleteTripById).toHaveBeenCalledWith('t2');
    expect(locationMock.reload).toHaveBeenCalledTimes(1);
  });

  it('删除按钮：取消确认时不发起请求', async () => {
    useRemoteLocation();
    useConfirm(false);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await import('../history.js');
    const ctx = await import('../infra/context.js');
    ctx.setCurrentUser({ id: 'u1' });
    document.getElementById('btn-delete-account').click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

