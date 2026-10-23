/* ============ NexaChat service worker — offline shell ============ */
var VER = "nexachat-v1.0.0";
var ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./privacy-policy.html",
  "./css/style.css",
  "./js/api.js",
  "./js/markdown.js",
  "./js/app.js",
  "./assets/icon.svg"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(VER).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== VER; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;                       // POST = API calls → network
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;             // cross-origin (OpenRouter) → network

  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(VER).then(function (c) { c.put(req, copy); });
        return res;
      });
    })
  );
});
