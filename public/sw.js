const CACHE = "alla-service-v1";
const ESSENCIAIS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icone-192.png",
  "/icone-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ESSENCIAIS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (evento) => {
  const req = evento.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (/(googleapis|firebaseio|firebaseapp|gstatic)\.com$/.test(url.hostname)) return;

  if (req.mode === "navigate") {
    evento.respondWith(
      fetch(req).catch(() => caches.match("/index.html").then((r) => r || Response.error()))
    );
    return;
  }

  evento.respondWith(
    caches.match(req).then((guardado) => {
      const rede = fetch(req)
        .then((resp) => {
          if (resp && resp.status === 200 && resp.type === "basic") {
            const copia = resp.clone();
            caches.open(CACHE).then((c) => c.put(req, copia)).catch(() => {});
          }
          return resp;
        })
        .catch(() => guardado);
      return guardado || rede;
    })
  );
});
