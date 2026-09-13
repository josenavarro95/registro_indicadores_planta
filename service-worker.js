// ============================================================================
// service-worker.js — necesario para que el navegador ofrezca "Instalar app"
// (PWA) y para que la interfaz cargue rápido/offline. Los datos siguen
// viniendo siempre de Firestore por internet — esto solo cachea los archivos
// propios de la app (HTML/CSS/JS/íconos), nunca las llamadas a Firebase ni al
// CDN de Chart.js, que siempre van directo a la red.
//
// Sube el número de versión (CACHE) cada vez que cambies archivos de la app
// para que los usuarios reciban la versión nueva en su próxima visita.
// ============================================================================
const CACHE = "monitoreo-valdivia-v6";
const ARCHIVOS_APP = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/dashboard.js",
  "./js/calculos.js",
  "./js/ui.js",
  "./js/firebase-init.js",
  "./js/firebase-config.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (ev) => {
  ev.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ARCHIVOS_APP))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (ev) => {
  const url = new URL(ev.request.url);

  // Solo cachea peticiones GET del propio sitio (mismo origen). Firebase,
  // Firestore, Chart.js (CDN) y cualquier otra petición externa se dejan
  // pasar directo a la red, sin interceptar.
  if (ev.request.method !== "GET" || url.origin !== self.location.origin) return;

  // Red primero, de verdad: mientras haya conexión, siempre se pide el
  // archivo fresco al servidor (y de paso se actualiza la caché) — así,
  // en cuanto subas un cambio a GitHub, la próxima carga ya lo muestra, sin
  // quedarse pegado en una versión vieja. Solo si no hay internet se usa lo
  // que quedó guardado en caché de una visita anterior.
  ev.respondWith(
    fetch(ev.request)
      .then((respuesta) => {
        if (respuesta && respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(CACHE).then((cache) => cache.put(ev.request, copia));
        }
        return respuesta;
      })
      .catch(() => caches.match(ev.request))
  );
});
