// Service worker template. The build fills in the version and the file list
// (see vite.config.ts), then emits this as sw.js next to index.html.
// The cache prefix keeps the app's first name, Kelma, so that old caches are still found and removed.
const CACHE = 'kelma-__VERSION__';
const PRECACHE = __PRECACHE__;
const SHELL = new URL('./', self.location).href;
const NAVIGATION_TIMEOUT_MS = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('kelma-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function cachedShell() {
  return caches.open(CACHE).then((cache) => cache.match(SHELL));
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Online: always the newest page. Offline or on a stalled connection: the saved one.
    event.respondWith(
      new Promise((resolve) => {
        const fallback = () => cachedShell().then((hit) => resolve(hit || Response.error()));
        const timer = setTimeout(fallback, NAVIGATION_TIMEOUT_MS);
        fetch(request).then(
          (response) => {
            clearTimeout(timer);
            resolve(response);
          },
          () => {
            clearTimeout(timer);
            fallback();
          },
        );
      }),
    );
    return;
  }

  event.respondWith(caches.match(request).then((hit) => hit || fetch(request)));
});
