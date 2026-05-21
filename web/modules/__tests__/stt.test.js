/**
 * stt.js 单元测试
 *
 * 测试语音识别功能：
 * - isSTTSupported - 检查支持
 * - getSTTState - 获取状态
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Web Speech Recognition API
const mockStart = vi.fn();
const mockStop = vi.fn();

class MockSpeechRecognition {
  constructor() {
    this.lang = 'zh-CN';
    this.continuous = false;
    this.interimResults = false;
    this.maxAlternatives = 1;
    this.onstart = null;
    this.onresult = null;
    this.onerror = null;
    this.onend = null;
  }
  start() { mockStart(); }
  stop() { mockStop(); }
}

Object.defineProperty(window, 'SpeechRecognition', {
  value: MockSpeechRecognition,
  writable: true,
});

// 导入被测模块
import { isSTTSupported, getSTTState } from '../stt.js';

// ─── 测试 ─────────────────────────────────────────────

describe('stt.js', () => {
  describe('isSTTSupported', () => {
    it('浏览器支持时返回 true', () => {
      expect(isSTTSupported()).toBe(true);
    });
  });

  describe('getSTTState', () => {
    it('初始状态应为未监听', () => {
      const state = getSTTState();
      expect(state.isListening).toBe(false);
      expect(state.isSupported).toBeDefined();
    });
  });
});
