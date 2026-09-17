/* サイネージ固定素材の stale-while-revalidate。気象庁 API は触らない。 */
const CACHE_VERSION = "weather-signage-pref521";

const PRECACHE = [
  "./",
  "./index.html",
  "./css/base.css",
  "./css/weather.css",
  "./js/app.js",
  "./js/weather-cache.js",
  "./data/weather.json",
  "./data/locations.json",
  "./data/regions.json",
  "./data/contents.json",
  "./data/attribution.json",
  "./data/map-projection.json",
  "./data/layout-defaults.json",
  "./maps/japan.svg",
  "./icons/jma/100.svg",
  "./icons/jma/101.svg",
  "./icons/jma/102.svg",
  "./icons/jma/200.svg",
  "./icons/jma/201.svg",
  "./icons/jma/202.svg",
  "./icons/jma/300.svg",
  "./icons/jma/400.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => null)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

function isJma(url) {
  return url.hostname === "www.jma.go.jp" || url.hostname.endsWith(".jma.go.jp");
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request).then((response) => {
    if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
    return response;
  }).catch(() => cached);
  return cached || network;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (isJma(url)) return;
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  event.respondWith(staleWhileRevalidate(event.request));
});
