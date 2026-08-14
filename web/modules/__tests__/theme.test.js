/**
 * theme.js 单元测试
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let module;
let themeKey = 'travel-agent-theme';

beforeEach(async () => {
  localStorage.clear();
  // 恢复 DOM
  document.documentElement.removeAttribute('data-theme');
  const btn = document.createElement('button');
  btn.id = 'btn-theme';
  document.body.appendChild(btn);
  module = await import('../infra/theme.js');
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('theme.js', () => {
  it('applyTheme 设置 data-theme 属性', () => {
    module.applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    module.applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('setTheme 持久化到 localStorage 并更新按钮状态', () => {
    module.setTheme('dark');
    expect(localStorage.getItem(themeKey)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    const btn = document.getElementById('btn-theme');
    expect(btn.classList.contains('is-dark')).toBe(true);
  });

  it('getTheme 优先使用存储值，其次跟随系统', () => {
    expect(module.getTheme()).toBe('light'); // jsdom 默认 light
    localStorage.setItem(themeKey, 'dark');
    expect(module.getTheme()).toBe('dark');
  });

  it('initTheme 绑定切换按钮并应用当前主题', () => {
    localStorage.setItem(themeKey, 'dark');
    module.initTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    const btn = document.getElementById('btn-theme');
    btn.click();
    expect(localStorage.getItem(themeKey)).toBe('light');
  });

  it('toggleTheme 在两种主题间切换', () => {
    module.setTheme('light');
    const next = module.toggleTheme();
    expect(next).toBe('dark');
    expect(localStorage.getItem(themeKey)).toBe('dark');
  });
});
