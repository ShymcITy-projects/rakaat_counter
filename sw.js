const PREFIX = 'rakaat-' + encodeURIComponent(new URL('./', self.location.href).pathname) + '-';
const SHELL = PREFIX + 'shell-v3.0.0';
const ASSETS = PREFIX + 'assets-mp-0.10.14';
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const LOCAL = ['./', './index.html', './detector.mjs', './manifest.webmanifest'];
const ICONS = ['./icon-192.png', './icon-512.png', './apple-touch-icon.png'];
const REMOTE = [MP + '/vision_bundle.mjs', MP + '/wasm/vision_wasm_internal.js',
  MP + '/wasm/vision_wasm_internal.wasm', MP + '/wasm/vision_wasm_nosimd_internal.js',
  MP + '/wasm/vision_wasm_nosimd_internal.wasm', MODEL];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    // A complete shell is required; optional icons must not block installation.
    await shell.addAll(LOCAL.map(url => new Request(url, {cache: 'reload'})));
    await Promise.allSettled(ICONS.map(url => shell.add(new Request(url, {cache: 'reload'}))));
    const assets = await caches.open(ASSETS);
    await Promise.allSettled(REMOTE.map(async url => {
      if (!(await assets.match(url))) await assets.add(url);
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Never delete caches belonging to other applications on this origin.
    for (const key of await caches.keys()) {
      if (key.startsWith(PREFIX) && key !== SHELL && key !== ASSETS) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const remote = url.href === MODEL || url.href.startsWith(MP + '/');
  const local = url.origin === self.location.origin && url.pathname.startsWith(new URL('./', self.location.href).pathname);
  if (!remote && !local) return;
  event.respondWith((async () => {
    const cache = await caches.open(remote ? ASSETS : SHELL);
    const hit = await cache.match(req, remote ? {} : {ignoreSearch: true});
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok) await cache.put(req, res.clone());
      return res;
    } catch (err) {
      if (local && req.mode === 'navigate') {
        const index = await cache.match('./index.html');
        if (index) return index;
      }
      throw err;
    }
  })());
});
