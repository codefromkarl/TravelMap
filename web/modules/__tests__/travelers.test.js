/**
 * travelers.js 单元测试
 *
 * 测试出行人群管理逻辑：
 * - loadTravelersFromStorage / saveTravelersToStorage
 * - loadPreferencesFromStorage / savePreferencesToStorage
 * - formatPreferencesText
 * - formatTravelersText
 * - updateSystemPromptWithTravelers / updateSystemPromptWithPreferences
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock 依赖
vi.mock('../context.js', () => ({
  currentTravelers: null,
  setCurrentTravelers: vi.fn(),
  TRAVELERS_KEY: 'travel-agent-travelers',
  currentPreferences: null,
  setPreferences: vi.fn(),
  PREFERENCES_KEY: 'travel-agent-preferences',
  showToast: vi.fn(),
  agent: null,
  setAgent: vi.fn(),
  currentLang: 'zh',
}));

vi.mock('../prompt.js', () => ({
  buildSystemPrompt: vi.fn(() => 'mock system prompt'),
}));

// 导入被测模块
import {
  loadTravelersFromStorage,
  saveTravelersToStorage,
  loadPreferencesFromStorage,
  savePreferencesToStorage,
  formatPreferencesText,
  formatTravelersText,
  updateSystemPromptWithTravelers,
  updateSystemPromptWithPreferences,
} from '../travelers.js';

// ─── 测试 ─────────────────────────────────────────────

describe('travelers.js', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  // === loadTravelersFromStorage ===
  describe('loadTravelersFromStorage', () => {
    it('无数据时返回 null', () => {
      const result = loadTravelersFromStorage();
      expect(result).toBeNull();
    });

    it('有数据时返回解析后的对象', () => {
      const data = { adults: 2, children: 1, seniors: 0, infants: 0, pregnant: false, mobilityImpaired: false };
      localStorage.setItem('travel-agent-travelers', JSON.stringify(data));

      const result = loadTravelersFromStorage();
      expect(result).toEqual(data);
    });

    it('数据格式错误时返回 null', () => {
      localStorage.setItem('travel-agent-travelers', 'invalid json');

      const result = loadTravelersFromStorage();
      expect(result).toBeNull();
    });
  });

  // === saveTravelersToStorage ===
  describe('saveTravelersToStorage', () => {
    it('保存数据到 localStorage', () => {
      const data = { adults: 2, children: 1 };
      saveTravelersToStorage(data);

      const stored = JSON.parse(localStorage.getItem('travel-agent-travelers'));
      expect(stored).toEqual(data);
    });
  });

  // === loadPreferencesFromStorage ===
  describe('loadPreferencesFromStorage', () => {
    it('无数据时返回 null', () => {
      const result = loadPreferencesFromStorage();
      expect(result).toBeNull();
    });

    it('有数据时返回解析后的对象', () => {
      const data = { budget: 5000, diet: '无辣', style: 'relaxed' };
      localStorage.setItem('travel-agent-preferences', JSON.stringify(data));

      const result = loadPreferencesFromStorage();
      expect(result).toEqual(data);
    });

    it('数据格式错误时返回 null', () => {
      localStorage.setItem('travel-agent-preferences', 'invalid json');

      const result = loadPreferencesFromStorage();
      expect(result).toBeNull();
    });
  });

  // === savePreferencesToStorage ===
  describe('savePreferencesToStorage', () => {
    it('保存数据到 localStorage', () => {
      const data = { budget: 5000, diet: '无辣' };
      savePreferencesToStorage(data);

      const stored = JSON.parse(localStorage.getItem('travel-agent-preferences'));
      expect(stored).toEqual(data);
    });
  });

  // === formatPreferencesText ===
  describe('formatPreferencesText', () => {
    it('null 返回空字符串', () => {
      expect(formatPreferencesText(null)).toBe('');
    });

    it('空对象返回空字符串', () => {
      expect(formatPreferencesText({})).toBe('');
    });

    it('只有预算返回预算文本', () => {
      const result = formatPreferencesText({ budget: 5000 });
      expect(result).toBe('💰 ¥5000/人');
    });

    it('只有饮食偏好返回饮食文本', () => {
      const result = formatPreferencesText({ diet: '无辣' });
      expect(result).toBe('🍽️ 无辣');
    });

    it('只有必去景点返回景点文本', () => {
      const result = formatPreferencesText({ mustSee: '西湖' });
      expect(result).toBe('📍 西湖');
    });

    it('只有风格返回风格文本', () => {
      const result = formatPreferencesText({ style: 'relaxed' });
      expect(result).toBe('✨ 休闲度假');
    });

    it('未知风格返回原始值', () => {
      const result = formatPreferencesText({ style: 'unknown' });
      expect(result).toBe('✨ unknown');
    });

    it('多个偏好用 · 连接', () => {
      const result = formatPreferencesText({ budget: 5000, diet: '无辣', style: 'relaxed' });
      expect(result).toContain('💰 ¥5000/人');
      expect(result).toContain('🍽️ 无辣');
      expect(result).toContain('✨ 休闲度假');
      expect(result).toContain(' · ');
    });
  });

  // === formatTravelersText ===
  describe('formatTravelersText', () => {
    it('null 返回空字符串', () => {
      expect(formatTravelersText(null)).toBe('');
    });

    it('空对象返回默认文本', () => {
      expect(formatTravelersText({})).toBe('👥 未设置');
    });

    it('只有成人返回成人文本', () => {
      const result = formatTravelersText({ adults: 2 });
      expect(result).toBe('👥 2成人');
    });

    it('只有老人返回老人文本', () => {
      const result = formatTravelersText({ seniors: 1 });
      expect(result).toBe('👥 1老人');
    });

    it('只有儿童返回儿童文本', () => {
      const result = formatTravelersText({ children: 2 });
      expect(result).toBe('👥 2儿童');
    });

    it('只有婴幼儿返回婴幼儿文本', () => {
      const result = formatTravelersText({ infants: 1 });
      expect(result).toBe('👥 1婴幼儿');
    });

    it('孕妇返回孕妇文本', () => {
      const result = formatTravelersText({ pregnant: true });
      expect(result).toBe('👥 孕妇');
    });

    it('行动不便返回行动不便文本', () => {
      const result = formatTravelersText({ mobilityImpaired: true });
      expect(result).toBe('👥 行动不便');
    });

    it('多个类型用 · 连接', () => {
      const result = formatTravelersText({ adults: 2, children: 1, seniors: 1 });
      expect(result).toContain('2成人');
      expect(result).toContain('1儿童');
      expect(result).toContain('1老人');
      expect(result).toContain(' · ');
    });

    it('所有类型都为 0 或 false 返回默认文本', () => {
      const result = formatTravelersText({ adults: 0, children: 0, seniors: 0, infants: 0, pregnant: false, mobilityImpaired: false });
      expect(result).toBe('👥 未设置');
    });
  });

  // === updateSystemPromptWithTravelers ===
  describe('updateSystemPromptWithTravelers', () => {
    it('agent 为 null 时不报错', () => {
      expect(() => updateSystemPromptWithTravelers()).not.toThrow();
    });
  });

  // === updateSystemPromptWithPreferences ===
  describe('updateSystemPromptWithPreferences', () => {
    it('agent 为 null 时不报错', () => {
      expect(() => updateSystemPromptWithPreferences()).not.toThrow();
    });
  });
});
