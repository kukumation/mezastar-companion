// MEZASTAR Companion Service Worker
const CACHE = 'mezastar-v1';
const CORE = [
  '/',
  '/index.html',
  '/app.js',
  '/style.css',
  '/type_chart.js',
  '/cards.json',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/favicon-32.png',
];

// 安装：缓存核心文件
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 请求拦截：网络优先，失败回退缓存（适合数据更新）
// 图片：缓存优先（节省流量）
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // 只处理同源请求
  if (url.origin !== self.location.origin) return;

  // 卡牌图片：缓存优先
  if (url.pathname.startsWith('/img/')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        return cached || fetch(e.request).then(resp => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return resp;
        }).catch(() => cached);
      })
    );
    return;
  }

  // 核心文件：网络优先，回退缓存
  e.respondWith(
    fetch(e.request).then(resp => {
      if (resp.ok && (e.request.method === 'GET')) {
        const clone = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return resp;
    }).catch(() => caches.match(e.request).then(c => c || caches.match('/index.html')))
  );
});
