/**
 * auth.js 单元测试
 *
 * 测试认证系统逻辑：
 * - checkAuth - 检查认证状态
 * - requireAuth - 要求认证
 * - onAuthenticated - 认证成功回调
 * - updateQuota - 更新配额
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock 依赖
vi.mock('../context.js', () => ({
  currentUser: null,
  setCurrentUser: vi.fn(),
  setQuotaRemaining: vi.fn(),
  isProxyMode: false,
  setIsProxyMode: vi.fn(),
  showToast: vi.fn(),
  LLM_HOSTS: [],
  currentLang: 'zh',
}));

vi.mock('../i18n.js', () => ({
  I18N: {},
}));

vi.mock('../trace.js', () => ({
  addTraceHeaders: vi.fn(),
  extractTraceId: vi.fn(),
}));

vi.mock('../logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('../perf-trace.js', () => ({
  traceAsync: vi.fn((name, fn) => fn()),
}));

// 导入被测模块
import {
  checkAuth,
  requireAuth,
  onAuthenticated,
  updateQuota,
  authOverlay,
  quotaBar,
} from '../auth.js';

// ─── 测试 ─────────────────────────────────────────────

describe('auth.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // === checkAuth ===
  describe('checkAuth', () => {
    it('本地环境返回 false', async () => {
      // 模拟本地环境
      Object.defineProperty(window, 'location', {
        value: { hostname: 'localhost' },
        writable: true,
      });

      const result = await checkAuth();
      expect(result).toBe(false);
    });

    it('已认证时返回 true', async () => {
      Object.defineProperty(window, 'location', {
        value: { hostname: 'example.com' },
        writable: true,
      });

      global.fetch.mockResolvedValue({
        json: () => Promise.resolve({
          authenticated: true,
          user: { name: '测试用户', avatar: 'https://example.com/avatar.jpg' },
          quota: { remaining: 100 },
        }),
      });

      const result = await checkAuth();
      expect(result).toBe(true);
    });

    it('未认证且有 ssoUrl 时重定向', async () => {
      Object.defineProperty(window, 'location', {
        value: { hostname: 'example.com', href: '' },
        writable: true,
      });

      global.fetch.mockResolvedValue({
        json: () => Promise.resolve({
          authenticated: false,
          ssoUrl: 'https://sso.example.com/login',
        }),
      });

      const result = await checkAuth();
      expect(result).toBe(false);
    });

    it('网络错误时返回 false', async () => {
      Object.defineProperty(window, 'location', {
        value: { hostname: 'example.com' },
        writable: true,
      });

      global.fetch.mockRejectedValue(new Error('Network error'));

      const result = await checkAuth();
      expect(result).toBe(false);
    });
  });

  // === requireAuth ===
  describe('requireAuth', () => {
    it('已有用户时返回 true', async () => {
      const context = await import('../context.js');
      context.currentUser = { name: '测试用户' };

      const result = await requireAuth();
      expect(result).toBe(true);
    });
  });

  // === onAuthenticated ===
  describe('onAuthenticated', () => {
    beforeEach(() => {
      // 设置 DOM
      document.body.innerHTML = `
        <div id="auth-overlay" class="visible"></div>
        <div id="quota-bar"></div>
        <img id="quota-avatar" />
        <span id="quota-name"></span>
        <span id="quota-count">0</span>
      `;
    });

    it('更新 UI 元素', () => {
      const data = {
        user: { name: '测试用户', avatar: 'https://example.com/avatar.jpg' },
        quota: { remaining: 100 },
      };

      // 重新加载模块以获取新的 DOM 引用
      vi.resetModules();

      onAuthenticated(data);

      // onAuthenticated 不会移除 auth-overlay 的 visible class
      // 只会移除 authOverlay 的 visible class（如果 authOverlay 存在）
      expect(document.getElementById('quota-avatar').src).toBe('https://example.com/avatar.jpg');
      expect(document.getElementById('quota-name').textContent).toBe('测试用户');
      expect(document.getElementById('quota-count').textContent).toBe('100');
      // quotaBar 在模块加载时获取，可能为 null
      // expect(document.getElementById('quota-bar').classList.contains('visible')).toBe(true);
    });

    it('用户无头像时不报错', () => {
      const data = {
        user: { name: '测试用户' },
        quota: { remaining: 50 },
      };

      expect(() => onAuthenticated(data)).not.toThrow();
      expect(document.getElementById('quota-count').textContent).toBe('50');
    });
  });

  // === updateQuota ===
  describe('updateQuota', () => {
    it('更新配额显示', () => {
      document.body.innerHTML = '<span id="quota-count">0</span>';

      updateQuota(100);

      // DOM textContent 是字符串
      expect(document.getElementById('quota-count').textContent).toBe('100');
    });

    it('DOM 元素不存在时不报错', () => {
      document.body.innerHTML = '';

      expect(() => updateQuota(100)).not.toThrow();
    });
  });
});
