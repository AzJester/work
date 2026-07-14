const CACHE_NAME = "work-app-shell-v9";
const APP_SHELL = [
  "./tracker.html",
  "./roadmap.html",
  "./dashboard.html",
  "./geopresence/index.html",
  "./geopresence/data/places-2025.json",
  "./geopresence/data/places-2025.meta.json",
  "./geopresence/data/installations-2024-2025.json",
  "./manifest.webmanifest",
  "./assets/tracker-icon-192.png",
  "./assets/tracker-icon-512.png",
  "./assets/dst-logo-black.png",
  "./assets/dst-logo-white.png",
  "./assets/vendor/supabase-js-2.110.2.umd.js",
];

const GEOPRESENCE_PATH = new URL("./geopresence/", self.location.href).pathname;
const GEOPRESENCE_ROOT = GEOPRESENCE_PATH.replace(/\/$/, "");

function navigationFallback(url) {
  // GeoPresence is an independent application. Never substitute the tracker
  // shell for one of its routes when the network is unavailable.
  if (url.pathname === GEOPRESENCE_ROOT) {
    const canonical = new URL(GEOPRESENCE_PATH, url.origin);
    canonical.search = url.search;
    return Response.redirect(canonical.href, 302);
  }
  if (url.pathname.startsWith(GEOPRESENCE_PATH)) {
    return caches.match("./geopresence/index.html");
  }
  if (url.pathname.endsWith("roadmap.html")) return caches.match("./roadmap.html");
  if (url.pathname.endsWith("dashboard.html")) return caches.match("./dashboard.html");
  return caches.match("./tracker.html");
}

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("work-app-shell-") && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const exact = await caches.match(request);
          if (exact) return exact;
          return navigationFallback(url);
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const refresh = fetch(request).then(response => {
        if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
        return response;
      }).catch(() => cached);
      return cached || refresh;
    })
  );
});
