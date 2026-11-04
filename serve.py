#!/usr/bin/env python3
"""Serveur local : python serve.py [port] [--no-open], puis http://localhost:8000"""
import http.server
import sys
import webbrowser


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".wasm": "application/wasm",
        ".svg": "image/svg+xml",
        ".json": "application/json",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, *args):
        pass


args = [a for a in sys.argv[1:] if not a.startswith("--")]
port = int(args[0]) if args else 8000
url = f"http://localhost:{port}"
print(f"Chess Up : {url}  (Ctrl+C pour arreter)", flush=True)
if "--no-open" not in sys.argv:
    webbrowser.open(url)
http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
