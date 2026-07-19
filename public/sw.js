// Minimal service worker for installable-PWA support.
// Deliberately does NOT cache navigations or API/auth responses — caching
// prediction data or auth state would risk staleness and privacy leaks.
// It only satisfies the PWA installability requirement and cleans up old caches.

const CACHE = "caliber-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

// Network-only passthrough. Kept intentionally minimal for v1.
self.addEventListener("fetch", () => {
  // No-op: let the browser handle requests normally.
});
