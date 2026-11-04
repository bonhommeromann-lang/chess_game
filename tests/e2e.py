#!/usr/bin/env python3
"""Parcours de bout en bout dans Edge. Requiert : pip install playwright chess.

Usage : python tests/e2e.py [dossier_captures]
"""
import json
import pathlib
import socket
import subprocess
import sys
import time
import urllib.parse
import urllib.request

import chess
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
server = subprocess.Popen(
    [sys.executable, str(ROOT / "serve.py"), str(port), "--no-open"], cwd=ROOT, stdout=subprocess.DEVNULL
)
time.sleep(1)
BASE = f"http://127.0.0.1:{port}"

PGN = """[Event "Test"]
[White "moi"]
[Black "adversaire"]
[Result "0-1"]
[UTCDate "2026.11.01"]
[WhiteElo "1450"]
[BlackElo "1500"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Nf3 Nxh5 5. Nc3 d6 6. O-O Bg4 7. d3 Nd4 8. Bg5 Qd7 9. a3 Nxf3+ 10. gxf3 Bxf3 0-1
"""


def click_move(page, uci):
    page.click(f'.sq[data-square="{uci[:2]}"]')
    page.click(f'.sq[data-square="{uci[2:4]}"]')


def state(page):
    return page.evaluate("JSON.parse(localStorage.getItem('quete-echecs.v1'))")


def pieces_on_board(page):
    return page.evaluate(
        """() => Object.fromEntries([...document.querySelectorAll('.sq')]
            .filter(s => s.querySelector('img'))
            .map(s => [s.dataset.square, s.querySelector('img').src.split('/').pop().slice(0, 2)]))"""
    )


def board_from_page(page, turn=chess.WHITE):
    board = chess.Board(None)
    for sq, code in pieces_on_board(page).items():
        symbol = code[1] if code[0] == "w" else code[1].lower()
        board.set_piece_at(chess.parse_square(sq), chess.Piece.from_symbol(symbol))
    board.turn = turn
    return board


