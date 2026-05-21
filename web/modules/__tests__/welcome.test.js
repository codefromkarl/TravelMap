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
vi.mock('../context.js', () => ({
  agent: { subscribe: vi.fn() },
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
    // 设置 DOM
    document.body.innerHTML = `
      <div id="welcome">
        <div class="quick-prompt" data-prompt="规划一个杭州三日游">杭州三日游</div>
        <div class="quick-prompt" data-prompt="北京文化之旅">北京文化之旅</div>
        <div class="quick-prompt" data-action="discover">发现周边</div>
      </div>
      <message-editor>
        <textarea></textarea>
      </message-editor>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('initWelcome', () => {
    it('应初始化欢迎页', () => {
      expect(() => initWelcome()).not.toThrow();
    });

    it('点击快捷提示卡片应发送消息', () => {
      initWelcome();

      const card = document.querySelector('.quick-prompt[data-prompt]');
      const ta = document.querySelector('message-editor textarea');

      // 模拟点击
      card.click();

      // 验证 textarea 被填充
      expect(ta.value).toBe('规划一个杭州三日游');
    });

    it('点击快捷提示卡片应隐藏欢迎页', () => {
      initWelcome();

      const card = document.querySelector('.quick-prompt[data-prompt]');
      const welcomeEl = document.getElementById('welcome');

      // 模拟点击
      card.click();

      // 验证欢迎页被隐藏
      expect(welcomeEl.classList.contains('hidden')).toBe(true);
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
