#!/usr/bin/env python3
"""Genere sw.js : liste des fichiers a garder hors ligne, et version calculee sur leur contenu.

A relancer avant chaque publication (tests/e2e_pwa.py echoue si sw.js n'est plus a jour).
"""
import hashlib
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
PATTERNS = ["index.html", "manifest.webmanifest", "css/*", "assets/*", "data/*.json", "src/**/*.js",
            "vendor/*.js", "vendor/pieces/*.svg", "vendor/stockfish/stockfish.wasm", "vendor/stockfish/stockfish.wasm.js"]

TEMPLATE = """// Fichier généré par tools/build_sw.py : ne pas modifier à la main.
const VERSION = %(version)s;
const CACHE = `chess-up-${VERSION}`;
const SHELL = %(shell)s;
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
"""


def shell_files():
    found = set()
    for pattern in PATTERNS:
        found.update(p for p in ROOT.glob(pattern) if p.is_file())
    return sorted(found)


def main():
    files = shell_files()
    digest = hashlib.sha256()
    for path in files:
        digest.update(path.relative_to(ROOT).as_posix().encode())
        digest.update(path.read_bytes().replace(b"\r\n", b"\n"))
    shell = ["./"] + [p.relative_to(ROOT).as_posix() for p in files]
    (ROOT / "sw.js").write_text(
        TEMPLATE % {"version": json.dumps(digest.hexdigest()[:12]), "shell": json.dumps(shell, indent=2)},
        encoding="utf8", newline="\n",
    )
    print("sw.js :", len(shell), "fichiers, version", digest.hexdigest()[:12])


if __name__ == "__main__":
    main()
