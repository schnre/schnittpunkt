// Offline-Cache.
// - Seiten und Firmendaten: zuerst Netzwerk (Updates kommen sofort an), sonst Cache.
// - App-Dateien haben Hash-Namen von Vite und ändern sich nie: zuerst Cache.
// - Karte von swisstopo (Vektorkacheln, Schriften, Symbole, Luftbild): Cache mit Obergrenze, damit
//   besuchte Gebiete offline sichtbar bleiben. Die Stil-Dateien (style.json) haben keine Version im
//   Pfad: sofort aus dem Cache, im Hintergrund aktualisiert.
const CACHE = 'schnittpunkt-v2';
const KACHELN = 'sct-kacheln-v2';
const MAX_KACHELN = 4000;
const KARTEN_HOSTS = ['vectortiles.geo.admin.ch', 'wmts.geo.admin.ch'];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== KACHELN).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function netzZuerst(req) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
    return res;
  } catch {
    return (await caches.match(req, { ignoreSearch: true })) || caches.match('./');
  }
}

async function cacheZuerst(req, name) {
  const treffer = await caches.match(req);
  if (treffer) return treffer;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') {
    const c = await caches.open(name);
    c.put(req, res.clone());
    if (name === KACHELN) {
      const keys = await c.keys();
      if (keys.length > MAX_KACHELN) await Promise.all(keys.slice(0, keys.length - MAX_KACHELN).map((k) => c.delete(k)));
    }
  }
  return res;
}

async function cacheUndAktualisieren(req, event) {
  const c = await caches.open(KACHELN);
  const treffer = await c.match(req);
  const neu = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; });
  if (treffer) {
    event.waitUntil(neu.catch(() => {}));
    return treffer;
  }
  return neu;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (KARTEN_HOSTS.includes(url.hostname)) {
    if (url.pathname.endsWith('/style.json')) return event.respondWith(cacheUndAktualisieren(req, event));
    return event.respondWith(cacheZuerst(req, KACHELN));
  }
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate' || url.pathname.endsWith('/data/firmen.json')) return event.respondWith(netzZuerst(req));
  event.respondWith(cacheZuerst(req, CACHE));
});
