/**
 * PWA — Service Worker 注册
 *
 * 仅在生产（https + 非 localhost）注册，避免影响本地开发。
 * SW 采用运行时缓存策略 + 构建期注入预缓存清单（见 web/sw.js），部署工件首次访问即可离线可用。
 */

export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:') return;
  if (['localhost', '127.0.0.1'].includes(location.hostname)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[PWA] Service Worker 注册失败:', err);
    });
  });
}
