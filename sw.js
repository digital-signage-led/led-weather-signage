/* 公開プレーヤーを止めないよう、導入済み SW は破棄する */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: "window" });
    for (const client of clients) {
      if (client && typeof client.navigate === "function") {
        try { client.navigate(client.url); } catch { /* ignore */ }
      }
    }
  })());
});
