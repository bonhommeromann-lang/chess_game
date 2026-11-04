// Fichier généré par tools/build_sw.py : ne pas modifier à la main.
const VERSION = "6bbd36e60149";
const CACHE = `chess-up-${VERSION}`;
const SHELL = [
  "./",
  "assets/apple-touch-icon.png",
  "assets/favicon-32.png",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/icon-maskable-512.png",
  "assets/logo.svg",
  "css/app.css",
  "data/endgames.json",
  "data/puzzles.json",
  "index.html",
  "manifest.webmanifest",
  "src/analysis.js",
  "src/chess/board.js",
  "src/chess/detect.js",
  "src/chess/engine.js",
  "src/chess/tablebase.js",
  "src/core/elo.js",
  "src/core/mastery.js",
  "src/core/plan.js",
  "src/core/quests.js",
  "src/core/store.js",
  "src/core/time.js",
  "src/data/bosses.js",
  "src/data/games.js",
  "src/data/quizzes.js",
  "src/data/skills.js",
  "src/exercises.js",
  "src/install.js",
  "src/main.js",
  "src/sync.js",
  "src/views/boss.js",
  "src/views/elobar.js",
  "src/views/games.js",
  "src/views/home.js",
  "src/views/progress.js",
  "src/views/session.js",
  "src/views/skillmap.js",
  "src/views/story.js",
  "src/views/tree.js",
  "src/views/ui.js",
  "src/views/welcome.js",
  "vendor/chess.js",
  "vendor/pieces/bB.svg",
  "vendor/pieces/bK.svg",
  "vendor/pieces/bN.svg",
  "vendor/pieces/bP.svg",
  "vendor/pieces/bQ.svg",
  "vendor/pieces/bR.svg",
  "vendor/pieces/wB.svg",
  "vendor/pieces/wK.svg",
  "vendor/pieces/wN.svg",
  "vendor/pieces/wP.svg",
  "vendor/pieces/wQ.svg",
  "vendor/pieces/wR.svg",
  "vendor/stockfish/stockfish.wasm",
  "vendor/stockfish/stockfish.wasm.js"
];
const NETWORK_TIMEOUT = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('chess-up-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Réseau d'abord, pour que l'application reste à jour ; la copie locale prend le relais hors ligne
// ou si le réseau traîne. Les autres sites (tables de finales, plateformes) ne passent pas par ici.
async function respond(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request, { signal: AbortSignal.timeout(NETWORK_TIMEOUT) });
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const page = await cache.match('index.html');
      if (page) return page;
    }
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(respond(request));
});
