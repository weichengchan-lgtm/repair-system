const scope = self.registration.scope;
const cachePrefix = `repair-registration:${scope}:`;
const cacheName = `${cachePrefix}v1`;
const home = new URL("./", scope);
const index = new URL("./index.html", scope);
const offlinePage = new URL("./offline.html", scope);
const stylesheet = new URL("./style.css", scope);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll([
    new Request(offlinePage, { cache: "reload" }),
    new Request(stylesheet, { cache: "reload" }),
  ])));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(cachePrefix) && key !== cacheName)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function fetchWithFallback(request, fallback) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(cacheName);
    return (await cache.match(fallback)) ?? Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== home.origin) return;

  if (request.mode === "navigate" && [home.pathname, index.pathname].includes(url.pathname)) {
    event.respondWith(fetchWithFallback(request, offlinePage));
  } else if (url.pathname === stylesheet.pathname) {
    event.respondWith(fetchWithFallback(request, stylesheet));
  }
});
