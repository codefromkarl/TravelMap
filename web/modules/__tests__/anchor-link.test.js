/**
 * anchor-link.js 单元测试
 *
 * 测试地图-聊天双向锚定：
 * - makeAnchorId - 生成锚点 ID
 * - injectAttractionAnchors - 注入锚点
 * - scrollToAttraction - 滚动到景点
 * - registerMarker / clearMarkerRegistry - marker 注册
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock showToast
vi.mock('../context.js', () => ({
  showToast: vi.fn(),
}));

// 导入被测模块
import {
  makeAnchorId,
  injectAttractionAnchors,
  scrollToAttraction,
  registerMarker,
  clearMarkerRegistry,
  focusMarker,
} from '../anchor-link.js';

// ─── 测试 ─────────────────────────────────────────────

describe('anchor-link.js', () => {
  describe('makeAnchorId', () => {
    it('应生成有效的锚点 ID', () => {
      const id = makeAnchorId('西湖');
      expect(id).toBe('attr-西湖');
    });

    it('应处理空格', () => {
      const id = makeAnchorId('杭州 西湖');
      // 空格被替换为连字符
      expect(id).toContain('attr-');
      expect(id).toContain('杭州');
      expect(id).toContain('西湖');
    });

    it('应处理特殊字符', () => {
      const id = makeAnchorId('西湖（杭州）');
      expect(id).toContain('attr-');
      expect(id).toContain('西湖');
    });

    it('应处理英文名', () => {
      const id = makeAnchorId('West Lake');
      expect(id).toContain('attr-');
      expect(id).toContain('West');
      expect(id).toContain('Lake');
    });
  });

  describe('injectAttractionAnchors', () => {
    it('无景点名时返回原 HTML', () => {
      const html = '<p>这是一段文本</p>';
      expect(injectAttractionAnchors(html, [])).toBe(html);
      expect(injectAttractionAnchors(html, null)).toBe(html);
    });

    it('应为景点名添加锚点', () => {
      const html = '<p>推荐景点：西湖、灵隐寺</p>';
      const result = injectAttractionAnchors(html, ['西湖', '灵隐寺']);

      expect(result).toContain('attr-西湖');
      expect(result).toContain('attr-灵隐寺');
      expect(result).toContain('attraction-anchor');
    });

    it('应保留原始 HTML 结构', () => {
      const html = '<p>推荐景点：<strong>西湖</strong></p>';
      const result = injectAttractionAnchors(html, ['西湖']);

      expect(result).toContain('<strong>');
    });

    it('不重复添加锚点', () => {
      const html = '<p>西湖很美</p>';
      const result1 = injectAttractionAnchors(html, ['西湖']);
      const result2 = injectAttractionAnchors(result1, ['西湖']);

      // 不应重复添加
      expect(result2.match(/attraction-anchor/g)?.length || 0).toBeLessThanOrEqual(1);
    });
  });

  describe('scrollToAttraction', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div id="chat-container">
          <span id="attr-西湖" class="attraction-anchor" data-name="西湖">西湖</span>
        </div>
      `;
    });

    afterEach(() => {
      document.body.innerHTML = '';
    });

    it('应滚动到锚点', () => {
      const anchor = document.getElementById('attr-西湖');
      anchor.scrollIntoView = vi.fn();

      scrollToAttraction('西湖');

      expect(anchor.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'center',
      });
    });

    it('应添加高亮 class', () => {
      const anchor = document.getElementById('attr-西湖');
      anchor.scrollIntoView = vi.fn();

      scrollToAttraction('西湖');

      expect(anchor.classList.contains('attraction-highlight')).toBe(true);
    });

    it('无锚点时返回 false', () => {
      const result = scrollToAttraction('不存在的景点');
      expect(result).toBe(false);
    });
  });

  describe('registerMarker / clearMarkerRegistry', () => {
    it('应注册 marker', () => {
      const mockMarker = {
        getLatLng: vi.fn(() => ({ lat: 30, lng: 120 })),
        openPopup: vi.fn(),
      };
      const mockMap = {
        setView: vi.fn(),
      };

      registerMarker('西湖', mockMarker, mockMap);

      // 验证注册
      const result = focusMarker('西湖');
      expect(result).toBe(true);
      expect(mockMap.setView).toHaveBeenCalled();
    });

    it('应清除所有注册', () => {
      clearMarkerRegistry();

      const result = focusMarker('西湖');
      expect(result).toBe(false);
    });

    it('无注册时返回 false', () => {
      clearMarkerRegistry();

      const result = focusMarker('不存在的景点');
      expect(result).toBe(false);
    });
  });

  describe('focusMarker', () => {
    beforeEach(() => {
      clearMarkerRegistry();
    });

    it('应聚焦到 marker', () => {
      const mockMarker = {
        getLatLng: vi.fn(() => ({ lat: 30, lng: 120 })),
        openPopup: vi.fn(),
      };
      const mockMap = {
        setView: vi.fn(),
      };

      registerMarker('西湖', mockMarker, mockMap);

      const result = focusMarker('西湖', { zoom: 15 });

      expect(result).toBe(true);
      expect(mockMap.setView).toHaveBeenCalledWith({ lat: 30, lng: 120 }, 15);
      expect(mockMarker.openPopup).toHaveBeenCalled();
    });

    it('可选不打开 popup', () => {
      const mockMarker = {
        getLatLng: vi.fn(() => ({ lat: 30, lng: 120 })),
        openPopup: vi.fn(),
      };
      const mockMap = {
        setView: vi.fn(),
      };

      registerMarker('西湖', mockMarker, mockMap);

      focusMarker('西湖', { openPopup: false });

      expect(mockMarker.openPopup).not.toHaveBeenCalled();
    });
  });
});
