// Minimal service worker: exists so the tracker is installable as a PWA.
// No caching — the app is cloud-backed and should always load fresh.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
