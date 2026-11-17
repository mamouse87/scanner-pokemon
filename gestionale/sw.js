// Gestionale carte: serve per installarlo come app e aprirlo anche senza internet.
// - la pagina: sempre l'ultima versione da internet (senza bisogno di Ctrl+F5); senza internet, l'ultima copia salvata
// - librerie e caratteri (PDF, font): copia salvata, si scaricano una volta
// - tutto il resto (TCGdex, GitHub, immagini delle carte): non viene toccato
const CACHE = 'gestionale-v1';
const LIBS = /^https:\/\/(cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const own = url.origin === location.origin && url.pathname.startsWith(new URL(self.registration.scope).pathname);
  if (own) {
    const key = req.mode === 'navigate' ? self.registration.scope : req.url.split('#')[0].split('?')[0];
    e.respondWith(
      fetch(req.mode === 'navigate' ? self.registration.scope : req, { cache: 'no-cache' })
        .then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(ch => ch.put(key, c)); } return r; })
        .catch(() => caches.match(key).then(r => r || Response.error())));
  } else if (LIBS.test(req.url)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok || r.type === 'opaque') { const c = r.clone(); caches.open(CACHE).then(ch => ch.put(req, c)); }
      return r;
    })));
  }
});
