#!/usr/bin/env python3
"""Parcours du compte lie : ecran d'accueil, synchro en arriere-plan, reprise, changement de compte.

Les parties sont simulees pour un test rapide et reproductible ; l'analyse, elle, est bien reelle.
Seule la verification finale appelle la vraie API Chess.com (lecture seule, sans analyse).
Requiert : pip install playwright. Usage : python tests/e2e_sync.py [dossier_captures]
"""
import json
import pathlib
import socket
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "tests" / "shots"
SHOTS.mkdir(parents=True, exist_ok=True)
failures = []


def ok(name, cond, detail=""):
    print("ok   " if cond else "ÉCHEC", name, "" if cond else detail)
    if not cond:
        failures.append(name)


with socket.socket() as s:
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
server = subprocess.Popen([sys.executable, str(ROOT / "serve.py"), str(port), "--no-open"], cwd=ROOT, stdout=subprocess.DEVNULL)
time.sleep(1)
BASE = f"http://127.0.0.1:{port}"
OPERA = ("1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 "
         "10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0")


def game(day, control, elo):
    return {
        "rules": "chess", "rated": True,
        "pgn": f'[Event "Live Chess"]\n[Date "2026.10.{day}"]\n[White "Testeur"]\n[Black "Autre"]\n[Result "1-0"]\n'
               f'[UTCDate "2026.10.{day}"]\n[WhiteElo "{elo}"]\n[BlackElo "1200"]\n[TimeControl "{control}"]\n\n{OPERA}\n',
    }


MONTH = {"games": [
    game(10, "600", 1300),
    game(11, "600", 1320),
    game(12, "60", 900),   # bullet : ne doit être ni analysé ni compté
    {"rules": "chess960", "rated": True, "pgn": "x"},
    {**game(13, "600", 2000), "rated": False},
]}


def stub_chesscom(route):
    url = route.request.url
    headers = {"Access-Control-Allow-Origin": "*"}
    if url.endswith("/player/inconnu"):
        route.fulfill(status=404, headers=headers, json={"code": 0})
    elif url.endswith("/player/testeur"):
        route.fulfill(status=200, headers=headers, json={"username": "testeur"})
    elif url.endswith("/games/archives"):
        route.fulfill(status=200, headers=headers, json={"archives": [
            "https://api.chess.com/pub/player/testeur/games/2026/10",
            "https://api.chess.com/pub/player/testeur/games/2026/11",
        ]})
    elif url.endswith("/2026/11"):
        route.fulfill(status=404, headers=headers, json={"code": 0})
    else:
        route.fulfill(status=200, headers=headers, json=MONTH)


def state(page):
    return page.evaluate("JSON.parse(localStorage.getItem('quete-echecs.v1'))")


