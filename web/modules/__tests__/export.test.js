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

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock 依赖
const contextMocks = vi.hoisted(() => ({
  agent: null,
  showToast: vi.fn(),
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

// 导入被测模块
import { getLastAssistantContent, generateMarkdown } from '../export.js';

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
});
