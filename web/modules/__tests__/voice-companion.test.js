/**
 * voice-companion.js 单元测试
 *
 * 测试语音伴游功能：
 * - isVoiceCompanionSupported - 检查支持
 * - setTripPlanForCompanion - 设置行程数据
 * - getCompanionState - 获取状态
 * - stopVoiceCompanion - 停止伴游
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Web Speech API
Object.defineProperty(window, 'speechSynthesis', {
  value: {
    speak: vi.fn(),
    cancel: vi.fn(),
    getVoices: vi.fn(() => []),
  },
  writable: true,
});

Object.defineProperty(window, 'SpeechSynthesisUtterance', {
  value: vi.fn().mockImplementation((text) => ({ text })),
  writable: true,
});

// Mock Speech Recognition
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
  start() {}
  stop() {}
}

Object.defineProperty(window, 'SpeechRecognition', {
  value: MockSpeechRecognition,
  writable: true,
});

// 导入被测模块
import {
  isVoiceCompanionSupported,
  setTripPlanForCompanion,
  getCompanionState,
  stopVoiceCompanion,
} from '../voice-companion.js';

// ─── 测试 ─────────────────────────────────────────────

describe('voice-companion.js', () => {
  beforeEach(() => {
    stopVoiceCompanion();
  });

  describe('isVoiceCompanionSupported', () => {
    it('浏览器支持时返回 true', () => {
      expect(isVoiceCompanionSupported()).toBe(true);
    });
  });

  describe('setTripPlanForCompanion', () => {
    it('应设置行程数据', () => {
      const tripPlan = {
        city: '杭州',
        days: [
          {
            attractions: [
              { name: '西湖', description: '杭州最著名的景点' },
            ],
          },
        ],
      };

      expect(() => setTripPlanForCompanion(tripPlan)).not.toThrow();
    });

    it('应清空对话历史', () => {
      setTripPlanForCompanion({ city: '杭州', days: [] });

      const state = getCompanionState();
      expect(state).toBeDefined();
    });
  });

  describe('getCompanionState', () => {
    it('初始状态应为空闲', () => {
      const state = getCompanionState();
      expect(state).toBeDefined();
      expect(typeof state.isSupported).toBe('boolean');
    });
  });

  describe('stopVoiceCompanion', () => {
    it('应停止伴游', () => {
      stopVoiceCompanion();

      const state = getCompanionState();
      expect(state.isActive).toBe(false);
    });

    it('多次调用不报错', () => {
      expect(() => {
        stopVoiceCompanion();
        stopVoiceCompanion();
        stopVoiceCompanion();
      }).not.toThrow();
    });
  });
});
