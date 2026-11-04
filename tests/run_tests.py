#!/usr/bin/env python3
"""Lance tests/index.html dans Edge headless. Requiert : pip install playwright"""
import pathlib
import socket
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = pathlib.Path(__file__).resolve().parent.parent


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


port = free_port()
server = subprocess.Popen([sys.executable, str(ROOT / "serve.py"), str(port), "--no-open"], cwd=ROOT)
time.sleep(1)
code = 1
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        page = browser.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"http://127.0.0.1:{port}/tests/")
        deadline = time.time() + 240
        while not page.evaluate("window.__results !== undefined"):
            if errors:
                raise SystemExit(f"ERREUR JS : {errors[0]}")
            if time.time() > deadline:
                raise SystemExit("Tests trop longs")
            page.wait_for_timeout(250)
        results = page.evaluate("window.__results")
        print(f"{results['passes']} réussis, {len(results['failures'])} échecs")
        for failure in results["failures"]:
            print(" -", failure)
        code = 1 if results["failures"] else 0
        browser.close()
finally:
    server.terminate()
sys.exit(code)
