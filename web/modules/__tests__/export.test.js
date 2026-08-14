/**
 * export.js 单元测试
 *
 * 测试导出功能逻辑：
 * - getLastAssistantContent - 获取最后一条助手消息
 * - generateMarkdown - 生成 Markdown
 * - downloadMarkdown - 下载 Markdown
 * - exportPDF - 导出 PDF
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock 依赖
const contextMocks = vi.hoisted(() => ({
  agent: null,
  showToast: vi.fn(),
}));

// 埋点 mock：分享转化漏斗只关心 track 是否按语义化事件调用
const analyticsMocks = vi.hoisted(() => ({
  track: vi.fn(),
}));

// 分享生成函数 mock：其余 share.js 导出（如 decodeSharedTripContent）保留真实实现
const shareMocks = vi.hoisted(() => ({
  generateShareImage: vi.fn(),
  generateShareLink: vi.fn(),
  generateQRCode: vi.fn(),
}));

vi.mock('../infra/context.js', () => ({
  get agent() {
    return contextMocks.agent;
  },
  currentLang: 'zh',
  showToast: contextMocks.showToast,
  EXPORT_STORAGE_KEY: 'travel-agent-exported-trips',
  lastTripContent: '',
}));

vi.mock('../infra/analytics.js', () => ({
  track: analyticsMocks.track,
  EVENT: Object.freeze({
    SHARE_CLICK: 'share_click',
    SHARE_GENERATED: 'share_generated',
    THEME_TOGGLE: 'theme_toggle',
  }),
}));

vi.mock('../share.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    generateShareImage: shareMocks.generateShareImage,
    generateShareLink: shareMocks.generateShareLink,
    generateQRCode: shareMocks.generateQRCode,
  };
});

// 导入被测模块
import { getLastAssistantContent, generateMarkdown, loadSharedTrip } from '../export.js';

// ─── 测试 ─────────────────────────────────────────────

describe('export.js', () => {
  beforeEach(() => {
    contextMocks.agent = null;
  });

  describe('getLastAssistantContent', () => {
    it('agent 为 null 时返回 null', () => {
      expect(getLastAssistantContent()).toBeNull();
    });

    it('无助手消息时返回 null', async () => {
      contextMocks.agent = { state: { messages: [] } };

      expect(getLastAssistantContent()).toBeNull();
    });

    it('短消息不返回', async () => {
      contextMocks.agent = {
        state: {
          messages: [
            { role: 'assistant', content: '短消息' },
          ],
        },
      };

      expect(getLastAssistantContent()).toBeNull();
    });

    it('长助手消息应返回', async () => {
      const longContent = 'x'.repeat(200);
      contextMocks.agent = {
        state: {
          messages: [
            { role: 'assistant', content: longContent },
          ],
        },
      };

      expect(getLastAssistantContent()).toBe(longContent);
    });

    it('应返回最后一条长消息', async () => {
      contextMocks.agent = {
        state: {
          messages: [
            { role: 'assistant', content: 'x'.repeat(200) },
            { role: 'user', content: '用户消息' },
            { role: 'assistant', content: 'y'.repeat(200) },
          ],
        },
      };

      expect(getLastAssistantContent()).toBe('y'.repeat(200));
    });
  });

  describe('generateMarkdown', () => {
    it('无标题内容应添加标题', () => {
      const content = '这是一段行程内容';
      const md = generateMarkdown(content);

      expect(md).toContain('# 🗺️ 旅行计划');
      expect(md).toContain('这是一段行程内容');
      expect(md).toContain('AI 自动生成');
    });

    it('已有标题内容不修改', () => {
      const content = '# 我的行程\n\n杭州三日游';
      const md = generateMarkdown(content);

      expect(md).toBe(content);
    });

    it('应包含日期', () => {
      const content = '行程内容';
      const md = generateMarkdown(content);

      const today = new Date().toLocaleDateString('zh-CN');
      expect(md).toContain(today);
    });

    it('应包含生成说明', () => {
      const content = '行程内容';
      const md = generateMarkdown(content);

      expect(md).toContain('TravelMap');
      expect(md).toContain('AI');
    });
  });

  describe('loadSharedTrip 服务端路径', () => {
    beforeEach(() => {
      localStorage.clear();
      vi.clearAllMocks();
      contextMocks.agent = null;
      vi.stubGlobal('fetch', vi.fn());
      Object.defineProperty(window, 'location', {
        value: {
          search: '?trip=server-id',
          origin: 'https://example.com',
          hash: '',
          pathname: '/',
        },
        configurable: true,
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('本地未命中时从服务端获取并渲染', async () => {
      const compressed = btoa(encodeURIComponent(JSON.stringify({
        c: '杭州',
        s: '2025-06-01',
        e: '2025-06-03',
        d: [{ i: 1, a: [{ n: '西湖' }] }],
      })));
      contextMocks.agent = { state: { messages: [] } };
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ content: compressed }),
      });

      await loadSharedTrip();

      expect(globalThis.fetch).toHaveBeenCalledWith('/api/share?id=server-id');
      expect(contextMocks.agent.state.messages).toHaveLength(1);
      expect(contextMocks.agent.state.messages[0].content).toContain('杭州');
      expect(contextMocks.showToast).toHaveBeenCalledWith('已加载分享的行程', 3000, 'success');
    });

    it('服务端 404 时不渲染并提示', async () => {
      contextMocks.agent = { state: { messages: [] } };
      globalThis.fetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Share not found' }),
      });

      await loadSharedTrip();

      expect(contextMocks.agent.state.messages).toHaveLength(0);
      expect(contextMocks.showToast).toHaveBeenCalledWith('未找到该分享的行程', 4000, 'warning');
    });
  });

  // ─── 分享埋点（转化漏斗）───────────────────────────────
  describe('分享埋点接入', () => {
    /** 构建 export.js 顶部事件绑定所需的分享弹窗 DOM */
    function buildShareDOM() {
      document.body.innerHTML = [
        '<button id="btn-share-image"></button>',
        '<button id="btn-share-link-new"></button>',
        '<button id="btn-share-qr"></button>',
        '<div id="share-modal-overlay" hidden>',
        '<div id="share-modal">',
        '<div id="share-modal-header"><h2></h2></div>',
        '<div id="share-preview-image"><img id="share-preview-img"></div>',
        '<div id="share-qr-container"><img id="share-qr-img"></div>',
        '</div>',
        '</div>',
      ].join('');
    }

    beforeEach(async () => {
      vi.resetModules();
      analyticsMocks.track.mockClear();
      shareMocks.generateShareImage.mockReset();
      shareMocks.generateShareLink.mockReset();
      shareMocks.generateQRCode.mockReset();
      buildShareDOM();
      delete window._lastTripPlan;
      // 重新加载模块，让按钮绑定在本次 DOM 上生效
      await import('../export.js');
    });

    afterEach(() => {
      document.body.innerHTML = '';
      delete window._lastTripPlan;
      vi.resetModules();
    });

    it('点击三个分享按钮各上报一次 share_click', () => {
      document.getElementById('btn-share-image').click();
      document.getElementById('btn-share-link-new').click();
      document.getElementById('btn-share-qr').click();

      expect(analyticsMocks.track.mock.calls).toEqual([
        ['share_click', { type: 'image' }],
        ['share_click', { type: 'link' }],
        ['share_click', { type: 'qr' }],
      ]);
    });

    it('图片生成成功后上报 share_generated(image)', async () => {
      window._lastTripPlan = { city: '杭州', days: [] };
      shareMocks.generateShareLink.mockReturnValue('https://example.com/?trip=abc');
      shareMocks.generateQRCode.mockReturnValue('data:image/png;base64,QR');
      shareMocks.generateShareImage.mockResolvedValue('data:image/png;base64,IMG');

      document.getElementById('btn-share-image').click();

      await vi.waitFor(() => {
        expect(analyticsMocks.track).toHaveBeenCalledWith('share_generated', { type: 'image' });
      });
    });

    it('图片生成失败不上报 share_generated', async () => {
      window._lastTripPlan = { city: '杭州', days: [] };
      shareMocks.generateShareLink.mockReturnValue('https://example.com/?trip=abc');
      shareMocks.generateQRCode.mockReturnValue('data:image/png;base64,QR');
      shareMocks.generateShareImage.mockResolvedValue(null);

      document.getElementById('btn-share-image').click();

      await new Promise((resolve) => setTimeout(resolve, 50));
      const generatedCalls = analyticsMocks.track.mock.calls
        .filter(([eventType]) => eventType === 'share_generated');
      expect(generatedCalls).toHaveLength(0);
    });
  });
});
