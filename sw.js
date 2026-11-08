const CACHE = "story-time-v38";
const SHELL = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "narration.js",
  "icons.js",
  "buddy.js",
  "voice-lab.html",
  "config.js",
  "story.js",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) =>
      cache.addAll(SHELL.map((path) => new Request(path, { cache: "reload" }))),
    ));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!sameOrigin && !isFont) return;
  // סרטונים נטענים בחלקים (Range), וזה לא עובד דרך המטמון. הדפדפן מטפל בהם בעצמו
  if (/\.(webm|mov|mp4)$/.test(url.pathname)) return;
  // כל קובץ נבדק מול השרת, כדי שקבצים ישנים מהמטמון של הדפדפן לא יתערבבו עם חדשים
  const fresh = sameOrigin ? fetch(event.request.url, { cache: "no-cache" }) : fetch(event.request);
  event.respondWith(
    fresh
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
