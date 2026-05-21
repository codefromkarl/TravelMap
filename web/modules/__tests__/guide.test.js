/**
 * guide.js 单元测试
 *
 * 测试导游讲解功能：
 * - isGeolocationSupported - 检查定位支持
 * - setTripPlanForGuide - 设置行程数据
 * - onGuideTrigger - 设置回调
 * - getGuideState - 获取状态
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

// Mock Geolocation
const mockWatchPosition = vi.fn(() => 1);
const mockClearWatch = vi.fn();

Object.defineProperty(navigator, 'geolocation', {
  value: {
    watchPosition: mockWatchPosition,
    clearWatch: mockClearWatch,
  },
  writable: true,
});

// 导入被测模块
import {
  isGeolocationSupported,
  setTripPlanForGuide,
  onGuideTrigger,
  getGuideState,
  stopLocationWatch,
} from '../guide.js';

// ─── 测试 ─────────────────────────────────────────────

describe('guide.js', () => {
  beforeEach(() => {
    // 重置状态
    stopLocationWatch();
  });

  describe('isGeolocationSupported', () => {
    it('浏览器支持时返回 true', () => {
      expect(isGeolocationSupported()).toBe(true);
    });
  });

  describe('setTripPlanForGuide', () => {
    it('应设置行程数据', () => {
      const tripPlan = {
        city: '杭州',
        days: [
          {
            attractions: [
              { name: '西湖', location: { latitude: 30.2458, longitude: 120.1484 } },
            ],
          },
        ],
      };

      expect(() => setTripPlanForGuide(tripPlan)).not.toThrow();
    });

    it('应重置最后触发的景点', () => {
      setTripPlanForGuide({ city: '杭州', days: [] });

      const state = getGuideState();
      expect(state.lastTriggered).toBeNull();
    });
  });

  describe('onGuideTrigger', () => {
    it('应设置回调函数', () => {
      const callback = vi.fn();
      expect(() => onGuideTrigger(callback)).not.toThrow();
    });
  });

  describe('getGuideState', () => {
    it('初始状态应为未监听', () => {
      const state = getGuideState();
      expect(state.isWatching).toBe(false);
      expect(state.isSupported).toBe(true);
      expect(state.lastTriggered).toBeNull();
    });
  });

  describe('stopLocationWatch', () => {
    it('应停止监听', () => {
      stopLocationWatch();

      const state = getGuideState();
      expect(state.isWatching).toBe(false);
    });

    it('应重置最后触发的景点', () => {
      stopLocationWatch();

      const state = getGuideState();
      expect(state.lastTriggered).toBeNull();
    });
  });
});
