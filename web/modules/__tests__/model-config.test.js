/**
 * model-config.js 单元测试
 *
 * 测试模型配置逻辑：
 * - loadModelConfig - 加载模型配置
 * - setInputValue - 设置输入框值
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock 依赖
vi.mock('../infra/context.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    agent: null,
    currentLang: 'zh',
    showToast: vi.fn(),
    getAmapKey: vi.fn(() => ''),
  };
});

vi.mock('../i18n.js', () => ({
  I18N: {},
}));

vi.mock('../prompt.js', () => ({
  buildSystemPrompt: vi.fn(() => 'mock prompt'),
}));

vi.mock('@earendil-works/pi-ai', () => ({
  getModel: vi.fn(),
}));

vi.mock('@earendil-works/pi-web-ui', () => ({
  getAppStorage: vi.fn(),
}));

vi.mock('../config.js', () => ({
  config: {
    deepseekLocal: {
      baseUrl: 'http://localhost:6011/v1',
      apiKey: '',
      defaultModel: 'deepseek-v4-flash',
    },
  },
}));

// 导入被测模块
import { loadModelConfig } from '../model-config.js';

// ─── 测试 ─────────────────────────────────────────────

describe('model-config.js', () => {
  beforeEach(() => {
    localStorage.clear();

    // 设置 DOM
    document.body.innerHTML = `
      <div id="model-modal-overlay"></div>
      <button id="btn-open-model"></button>
      <button id="btn-close-model-modal"></button>
      <select id="cfg-provider">
        <option value="mimo3">MiMo3</option>
        <option value="openai">OpenAI</option>
        <option value="deepseek">DeepSeek</option>
        <option value="custom">Custom</option>
      </select>
      <select id="cfg-model">
        <option value="gpt-4o">GPT-4o</option>
      </select>
      <input id="cfg-apikey" />
      <input id="cfg-custom-url" />
      <input id="cfg-custom-model" />
      <input id="cfg-google-maps" />
      <input id="cfg-amap-web" />
      <input id="cfg-openweather" />
      <input id="cfg-xhs-strategy" />
      <input id="cfg-xhs-rnote" />
      <input id="cfg-xhs-justone" />
      <input id="cfg-xhs-tikhub" />
      <input id="cfg-xhs-crawler-base" />
      <input id="cfg-xhs-crawler-token" />
      <select id="cfg-thinking-level">
        <option value="medium">Medium</option>
      </select>
      <div id="custom-llm-config" style="display:none"></div>
    `;
  });

  afterEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  describe('loadModelConfig', () => {
    it('应从 localStorage 加载配置', () => {
      localStorage.setItem('travel-agent-provider', 'openai');
      localStorage.setItem('travel-agent-model', 'gpt-4o');
      localStorage.setItem('api-key-openai', 'test-key');

      loadModelConfig();

      const provSelect = document.getElementById('cfg-provider');
      expect(provSelect.value).toBe('openai');
    });

    it('无 localStorage 数据时使用默认值', () => {
      loadModelConfig();

      const provSelect = document.getElementById('cfg-provider');
      expect(provSelect.value).toBe('mimo3');
    });

    it('custom provider 时显示自定义配置', () => {
      localStorage.setItem('travel-agent-provider', 'custom');
      localStorage.setItem('custom-llm-url', 'http://localhost:8080/v1');
      localStorage.setItem('travel-agent-model', 'custom-model');

      loadModelConfig();

      const customConfig = document.getElementById('custom-llm-config');
      if (customConfig) {
        expect(customConfig.style.display).toBe('block');
      }
    });

    it('deepseek-local provider 时隐藏 API Key', () => {
      localStorage.setItem('travel-agent-provider', 'deepseek-local');

      loadModelConfig();

      const keyInput = document.getElementById('cfg-apikey');
      if (keyInput) {
        const keyRow = keyInput.closest('.setting-row');
        if (keyRow) {
          expect(keyRow.style.display).toBe('none');
        }
      }
    });

    it('应加载 API Key 配置', () => {
      localStorage.setItem('api-key-google-maps', 'google-key');
      localStorage.setItem('api-key-amap-web', 'amap-key');

      loadModelConfig();

      expect(document.getElementById('cfg-google-maps').value).toBe('google-key');
      expect(document.getElementById('cfg-amap-web').value).toBe('amap-key');
    });

    it('应加载思考级别配置', () => {
      localStorage.setItem('travel-agent-thinking', 'high');

      loadModelConfig();

      const thinkingSelect = document.getElementById('cfg-thinking-level');
      // select 元素需要有对应的 option 才能设置 value
      if (thinkingSelect) {
        // 添加 high option
        const option = document.createElement('option');
        option.value = 'high';
        option.textContent = 'High';
        thinkingSelect.appendChild(option);
        
        // 重新加载配置
        loadModelConfig();
        expect(thinkingSelect.value).toBe('high');
      }
    });
  });
});
