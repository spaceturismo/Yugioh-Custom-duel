const CACHE_NAME = "custom-duel-v2";
const APP_SHELL = [
    "./",
    "./index.html",
    "./builder.html",
    "./duel.html",
    "./client/duel-model.js",
    "./client/card-catalog.js",
    "./client/storage.js",
    "./client/duel-state.js",
    "./client/multiplayer.js",
    "./client/deck-storage.js",
    "./client/card-data.js",
    "./client/lobby.js",
    "./client/duel-sync.js",
    "./client/duel-view.js",
    "./manifest.webmanifest",
    "./icons/icon.svg"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
    );
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys
                .filter((key) => key !== CACHE_NAME)
                .map((key) => caches.delete(key))
        ))
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") return;

    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;

            return fetch(event.request).then((response) => {
                if (!response || response.status !== 200 || response.type === "opaque") {
                    return response;
                }

                const copy = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                return response;
            });
        })
    );
});

self.addEventListener("message", (event) => {
    if (event.data && event.data.type === "SKIP_WAITING") {
        self.skipWaiting();
    }
});