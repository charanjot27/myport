/* JOTR service worker: makes the installed app start instantly and open offline.
 * Pages: network first, falling back to the last copy. Built assets (hashed names,
 * never change): cache first. Everything else (API, speech, models) goes straight
 * to the network, untouched. */
const CACHE = "jotr-v1";
const SHELL = ["/", "/app", "/site.webmanifest", "/favicon.svg", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Pages: always try the network so updates show up at once; offline, use the saved copy.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(url.pathname === "/" ? "/" : "/app", copy));
          }
          return res;
        })
        .catch(() => caches.match(url.pathname === "/" ? "/" : "/app").then((r) => r || caches.match("/"))),
    );
    return;
  }

  // Hashed build assets never change: serve from cache, fill it on first use.
  if (url.pathname.startsWith("/assets/")) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