def tablebase(fen):
    url = "https://tablebase.lichess.ovh/standard?fen=" + urllib.parse.quote(fen.replace(" ", "_"))
    req = urllib.request.Request(url, headers={"User-Agent": "chess-quest-e2e"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        page = ctx.new_page()
        js_errors = []
        page.on("pageerror", lambda e: js_errors.append(str(e)))
        page.on("console", lambda m: js_errors.append(m.text) if m.type == "error" else None)

        # --- Accueil
        page.goto(BASE)
        page.click("[data-skip]")
        page.wait_for_selector(".quests")
        ok("accueil : 3 quêtes", page.locator(".quest").count() == 3)
        ok("accueil : 4 branches sur la carte", page.locator(".map-hub").count() == 4)
        ok("accueil : 25 compétences sur la carte", page.locator(".map-node").count() == 25)
        ok("Élo : à évaluer au départ", "À évaluer" in page.inner_text("[data-elo]"))
        page.screenshot(path=SHOTS / "01-accueil.png", full_page=True)

        # --- Arbre
        page.goto(f"{BASE}/#/arbre")
        page.wait_for_selector(".tree")
        ok("arbre : 25 compétences", page.locator(".node").count() == 25, str(page.locator(".node").count()))
        ok("Fourchette verrouillée", "locked" in page.get_attribute('[data-skill="fourchette"]', "class"))
        ok("Mat en 1 disponible", "available" in page.get_attribute('[data-skill="mat-en-1"]', "class"))
        page.screenshot(path=SHOTS / "02-arbre.png", full_page=True)

        # --- Séance : les solutions sont retrouvées dans les données des puzzles
        puzzles = json.loads((ROOT / "data" / "puzzles.json").read_text(encoding="utf8"))["skills"]["mat-en-1"]
        known = [q for band in puzzles for q in band]

        def solve_current():
            page.wait_for_timeout(800)
            on_board = pieces_on_board(page)
            for q in known:
                b = chess.Board(q["fen"])
                moves = q["moves"].split()
                b.push_uci(moves[0])
                same = {
                    chess.square_name(sq): ("w" if pc.color else "b") + pc.symbol().upper()
                    for sq, pc in b.piece_map().items()
                }
                if same == on_board:
                    click_move(page, moves[1])
                    return True
            return False

        page.goto(f"{BASE}/#/competence/mat-en-1")
        page.click("text=Passer le test")
        page.wait_for_selector(".board .sq")
        ok("séance : exercice 1 résolu", solve_current())
        page.wait_for_selector("[data-next]:visible")
        page.screenshot(path=SHOTS / "03-exercice.png", full_page=True)
        ok("séance : réponse juste", "good" in page.get_attribute("[data-feedback]", "class"))
        page.click("[data-next]")
        for i in range(7):
            ok(f"séance : exercice {i + 2} résolu", solve_current())
            page.wait_for_selector("[data-next]:visible")
            page.click("[data-next]")
        page.wait_for_selector(".result")
        ok("séance : 100 %", "100" in page.inner_text(".score-big"))
        ok("séance : à confirmer demain", "demain" in page.inner_text(".result"))
        page.screenshot(path=SHOTS / "04-resultat.png", full_page=True)
        st = state(page)
        ok("état : une session enregistrée", len(st["skills"]["mat-en-1"]["passes"]) == 1)
        elo_text = page.inner_text(".elo-value")
        ok("Élo : estimé après les exercices", any(ch.isdigit() for ch in elo_text), elo_text)
        print("   Élo affiché :", elo_text)
        ok("état : pas encore validée", st["skills"]["mat-en-1"]["validatedDay"] is None)

        page.goto(f"{BASE}/#/competence/mat-en-1")
        page.wait_for_selector(".skill-sheet")
        ok("anti-farm : avertissement le jour même", "déjà réussie" in page.inner_text(".skill-sheet"))

        # --- Exercices à choix, et question générée
        page.goto(f"{BASE}/#/seance/principes")
        page.wait_for_selector(".btn.choice")
        page.screenshot(path=SHOTS / "05-choix.png", full_page=True)
        page.locator(".btn.choice").first.click()
        page.wait_for_selector("[data-next]:visible")
        ok("choix : explication affichée", len(page.inner_text("[data-feedback]")) > 10)

        page.goto(f"{BASE}/#/seance/cases-faibles")
        page.wait_for_selector(".btn.choice")
        page.screenshot(path=SHOTS / "06-genere.png", full_page=True)

        # --- Boss : leçon, puis combat joué avec la table de finales
        page.goto(f"{BASE}/#/boss")
        page.wait_for_selector(".boss-card")
        page.screenshot(path=SHOTS / "07-boss.png", full_page=True)
        page.goto(f"{BASE}/#/boss/gardien")
        page.click("[data-lesson]")
        page.wait_for_selector(".board .sq")
        click_move(page, "b3b4")
        page.wait_for_selector(".arrows")
        page.screenshot(path=SHOTS / "08-lecon.png", full_page=True)
        ok("leçon : mauvais coup refusé", "bad" in page.get_attribute("[data-feedback]", "class"))
        for uci in ["b3d3", "g1f2", "g5g6", "f7g7"]:
            page.wait_for_selector(f'.sq[data-square="{uci[:2]}"] img')
            click_move(page, uci)
            page.wait_for_selector("[data-next]:visible")
            page.click("[data-next]")
        page.wait_for_selector("[data-fight]")
        ok("leçon : terminée", state(page)["bosses"]["gardien"]["lessonDone"])
        page.click("[data-fight]")
        page.wait_for_function(
            "document.querySelector('[data-counter]')?.textContent.includes('sur')", timeout=30000
        )

        lives_before = page.locator(".hearts i.on").count()
        info = tablebase(board_from_page(page).fen())
        blunder = next((m for m in info["moves"] if m["category"] != "loss"), None)
        if blunder:
            click_move(page, blunder["uci"][:4])
            page.wait_for_function(
                f"document.querySelectorAll('.hearts i.on').length === {lives_before - 1}", timeout=15000
            )
            ok("combat : lâcher le gain coûte une vie", True)
            page.screenshot(path=SHOTS / "09-vie-perdue.png", full_page=True)
        for _ in range(12):
            page.wait_for_timeout(1200)
            if page.locator(".result").count():
                break
            info = tablebase(board_from_page(page).fen())
            click_move(page, info["moves"][0]["uci"])
        page.wait_for_selector(".result", timeout=20000)
        ok("combat : victoire au mat", "Victoire" in page.inner_text(".result"), page.inner_text(".result"))
        page.screenshot(path=SHOTS / "10-victoire.png", full_page=True)
        st = state(page)
        ok("boss : compétence validée", st["skills"]["mat-kq"]["validatedDay"] is not None)
        ok("boss : palier relevé", st["bosses"]["gardien"]["tier"] == 1)
        page.goto(f"{BASE}/#/arbre")
        page.wait_for_selector(".tree")
        ok("arbre : Mat roi + tour débloquée", "available" in page.get_attribute('[data-skill="mat-kr"]', "class"))
        page.screenshot(path=SHOTS / "11-arbre-apres.png", full_page=True)
        page.goto(BASE + "/#/")
        page.wait_for_selector(".skill-map")
        ok("carte : Mat roi + dame illuminée", "validated" in page.get_attribute('.map-node[data-skill="mat-kq"]', "class"))
        ok("carte : Mat en 1 à 1 sur 2", page.locator('.map-node[data-skill="mat-en-1"] .map-count').count() == 1)
        page.screenshot(path=SHOTS / "11b-accueil-progres.png", full_page=True)

        # --- Mode histoire, avec moteur
        page.goto(f"{BASE}/#/histoire")
        page.wait_for_selector(".game-card")
        ok("histoire : 8 parties", page.locator(".game-card").count() == 8)
        page.screenshot(path=SHOTS / "12-histoire.png", full_page=True)
        page.goto(f"{BASE}/#/histoire/opera")
        page.click("[data-skip]")
        page.wait_for_selector("[data-plan] .btn.choice", timeout=30000)
        page.screenshot(path=SHOTS / "13-plan.png", full_page=True)
        page.locator("[data-plan] .btn.choice", has_text="Ouvrir le jeu").click()
        page.click("[data-next]")
        page.wait_for_function("document.querySelector('[data-prompt]').textContent.includes('quel coup')")
        click_move(page, "c1g5")
        page.wait_for_selector("[data-next]:visible", timeout=30000)
        ok("histoire : coup du maître 3 points", "3 points" in page.inner_text("[data-feedback]"))
        ok("histoire : idée affichée", "clou" in page.inner_text("[data-idea]"))
        page.screenshot(path=SHOTS / "14-coup-maitre.png", full_page=True)
        page.click("[data-next]")
        page.wait_for_function("document.querySelector('[data-counter]').textContent.includes('Coup 10')", timeout=20000)
        page.wait_for_timeout(300)
        click_move(page, "a2a3")
        page.wait_for_function(
            "!document.querySelector('[data-feedback]').textContent.startsWith('Analyse')"
            " && document.querySelector('[data-feedback]').textContent.length > 0",
            timeout=60000,
        )
        fb = page.inner_text("[data-feedback]")
        ok("histoire : le moteur évalue un autre coup", "point" in fb and "pas pu" not in fb, fb)
        print("   retour moteur :", fb)
        page.screenshot(path=SHOTS / "15-coup-moteur.png", full_page=True)

        # --- Parties réelles : import PGN et analyse réelle
        page.goto(f"{BASE}/#/parties")
        page.wait_for_selector("[data-paste-box]")
        page.click("[data-paste-box] summary")
        page.fill('[data-paste] [name="username"]', "moi")
        page.fill('[name="pgn"]', PGN)
        page.click("[data-paste] button")
        page.wait_for_function(
            "(JSON.parse(localStorage.getItem('quete-echecs.v1')).games ?? []).length === 1", timeout=180000
        )
        page.wait_for_selector(".game-row")
        if page.locator(".game-row summary").count():
            page.locator(".game-row summary").first.click()
        page.screenshot(path=SHOTS / "16-parties.png", full_page=True)
        st = state(page)
        ok("parties : enregistrée", len(st["games"]) == 1)
        if st["games"]:
            game = st["games"][0]
            ok("parties : erreur grave trouvée", len(game["errors"]) >= 1, str(game["errors"]))
            print("   erreurs :", [(e["moveNumber"], e["san"], e["skill"]) for e in game["errors"]])
            ok("parties : classement lu", game["rating"] == 1450)

        # --- Progrès
        page.goto(f"{BASE}/#/progres")
        page.wait_for_selector(".control")
        ok("progrès : graphique", page.locator(".chart svg").count() == 1)
        ok("progrès : badges", page.locator(".badge").count() == 8)
        page.screenshot(path=SHOTS / "17-progres.png", full_page=True)

        # --- Téléphone
        phone = browser.new_context(viewport={"width": 375, "height": 720}, has_touch=True)
        mp = phone.new_page()
        mp.goto(BASE)
        mp.wait_for_selector("[data-welcome]")
        ok("mobile : bienvenue sans débordement", not mp.evaluate("document.documentElement.scrollWidth > innerWidth"))
        mp.screenshot(path=SHOTS / "18a-mobile-bienvenue.png", full_page=True)
        mp.click("[data-skip]")
        mp.goto(f"{BASE}/#/seance/mat-en-1")
        mp.wait_for_selector(".board .sq")
        ok("mobile : pas de défilement horizontal", not mp.evaluate("document.documentElement.scrollWidth > innerWidth"))
        mp.wait_for_timeout(800)
        mp.screenshot(path=SHOTS / "18-mobile.png", full_page=True)
        mp.goto(f"{BASE}/#/arbre")
        mp.wait_for_selector(".tree")
        ok("mobile arbre : pas de défilement horizontal", not mp.evaluate("document.documentElement.scrollWidth > innerWidth"))
        mp.screenshot(path=SHOTS / "19-mobile-arbre.png", full_page=True)

        ok("aucune erreur JavaScript", not js_errors, str(js_errors[:5]))
        browser.close()
finally:
    server.terminate()

print(f"\n{len(failures)} échec(s)")
sys.exit(1 if failures else 0)
