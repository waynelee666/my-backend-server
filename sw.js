// TaskFlow Service Worker — 离线缓存 v2
// 🔧 改这个版本号 → 所有客户端自动更新
const CACHE = "taskflow-v5";

// 需要预缓存的静态资源
const PRECACHE = [
  "/",
  "/index.html",
  "/login.html",
  "/style.css",
  "/script.js",
  "/auth.js",
  "/chat.js",
  "/calc.js",
  "/supabase.min.js",
  "/icon.png",
  "/manifest.json",
];

// 安装：预缓存核心文件，立即接管
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting(); // 新 SW 立即激活，不等待旧 SW 释放
});

// 激活：清理所有旧版本缓存
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim(); // 立即接管所有页面
});

// 请求拦截：网络优先，缓存兜底
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // API 请求：仅走网络，不缓存
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // HTML 文件：网络优先（确保拿到最新版本）
  if (e.request.destination === "document" || url.pathname.endsWith(".html")) {
    e.respondWith(
      fetch(e.request)
        .then((resp) => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE).then((cache) => cache.put(e.request, clone));
          }
          return resp;
        })
        .catch(() => caches.match(e.request)) // 断网兜底
    );
    return;
  }

  // JS/CSS/图片等：缓存优先，网络更新（后台静默刷新）
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetched = fetch(e.request)
        .then((resp) => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE).then((cache) => cache.put(e.request, clone));
          }
          return resp;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});

// 收到更新通知时，告知页面有新版本可用
self.addEventListener("message", (e) => {
  if (e.data === "skipWaiting") {
    self.skipWaiting();
  }
});
