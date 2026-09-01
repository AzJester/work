const CACHE_NAME = "solution-architect-workbench-v13";
const SHELL = [
  "./",
  "./index.html",
  "./guide.html",
  "./guide.js",
  "./theme-init.js",
  "./styles.css",
  "./print-package.css",
  "./engine.js",
  "./capture.js",
  "./ingestion.js",
  "./ingestion-worker.js",
  "./export-docx.js",
  "./export-pdf.js",
  "./export-xlsx.js",
  "./knowledge-base.js",
  "./knowledge-import.js",
  "./assets/solution-knowledge-base-import-template.xlsx",
  "./app.js",
  "./icon.svg",
  "./og-card.png",
  "./vendor/pdf-6.3.289.min.mjs",
  "./vendor/pdf.worker-6.3.289.min.mjs",
  "./vendor/PDFJS-LICENSE.txt",
  "./vendor/pdf-lib-1.17.1.min.js",
  "./vendor/PDF-LIB-LICENSE.txt",
  "./vendor/README.md",
  "../black-hat-agent/vendor/xlsx.full.min.js",
  "../black-hat-agent/vendor/SHEETJS-LICENSE.txt",
  "../assets/vendor/supabase-js-2.110.2.umd.js"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("solution-architect-workbench-") && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.includes("/functions/v1/")) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok && ["document", "script", "style", "image", "worker"].includes(request.destination)) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        if (request.mode === "navigate") return caches.match("./index.html");
        return Response.error();
      })
  );
});
