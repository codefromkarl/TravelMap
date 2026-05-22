/**
 * welcome.js 单元测试
 *
 * 测试欢迎页逻辑：
 * - initWelcome - 初始化欢迎页
 * - 快捷提示卡片点击
 * - 发现模式处理
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock 依赖
const mockRun = vi.fn(() => Promise.resolve());
vi.mock('../context.js', () => ({
  agent: { subscribe: vi.fn(), run: mockRun },
  chatPanel: null,
  showToast: vi.fn(),
}));

vi.mock('../location.js', () => ({
  getUserLocation: vi.fn(() => Promise.resolve({ latitude: 30.2458, longitude: 120.1484, city: '杭州' })),
  buildDiscoverPrompt: vi.fn(() => '推荐杭州周边景点'),
}));

// 导入被测模块
import { initWelcome } from '../welcome.js';

// ─── 测试 ─────────────────────────────────────────────

describe('welcome.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 设置 DOM — 使用 #map-chat-welcome（与 index.html 一致）
    document.body.innerHTML = `
      <div id="map-chat-welcome">
        <div class="quick-prompt" data-prompt="规划一个杭州三日游">杭州三日游</div>
        <div class="quick-prompt" data-prompt="北京文化之旅">北京文化之旅</div>
        <div class="quick-prompt" data-action="discover">发现周边</div>
      </div>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('initWelcome', () => {
    it('应初始化欢迎页', () => {
      expect(() => initWelcome()).not.toThrow();
    });

    it('点击快捷提示卡片应通过 agent.run 发送消息', () => {
      initWelcome();

      const card = document.querySelector('.quick-prompt[data-prompt]');

      // 模拟点击
      card.click();

      // 验证 agent.run 被调用（不再通过 DOM 模拟）
      expect(mockRun).toHaveBeenCalledWith('规划一个杭州三日游');
    });

    it('点击快捷提示卡片应隐藏欢迎页', () => {
      initWelcome();

      const card = document.querySelector('.quick-prompt[data-prompt]');
      const welcomeEl = document.getElementById('map-chat-welcome');

      // 模拟点击
      card.click();

      // 验证欢迎页被隐藏（使用 style.display）
      expect(welcomeEl.style.display).toBe('none');
    });

    it('无 welcome 元素时不报错', () => {
      document.body.innerHTML = '';

      expect(() => initWelcome()).not.toThrow();
    });

    it('应订阅 agent 事件隐藏欢迎页', async () => {
      const context = await import('../context.js');

      initWelcome();

      // 验证 subscribe 被调用
      expect(context.agent.subscribe).toHaveBeenCalled();
    });
  });
});
