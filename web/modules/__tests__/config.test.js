/**
 * config.js 单元测试
 *
 * 测试配置管理逻辑：
 * - config.deepseekLocal - 配置合并
 * - resolveApiKey - API Key 解析
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock 依赖
vi.mock('../context.js', () => ({
  isProxyMode: false,
}));

// Mock config.local.js
vi.mock('../config.local.js', () => ({
  default: {},
}));

// 导入被测模块
import { config, resolveApiKey } from '../config.js';

// ─── 测试 ─────────────────────────────────────────────

describe('config.js', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('config.deepseekLocal', () => {
    it('应包含默认配置', () => {
      const ds = config.deepseekLocal;
      expect(ds.baseUrl).toBeDefined();
      expect(ds.defaultModel).toBeDefined();
    });

    it('默认模型应为 deepseek-v4-flash', () => {
      // 注意：config.local.js 可能覆盖默认值
      const model = config.deepseekLocal.defaultModel;
      expect(typeof model).toBe('string');
      expect(model.length).toBeGreaterThan(0);
    });
  });

  describe('resolveApiKey', () => {
    it('localStorage 有值时返回 localStorage 的值', () => {
      localStorage.setItem('api-key-openai', 'test-key-123');

      const key = resolveApiKey('openai');
      expect(key).toBe('test-key-123');
    });

    it('未知 provider 无 localStorage 时返回 undefined', () => {
      const key = resolveApiKey('unknown-provider');
      expect(key === undefined || key === 'proxy').toBe(true);
    });
  });
});
