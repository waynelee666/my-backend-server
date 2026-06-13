// TaskFlow Service Worker — 离线缓存
const CACHE = "taskflow-v1";

// 需要预缓存的静态资源（安装时一次性下载）
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

// 安装：预缓存核心文件
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

// 激活：清理旧缓存
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 请求拦截
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // API 请求：仅走网络
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // 静态资源 & HTML：缓存优先，网络更新
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
        .catch(() => cached); // 断网时用缓存兜底
      return cached || fetched;
    })
  );
});
