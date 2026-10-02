/* ═══════════════════════════════════════════════
   sw.js — Service Worker
   策略：应用外壳预缓存 + 运行时缓存（缓存优先）
   目的：装到桌面后断网也能完整使用；数据本身在 localStorage。
   ═══════════════════════════════════════════════ */

const VERSION = 'lifehub-v15';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/utils.js',
  './js/store.js',
  './js/ics.js',
  './js/ai.js',
  './js/parser.js',
  './js/schedule.js',
  './js/nutrition.js',
  './js/wechat.js',
  './js/charts.js',
  './js/blueprint.js',
  './js/history.js',
  './js/views/today.js',
  './js/views/plan.js',
  './js/views/importv.js',
  './js/views/body.js',
  './js/views/money.js',
  './js/views/history.js',
  './js/views/learn.js',
  './js/views/help.js',
  './js/app.js',
  './icons/icon.svg'
];

/* 安装：预缓存外壳 */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => Promise.allSettled(SHELL.map(url => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

/* 激活：清理旧版本缓存 */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== VERSION).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* 请求：缓存优先，网络回填 */
self.addEventListener('fetch', event => {
  const req = event.request;

  // 只处理同源 GET
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // AI 接口等跨域请求不拦（上面已过滤），本域请求走缓存
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) {
        // 后台悄悄更新，下次打开就是新的
        fetch(req).then(res => {
          if (res && res.ok) {
            caches.open(VERSION).then(c => c.put(req, res.clone()));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(req).then(res => {
        if (res && res.ok && res.type === 'basic') {
          const clone = res.clone();
          caches.open(VERSION).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => {
        // 离线兜底：导航请求返回首页
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});

/* 允许页面触发立即更新 */
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});