const cacheName = "synapse-shell-__SYNAPSE_SHELL_VERSION__";
self.addEventListener("install", (event) =>
  event.waitUntil(
    (async () => {
      const r = await fetch("/tablet-precache.json", { cache: "no-store" });
      if (!r.ok) throw Error("Offline manifest unavailable");
      const list = await r.json();
      const cache = await caches.open(cacheName);
      await cache.addAll(list.files);
      await cache.put("/tablet/", await cache.match("/index.html"));
    })(),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      const names = (await caches.keys()).filter((n) =>
        n.startsWith("synapse-shell-"),
      );
      for (const name of names.slice(0, -2))
        if (name !== cacheName) await caches.delete(name);
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    url.origin !== location.origin ||
    event.request.method !== "GET" ||
    url.pathname.startsWith("/api/")
  )
    return;
  if (url.pathname.startsWith("/tablet/files/")) {
    event.respondWith(
      caches
        .open("synapse-media-v1")
        .then(
          async (c) =>
            (await c.match(url.pathname)) ||
            new Response("Attachment not available offline", { status: 404 }),
        ),
    );
    return;
  }
  if (event.request.mode === "navigate" && url.pathname.startsWith("/tablet")) {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cache = await caches.open(cacheName);
        return (
          (await cache.match("/tablet/")) ||
          new Response("Open Synapse online once to install offline support.", {
            status: 503,
          })
        );
      }),
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((r) => r || fetch(event.request)),
  );
});
