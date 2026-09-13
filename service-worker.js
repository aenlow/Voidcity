/* =====================================================================
   Void City — service worker
   Precaches the whole game on install, then serves it cache-first so the
   second visit (and every offline one) starts instantly. Updated files are
   fetched in the background and picked up on the next launch.

   Bump CACHE_VERSION whenever you ship changes, otherwise returning players
   keep the old build until their browser evicts it.
   ===================================================================== */

const CACHE_VERSION = 'v1.0.1';
const CACHE_NAME = `voidcity-${CACHE_VERSION}`;

/** Everything needed to play with the network switched off. */
const PRECACHE = [
  './',
  'index.html',
  'style.css',
  'game.js',
  'manifest.json',

  'js/core/rng.js',
  'js/core/utils.js',
  'js/core/spatial.js',
  'js/core/storage.js',
  'js/core/audio.js',
  'js/core/input.js',
  'js/world/objectTypes.js',
  'js/world/maps.js',
  'js/world/worldgen.js',
  'js/world/customMap.js',
  'js/entities/void.js',
  'js/entities/ai.js',
  'js/fx/particles.js',
  'js/render/camera.js',
  'js/render/renderer.js',
  'js/game/engine.js',
  'js/game/progression.js',
  'js/ui/ui.js',

  'maps/suburbs.json',
  'maps/downtown.json',
  'maps/industrial.json',
  'maps/sample-plaza.json',
  'maps/sample-spiral.json',

  'assets/icons/favicon.png',
  'assets/icons/icon-48.png',
  'assets/icons/icon-72.png',
  'assets/icons/icon-96.png',
  'assets/icons/icon-128.png',
  'assets/icons/icon-144.png',
  'assets/icons/icon-152.png',
  'assets/icons/icon-180.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-256.png',
  'assets/icons/icon-384.png',
  'assets/icons/icon-512.png',
  'assets/icons/maskable-192.png',
  'assets/icons/maskable-512.png',
  'assets/icons/splash-1290x2796.png',
  'assets/icons/splash-1170x2532.png',
  'assets/icons/splash-1536x2048.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // addAll() fails the whole install if one file 404s, so add them
      // individually: a missing splash image shouldn't break offline play.
      await Promise.all(
        PRECACHE.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch((err) => {
            console.warn('[Void City] could not precache', url, err);
          })
        )
      );
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch third parties

  // Navigations: try the network briefly so updates land, fall back to the
  // cached shell. This is what makes the installed app open with no signal.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put('index.html', fresh.clone());
          return fresh;
        } catch (err) {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match('index.html')) || (await cache.match('./')) || Response.error();
        }
      })()
    );
    return;
  }

  // Everything else: cache first, refresh in the background.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      return hit || (await network) || new Response('Offline', { status: 503, statusText: 'Offline' });
    })()
  );
});

/** Lets the page ask for an immediate update: reg.waiting.postMessage('skip-waiting') */
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
