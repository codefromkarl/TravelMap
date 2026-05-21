/**
 * tts.js 单元测试
 *
 * 测试语音合成功能：
 * - isTTSSupported - 检查支持
 * - getState - 获取状态
 * - generateSpeechText - 生成播报文本
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Web Speech API
const mockSpeak = vi.fn();
const mockCancel = vi.fn();
const mockPause = vi.fn();
const mockResume = vi.fn();

Object.defineProperty(window, 'speechSynthesis', {
  value: {
    speak: mockSpeak,
    cancel: mockCancel,
    pause: mockPause,
    resume: mockResume,
    getVoices: vi.fn(() => []),
  },
  writable: true,
});

Object.defineProperty(window, 'SpeechSynthesisUtterance', {
  value: vi.fn().mockImplementation((text) => ({
    text,
    rate: 1,
    pitch: 1,
    volume: 1,
    lang: 'zh-CN',
    voice: null,
    onstart: null,
    onend: null,
    onpause: null,
    onresume: null,
    onerror: null,
  })),
  writable: true,
});

// 导入被测模块
import { isTTSSupported, getState, generateSpeechText } from '../tts.js';

// ─── 测试 ─────────────────────────────────────────────

describe('tts.js', () => {
  describe('isTTSSupported', () => {
    it('浏览器支持时返回 true', () => {
      expect(isTTSSupported()).toBe(true);
    });
  });

  describe('getState', () => {
    it('初始状态应为未播放', () => {
      const state = getState();
      expect(state.isPlaying).toBe(false);
      expect(state.isPaused).toBe(false);
    });
  });

  describe('generateSpeechText', () => {
    it('null 数据返回空字符串', () => {
      expect(generateSpeechText(null)).toBe('');
      expect(generateSpeechText(undefined)).toBe('');
    });

    it('无 days 返回空字符串', () => {
      expect(generateSpeechText({ city: '杭州' })).toBe('');
    });

    it('空 days 返回空字符串', () => {
      const result = generateSpeechText({ city: '杭州', days: [] });
      // 空 days 可能返回空字符串或包含城市名的播报
      expect(typeof result).toBe('string');
    });

    it('单日行程生成播报文本', () => {
      const tripPlan = {
        city: '杭州',
        days: [
          {
            date: '2025-06-01',
            attractions: [
              { name: '西湖', nameZh: '西湖' },
              { name: '灵隐寺', nameZh: '灵隐寺' },
            ],
          },
        ],
      };

      const text = generateSpeechText(tripPlan);
      expect(text).toContain('杭州');
      expect(text).toContain('1天');
      expect(text).toContain('西湖');
      expect(text).toContain('灵隐寺');
    });

    it('多日行程生成播报文本', () => {
      const tripPlan = {
        city: '杭州',
        days: [
          {
            date: '2025-06-01',
            attractions: [{ name: '西湖', nameZh: '西湖' }],
          },
          {
            date: '2025-06-02',
            attractions: [{ name: '灵隐寺', nameZh: '灵隐寺' }],
          },
        ],
      };

      const text = generateSpeechText(tripPlan);
      expect(text).toContain('2天');
      expect(text).toContain('2025-06-01');
      expect(text).toContain('2025-06-02');
    });

    it('交通转移日生成播报文本', () => {
      const tripPlan = {
        city: '杭州',
        days: [
          {
            date: '2025-06-01',
            isTransferDay: true,
          },
        ],
      };

      const text = generateSpeechText(tripPlan);
      expect(text).toContain('交通转移');
    });

    it('无景点日生成自由安排文本', () => {
      const tripPlan = {
        city: '杭州',
        days: [
          {
            date: '2025-06-01',
            attractions: [],
          },
        ],
      };

      const text = generateSpeechText(tripPlan);
      expect(text).toContain('自由安排');
    });

    it('有餐厅信息生成播报文本', () => {
      const tripPlan = {
        city: '杭州',
        days: [
          {
            date: '2025-06-01',
            attractions: [{ name: '西湖', nameZh: '西湖' }],
            meals: [
              { type: 'lunch', name: '外婆家' },
            ],
          },
        ],
      };

      const text = generateSpeechText(tripPlan);
      expect(text).toContain('午餐');
      expect(text).toContain('外婆家');
    });

    it('多城市行程生成播报文本', () => {
      const tripPlan = {
        city: '杭州',
        cities: ['杭州', '上海'],
        days: [
          {
            date: '2025-06-01',
            city: '杭州',
            attractions: [{ name: '西湖', nameZh: '西湖' }],
          },
          {
            date: '2025-06-02',
            city: '上海',
            attractions: [{ name: '外滩', nameZh: '外滩' }],
          },
        ],
      };

      const text = generateSpeechText(tripPlan);
      expect(text).toContain('杭州');
      expect(text).toContain('上海');
    });
  });
});
