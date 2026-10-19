// OKINAWA 2026 離線快取 Service Worker
// 每次修改 index.html、js/、data/ 任何檔案後，必須把 CACHE_VERSION 的數字加 1
const CACHE_VERSION = 'okinawa-2026-v3-003';
const TAILWIND_URL = 'https://cdn.tailwindcss.com/3.4.17';
const LOCAL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './js/sync.js',
  './js/model.js',
  './js/app.js',
  './data/places.js',
  './data/flashcards.js',
  './data/culture.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(LOCAL_ASSETS);
    // Tailwind CDN 沒有 CORS 標頭，用 no-cors 取得後存成不透明回應
    const tw = await fetch(new Request(TAILWIND_URL, { mode: 'no-cors' }));
    await cache.put(TAILWIND_URL, tw);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return; // 同步 API 一律 POST，不經過快取
  const url = new URL(req.url);

  // 頁面本身：先連網拿最新版，失敗時用快取
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_VERSION);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (e) {
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // 自己網站的檔案與 Tailwind：先用快取，沒有再連網
  if (url.origin === self.location.origin || req.url === TAILWIND_URL) {
    event.respondWith((async () => {
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) return cached;
      return fetch(req);
    })());
  }
  // 其他網域（天氣、匯率、Google 地圖）不處理，由瀏覽器直接連線
});
