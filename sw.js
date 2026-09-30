// Offline app shell. Same-origin files are network-first (so updates land immediately) with a cache
// fallback; Google Fonts are cache-first. Supabase calls are cross-origin and never cached.
const CACHE = 'hisaab-v8';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'css/tokens.css', 'css/base.css', 'css/components.css',
  'src/main.js', 'src/config.js', 'src/store.js', 'src/actions.js',
  'src/lib/dom.js', 'src/lib/format.js', 'src/lib/icons.js', 'src/lib/toast.js',
  'src/services/ai.js', 'src/services/auth.js', 'src/services/profile.js', 'src/services/api.js', 'src/services/expenses.js', 'src/services/speech.js',
  'src/parser/index.js', 'src/parser/numbers.js',
  'src/ui/auth.js', 'src/ui/profile.js', 'src/ui/edit.js', 'src/ui/home.js','src/ui/insights.js', 'src/ui/month.js', 'src/ui/rows.js', 'src/ui/sheet.js', 'src/ui/tabs.js',
  'assets/icons/icon-192.png', 'assets/icons/icon-512.png',
];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const cacheable = (res) => res.ok || res.type === 'opaque';

async function networkFirst(request) {
  try {
    const res = await fetch(request);
    if (cacheable(res)) (await caches.open(CACHE)).put(request, res.clone());
    return res;
  } catch {
    return (await caches.match(request)) || (request.mode === 'navigate' ? caches.match('index.html') : Response.error());
  }
}

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (cacheable(res)) (await caches.open(CACHE)).put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === location.origin) event.respondWith(networkFirst(request));
  else if (FONT_HOSTS.includes(url.hostname)) event.respondWith(cacheFirst(request));
});
