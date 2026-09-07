const CACHE = "kinetexa-public-shell-v1";
const ASSETS = [
  "/offline.html",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      for (const path of ASSETS) {
        const response = await fetch(path, {
          cache: "reload",
          redirect: "error",
        });
        if (
          !response.ok ||
          response.headers.get("x-kinetexa-public-asset") !== "1"
        )
          throw new Error("Public offline asset unavailable");
        await cache.put(path, response);
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith("kinetexa-public-shell-") && key !== CACHE)
          await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (
    request.method !== "GET" ||
    request.mode !== "navigate" ||
    new URL(request.url).origin !== self.location.origin
  )
    return;
  // Authenticated pages, API responses and training data are never cached.
  event.respondWith(
    fetch(request).catch(
      async () =>
        (await caches.match("/offline.html", { cacheName: CACHE })) ||
        new Response("Kinetexa is offline. Reconnect and reload to continue.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        }),
    ),
  );
});