def wait_games(page, count, timeout=240000):
    page.wait_for_function(
        f"(JSON.parse(localStorage.getItem('quete-echecs.v1')).games ?? []).length >= {count}", timeout=timeout
    )


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        page = ctx.new_page()
        js_errors = []
        page.on("pageerror", lambda e: js_errors.append(str(e)))
        page.route("https://api.chess.com/**", stub_chesscom)

        # Écran de bienvenue
        page.goto(BASE)
        page.wait_for_selector("[data-welcome]")
        page.screenshot(path=SHOTS / "s-bienvenue.png", full_page=True)
        ok("bienvenue : aucun champ de mot de passe", page.locator('input[type="password"]').count() == 0)
        page.fill('[name="username"]', "inconnu")
        page.click("[data-submit]")
        page.wait_for_selector("[data-error].bad")
        ok("bienvenue : pseudo inconnu refusé", "Aucun compte" in page.inner_text("[data-error]"))
        ok("bienvenue : reste sur l'écran", page.locator("[data-welcome]").count() == 1)

        # Lier le compte : l'accueil s'affiche sans attendre l'analyse
        page.fill('[name="username"]', "Testeur")
        page.click("[data-submit]")
        page.wait_for_selector(".skill-map", timeout=15000)
        ok("lien : accueil immédiat", True)
        page.wait_for_selector("[data-sync]:not([hidden])", timeout=15000)
        page.screenshot(path=SHOTS / "s-analyse-en-cours.png", full_page=True)

        # La synchro continue en changeant de page, et un exercice reste jouable pendant ce temps
        page.goto(f"{BASE}/#/seance/principes")
        page.wait_for_selector(".btn.choice")
        ok("synchro : indicateur visible sur les autres pages", page.locator("[data-sync]:not([hidden])").count() == 1)
        wait_games(page, 1)
        ok("synchro : la partie s'analyse pendant l'exercice", len(state(page)["games"]) >= 1)
        ok("synchro : l'exercice n'est pas interrompu", page.locator(".btn.choice").count() >= 3)

        # Fermeture de l'onglet : la reprise ne perd rien et ne refait rien
        page.reload()
        page.wait_for_selector("[data-elo]")
        wait_games(page, 2)
        page.goto(f"{BASE}/#/parties")
        page.wait_for_selector("[data-list]")
        page.wait_for_function("document.querySelector('[data-sync]').hidden", timeout=60000)
        st = state(page)
        ok("reprise : 2 parties, sans doublon", len(st["games"]) == 2, str(len(st["games"])))
        ok("filtre : pas de bullet", all(g["timeClass"] == "rapid" for g in st["games"]), str([g["timeClass"] for g in st["games"]]))
        ok("filtre : pas de partie amicale ni de variante", all(g["rating"] < 2000 for g in st["games"]))
        ok("analyse : la partie de l'Opéra est propre", all(len(g["errors"]) == 0 for g in st["games"]),
           str([[e["san"] for e in g["errors"]] for g in st["games"]]))
        page.screenshot(path=SHOTS / "s-parties.png", full_page=True)

        # Élo : classement réel, par cadence
        elo = page.inner_text(".elo-value")
        ok("Élo : moyenne du classement en rapide", elo.strip() == "1310", elo)
        ok("Élo : cadence annoncée", "rapide" in page.get_attribute("[data-elo]", "title"), page.get_attribute("[data-elo]", "title"))

        # Nouvelle synchro : rien à refaire
        page.click("[data-sync-now]")
        page.wait_for_function("document.querySelector('.feedback[role=status]')?.textContent.includes('à jour')", timeout=30000)
        ok("synchro : rien à refaire", len(state(page)["games"]) == 2)

        # Réouverture : plus d'écran de bienvenue
        page.goto(f"{BASE}/#/")
        page.reload()
        page.wait_for_selector(".skill-map")
        ok("retour : pas de nouvel écran de bienvenue", page.locator("[data-welcome]").count() == 0)
        page.screenshot(path=SHOTS / "s-accueil-lie.png", full_page=True)

        # Changer de compte
        page.goto(f"{BASE}/#/parties")
        page.wait_for_selector("[data-unlink]")
        page.wait_for_function("!document.querySelector('[data-unlink]').disabled", timeout=60000)
        page.on("dialog", lambda d: d.accept())
        page.click("[data-unlink]")
        page.wait_for_selector("[data-welcome]")
        st = state(page)
        ok("changement : parties retirées", st["games"] == [])
        ok("changement : Élo réinitialisé", "À évaluer" in page.inner_text("[data-elo]"), page.inner_text("[data-elo]"))
        page.click("[data-skip]")
        page.wait_for_selector(".skill-map")
        ok("sans compte : accueil accessible", True)

        # Plateforme indisponible : message clair, pas de plantage
        ctx2 = browser.new_context()
        pg = ctx2.new_page()
        pg.on("pageerror", lambda e: js_errors.append(str(e)))
        pg.route("https://api.chess.com/**", lambda r: r.abort())
        pg.goto(BASE)
        pg.wait_for_selector("[data-welcome]")
        pg.fill('[name="username"]', "Testeur")
        pg.click("[data-submit]")
        pg.wait_for_selector("[data-error].bad")
        ok("hors ligne : message clair", "joignable" in pg.inner_text("[data-error]"), pg.inner_text("[data-error]"))

        # Vraie API Chess.com : formats réels, sans analyse
        real = browser.new_context().new_page()
        real.goto(BASE)
        result = real.evaluate("""async () => {
            const { verifyAccount } = await import('/src/sync.js');
            const { fetchChessComGames, parseGame, playerColor } = await import('/src/analysis.js');
            let missing = null;
            try { await verifyAccount('chesscom', 'ce-pseudo-nexiste-vraiment-pas-123'); } catch (e) { missing = e.message; }
            await verifyAccount('chesscom', 'hikaru');
            const pgns = await fetchChessComGames('hikaru', 3);
            const parsed = pgns.map(parseGame).filter(Boolean);
            return { missing, read: parsed.length, of: pgns.length,
                     classes: parsed.map((g) => g.timeClass), color: parsed.map((g) => playerColor(g, 'hikaru')), rating: parsed.map((g) => g.whiteElo) };
        }""")
        print("   vraie API :", result)
        ok("API réelle : pseudo inexistant détecté", "Aucun compte" in (result["missing"] or ""))
        ok("API réelle : parties lues", result["read"] == 3 and result["of"] == 3)
        ok("API réelle : joueur reconnu", all(result["color"]))
        ok("API réelle : cadence et classement lus", all(c != "unknown" for c in result["classes"]) and all(result["rating"]))

        ok("aucune erreur JavaScript", not js_errors, str(js_errors[:5]))
        browser.close()
finally:
    server.terminate()

print(f"\n{len(failures)} échec(s)")
sys.exit(1 if failures else 0)
