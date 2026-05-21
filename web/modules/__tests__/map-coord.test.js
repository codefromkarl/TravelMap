/**
 * map.js 单元测试 - 坐标转换
 *
 * 测试坐标系转换函数：
 * - gcj02ToWgs84 - GCJ-02 转 WGS-84
 * - streamingMapParser - 流式文本解析
 * - resetStreamingParser - 重置解析器
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock 依赖
vi.mock('../context.js', () => ({
  showToast: vi.fn(),
  getAmapKey: vi.fn(() => 'test-key'),
  getAmapGeoKey: vi.fn(() => 'test-geo-key'),
  SUPPLY_COLORS: {},
  CITY_CENTERS: { '杭州': [30.2741, 120.1551] },
  RISK_COLORS: { 1: { stroke: '#22c55e', bg: '#f0fdf4', label2: '低风险' } },
  isDomesticCityForMap: vi.fn(() => true),
  chatPanel: null,
  currentLang: 'zh',
}));

vi.mock('../i18n.js', () => ({
  I18N: {},
}));

vi.mock('../db.js', () => ({
  loadSupplyPointsFromCache: vi.fn(),
  saveSupplyPointsToCache: vi.fn(),
}));

// Mock Leaflet
global.L = {
  map: vi.fn(() => ({
    setView: vi.fn(),
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    invalidateSize: vi.fn(),
    getCenter: vi.fn(() => ({ lat: 30, lng: 120 })),
    getZoom: vi.fn(() => 12),
    on: vi.fn(),
  })),
  tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
  marker: vi.fn(() => ({
    addTo: vi.fn(),
    bindPopup: vi.fn(),
    on: vi.fn(),
  })),
  divIcon: vi.fn(),
  polyline: vi.fn(() => ({
    addTo: vi.fn(),
  })),
  popup: vi.fn(() => ({
    setLatLng: vi.fn(),
    setContent: vi.fn(),
    openOn: vi.fn(),
  })),
  control: {
    zoom: vi.fn(() => ({ addTo: vi.fn() })),
  },
};

// 导入被测模块
import { gcj02ToWgs84, streamingMapParser, resetStreamingParser } from '../map.js';

// ─── 测试 ─────────────────────────────────────────────

describe('map.js - 坐标转换', () => {
  describe('gcj02ToWgs84', () => {
    it('中国境外坐标不变', () => {
      // 东京（日本）
      const result = gcj02ToWgs84(35.6762, 139.6503);
      expect(result.lat).toBe(35.6762);
      expect(result.lng).toBe(139.6503);
    });

    it('中国境内坐标有偏移', () => {
      // 杭州
      const result = gcj02ToWgs84(30.2741, 120.1551);
      // GCJ-02 转 WGS-84 会有小偏移
      expect(result.lat).not.toBe(30.2741);
      expect(result.lng).not.toBe(120.1551);
    });

    it('偏移量在合理范围内', () => {
      const result = gcj02ToWgs84(30.2741, 120.1551);
      const latDiff = Math.abs(result.lat - 30.2741);
      const lngDiff = Math.abs(result.lng - 120.1551);
      // 偏移量通常在 0.001-0.01 度之间
      expect(latDiff).toBeLessThan(0.05);
      expect(lngDiff).toBeLessThan(0.05);
    });

    it('零坐标处理', () => {
      const result = gcj02ToWgs84(0, 0);
      expect(result.lat).toBe(0);
      expect(result.lng).toBe(0);
    });
  });

  describe('streamingMapParser', () => {
    beforeEach(() => {
      resetStreamingParser();
    });

    it('空文本不报错', () => {
      expect(() => streamingMapParser('')).not.toThrow();
    });

    it('普通文本不报错', () => {
      expect(() => streamingMapParser('这是一段普通文本')).not.toThrow();
    });

    it('包含景点名的文本不报错', () => {
      expect(() => streamingMapParser('推荐景点：西湖、灵隐寺')).not.toThrow();
    });
  });

  describe('resetStreamingParser', () => {
    it('重置不报错', () => {
      expect(() => resetStreamingParser()).not.toThrow();
    });

    it('多次重置不报错', () => {
      expect(() => {
        resetStreamingParser();
        resetStreamingParser();
        resetStreamingParser();
      }).not.toThrow();
    });
  });
});
