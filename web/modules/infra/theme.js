/**
 * 主题模块 — 暗黑模式支持
 *
 * - 手动切换（头部按钮）+ localStorage 持久化
 * - 未设置时跟随系统 prefers-color-scheme
 * - 通过 <html data-theme="dark"> 驱动 CSS 变量覆盖
 */

const THEME_KEY = 'travel-agent-theme';

function systemTheme() {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

export function getStoredTheme() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
}

export function getTheme() {
  return getStoredTheme() ?? systemTheme();
}

export function applyTheme(theme) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', theme === 'dark' ? '#0f172a' : '#4f8ef7');
  }
}

export function setTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // 隐私模式下忽略
  }
  applyTheme(theme);
  const btn = document.getElementById('btn-theme');
  if (btn) {
    btn.setAttribute('aria-label', theme === 'dark' ? '切换到浅色模式' : '切换到深色模式');
    btn.classList.toggle('is-dark', theme === 'dark');
  }
  document.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
}

export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

export function initTheme() {
  applyTheme(getTheme());
  const btn = document.getElementById('btn-theme');
  btn?.addEventListener('click', () => toggleTheme());
  // 跟随系统变化（用户未手动设置时）
  if (typeof window !== 'undefined' && window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
      if (!getStoredTheme()) applyTheme(event.matches ? 'dark' : 'light');
    });
  }
}
