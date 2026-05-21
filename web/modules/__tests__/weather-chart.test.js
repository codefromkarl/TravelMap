/**
 * weather-chart.js 单元测试
 *
 * 测试天气图表逻辑：
 * - renderWeatherChart - 渲染天气图表
 * - mountWeatherChart - 挂载到 DOM
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// 导入被测模块
import { renderWeatherChart, mountWeatherChart } from '../weather-chart.js';

// ─── 测试数据 ─────────────────────────────────────────

const MOCK_WEATHER = [
  {
    date: '2025-06-01',
    dayWeather: '晴',
    dayTemp: 28,
    nightWeather: '多云',
    nightTemp: 18,
  },
  {
    date: '2025-06-02',
    dayWeather: '多云',
    dayTemp: 26,
    nightWeather: '阴',
    nightTemp: 17,
  },
  {
    date: '2025-06-03',
    dayWeather: '小雨',
    dayTemp: 22,
    nightWeather: '小雨',
    nightTemp: 16,
  },
];

// ─── 测试 ─────────────────────────────────────────────

describe('weather-chart.js', () => {
  describe('renderWeatherChart', () => {
    it('空数据返回空字符串', () => {
      expect(renderWeatherChart([])).toBe('');
      expect(renderWeatherChart(null)).toBe('');
      expect(renderWeatherChart(undefined)).toBe('');
    });

    it('有效数据返回 SVG 字符串', () => {
      const svg = renderWeatherChart(MOCK_WEATHER);
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
    });

    it('SVG 包含温度数据', () => {
      const svg = renderWeatherChart(MOCK_WEATHER);
      expect(svg).toContain('28°');
      expect(svg).toContain('26°');
      expect(svg).toContain('22°');
    });

    it('SVG 包含天气图标', () => {
      const svg = renderWeatherChart(MOCK_WEATHER);
      expect(svg).toContain('☀️'); // 晴
      expect(svg).toContain('⛅'); // 多云
      expect(svg).toContain('🌦️'); // 小雨
    });

    it('SVG 包含日期标签', () => {
      const svg = renderWeatherChart(MOCK_WEATHER);
      expect(svg).toContain('06-01');
      expect(svg).toContain('06-02');
      expect(svg).toContain('06-03');
    });

    it('SVG 包含图例', () => {
      const svg = renderWeatherChart(MOCK_WEATHER);
      expect(svg).toContain('白天');
      expect(svg).toContain('夜间');
    });

    it('单日数据仍返回有效 SVG', () => {
      const singleDay = [MOCK_WEATHER[0]];
      const svg = renderWeatherChart(singleDay);
      expect(svg).toContain('<svg');
      expect(svg).toContain('28°');
    });

    it('无温度数据返回空字符串', () => {
      const noTemp = [{ date: '2025-06-01', dayWeather: '晴' }];
      const svg = renderWeatherChart(noTemp);
      expect(svg).toBe('');
    });
  });

  describe('mountWeatherChart', () => {
    it('应挂载 SVG 到指定容器', () => {
      const container = document.createElement('div');
      container.id = 'weather-container';
      document.body.appendChild(container);

      mountWeatherChart('weather-container', MOCK_WEATHER);

      expect(container.querySelector('svg')).not.toBeNull();

      document.body.removeChild(container);
    });

    it('空数据时不挂载', () => {
      const container = document.createElement('div');
      container.id = 'weather-container-2';
      container.innerHTML = '<p>旧内容</p>';
      document.body.appendChild(container);

      mountWeatherChart('weather-container-2', []);

      // 空数据时不修改容器
      expect(container.innerHTML).toBe('<p>旧内容</p>');

      document.body.removeChild(container);
    });

    it('容器不存在时不报错', () => {
      expect(() => mountWeatherChart('nonexistent', MOCK_WEATHER)).not.toThrow();
    });
  });
});
