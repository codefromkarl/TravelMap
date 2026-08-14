/**
 * TravelMap Service Worker — 运行时缓存策略
 *
 * 策略：
 * - 内容哈希资产（文件名含 .<8位hex>.js/.css）与 vendor/ 静态资源 → cache-first
 * - 页面导航 / HTML → network-first（离线时回退缓存）
 * - 其余同源 GET（API 除外）→ stale-while-revalidate
 * - /api/* 一律走网络（不缓存）
 */

const CACHE_NAME = 'travelmap-v1';

const HASHED_ASSET = /\.[0-9a-f]{8}\.(?:js|css)$/;
const VENDOR_ASSET = /^\/vendor\//;
const NAVIGATION = /^\/(?:index\.html)?$/;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // 内容哈希资产：cache-first，几乎不会失效
  if (HASHED_ASSET.test(url.pathname) || VENDOR_ASSET.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const clone = response.clone();
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, clone);
        }
        return response;
      })(),
    );
    return;
  }

  // 导航 / HTML：network-first，离线回退缓存
  if (NAVIGATION.test(url.pathname) || request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const clone = response.clone();
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, clone);
          }
          return response;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          const fallback = await caches.match('/');
          if (fallback) return fallback;
          return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
        }
      })(),
    );
    return;
  }

  // 其他同源 GET：stale-while-revalidate
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      const network = fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
      return cached || network;
    })(),
  );
});
