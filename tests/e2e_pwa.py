#!/usr/bin/env python3
"""Verifie que l'application est installable et fonctionne hors ligne, avec le vrai service worker.

Requiert : pip install playwright. Usage : python tests/e2e_pwa.py [dossier_captures]
"""
import json
import pathlib
import socket
import struct
import subprocess
import sys
import tempfile
import time

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import build_sw  # noqa: E402

SHOTS = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "tests" / "shots"
SHOTS.mkdir(parents=True, exist_ok=True)
failures = []


def ok(name, cond, detail=""):
    print("ok   " if cond else "ÉCHEC", name, "" if cond else detail)
    if not cond:
        failures.append(name)


# --- Fichiers
sw_text = (ROOT / "sw.js").read_text(encoding="utf8")
expected = {p.relative_to(ROOT).as_posix() for p in build_sw.shell_files()}
missing = [f for f in expected if f'"{f}"' not in sw_text]
ok("sw.js à jour : tous les fichiers listés (sinon : python tools/build_sw.py)", not missing, str(missing[:5]))
before = sw_text
build_sw.main()
ok("sw.js à jour : version conforme au contenu", (ROOT / "sw.js").read_text(encoding="utf8") == before)

manifest = json.loads((ROOT / "manifest.webmanifest").read_text(encoding="utf8"))
ok("manifeste : nom", manifest["name"] == "Chess Up")
for icon in manifest["icons"]:
    data = (ROOT / icon["src"]).read_bytes()
    width, height = struct.unpack(">II", data[16:24])
    ok(f"icône {icon['src']} : dimensions réelles", f"{width}x{height}" == icon["sizes"], f"{width}x{height}")
ok("icône adaptable présente", any(i["purpose"] == "maskable" for i in manifest["icons"]))

with socket.socket() as s:
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
server = subprocess.Popen([sys.executable, str(ROOT / "serve.py"), str(port), "--no-open"], cwd=ROOT, stdout=subprocess.DEVNULL)
time.sleep(1)
BASE = f"http://127.0.0.1:{port}"

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        page = ctx.new_page()
        js_errors = []
        page.on("pageerror", lambda e: js_errors.append(str(e)))
        page.goto(BASE)
        page.wait_for_selector("[data-welcome]")
        page.screenshot(path=SHOTS / "p-accueil.png", full_page=True)

        ok("nom : titre de la page", page.title() == "Chess Up", page.title())
        ok("nom : barre latérale", "Chess Up" in page.inner_text(".brand"))
        ok("nom : plus d'ancien nom affiché", "Quête d" not in page.content())
        ok("logo : chargé", page.evaluate("document.querySelector('.brand img').naturalWidth > 0"))

        # Critères d'installation du navigateur lui-même
        page.wait_for_function("navigator.serviceWorker.ready.then(() => !!navigator.serviceWorker.controller || true)")
        page.reload()
        page.wait_for_function("!!navigator.serviceWorker.controller", timeout=20000)
        ok("service worker : contrôle la page", True)

        # Passer l'accueil, puis tout couper
        page.click("[data-skip]")
        page.wait_for_selector(".skill-map")
        ctx.set_offline(True)
        page.reload()
        page.wait_for_selector(".skill-map", timeout=15000)
        ok("hors ligne : l'application démarre", page.title() == "Chess Up")
        ok("hors ligne : pièces affichées", page.evaluate("[...document.querySelectorAll('.sidebar nav img')].every((i) => i.complete && i.naturalWidth > 0)"))

        page.goto(f"{BASE}/#/seance/mat-en-1")
        page.wait_for_selector(".board .sq img", timeout=15000)
        page.wait_for_timeout(800)
        ok("hors ligne : exercices et données", page.locator(".board .sq img").count() > 1)
        page.screenshot(path=SHOTS / "p-hors-ligne.png")

        result = page.evaluate("""async () => {
            const { analyse } = await import('./src/chess/engine.js');
            return analyse('6k1/5ppp/8/8/8/8/5PPP/3Q2K1 w - - 0 1', 8);
        }""")
        ok("hors ligne : Stockfish fonctionne", result["best"] == "d1d8", str(result))

        page.goto(f"{BASE}/#/histoire/opera")
        page.wait_for_selector(".board .sq img")
        ok("hors ligne : mode histoire", "Opéra" in page.inner_text("h1"))

        page.goto(f"{BASE}/#/boss/gardien")
        page.wait_for_selector("[data-lesson]", timeout=15000)
        page.click("[data-lesson]")
        page.wait_for_selector(".board .sq img")
        ok("hors ligne : leçons de boss", True)
        ctx.set_offline(False)

        # Critères du navigateur : un vrai profil est nécessaire, la navigation privée refuse toujours.
        with tempfile.TemporaryDirectory() as profile:
            real = p.chromium.launch_persistent_context(profile, channel="msedge", headless=True)
            rp = real.new_page()
            rp.goto(BASE)
            rp.wait_for_function("navigator.serviceWorker.ready.then(() => true)")
            rp.reload()
            rp.wait_for_function("!!navigator.serviceWorker.controller", timeout=20000)
            cdp = real.new_cdp_session(rp)
            errors = cdp.send("Page.getInstallabilityErrors")["installabilityErrors"]
            ok("installable selon le navigateur", not errors, str(errors))
            app = cdp.send("Page.getAppManifest")
            ok("manifeste : lu sans erreur", not app.get("errors"), str(app.get("errors")))
            real.close()

        # Application installée : même affichage en plein écran sur téléphone
        phone = browser.new_context(viewport={"width": 375, "height": 720}, has_touch=True, device_scale_factor=2)
        mp = phone.new_page()
        mp.goto(BASE)
        mp.wait_for_selector("[data-welcome]")
        ok("mobile : pas de défilement horizontal", not mp.evaluate("document.documentElement.scrollWidth > innerWidth"))
        mp.screenshot(path=SHOTS / "p-mobile.png")

        ok("aucune erreur JavaScript", not js_errors, str(js_errors[:5]))
        browser.close()
finally:
    server.terminate()

print(f"\n{len(failures)} échec(s)")
sys.exit(1 if failures else 0)
