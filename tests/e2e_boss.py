#!/usr/bin/env python3
"""Joue chaque boss contre la vraie table de finales, et vérifie les imports de plateformes.

Requiert le réseau, et : pip install playwright chess.
Usage : python tests/e2e_boss.py [dossier_captures]
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
DAY = time.strftime("%Y-%m-%d")

# Tous les prérequis de finales validés ; la leçon est considérée comme vue.
PREREQ = {"passes": [], "validatedDay": "2020-01-01", "lastPracticed": DAY, "intervalDays": 120, "decay": None, "realErrors": []}
SEED = {
    "version": 1,
    "skills": {k: PREREQ for k in ("mat-kq", "mat-kr", "opposition", "carre")},
    "seen": {},
    "bosses": {b: {"tier": 0, "wins": 0, "lastWinDay": None, "attempts": 0, "lessonDone": True}
               for b in ("gardien", "mur", "opposition", "lucena", "philidor")},
    "story": {}, "games": [], "badges": {}, "daily": {}, "log": [], "settings": {"username": ""},
}


def tablebase(fen):
    url = "https://tablebase.lichess.ovh/standard?fen=" + urllib.parse.quote(fen.replace(" ", "_"))
    req = urllib.request.Request(url, headers={"User-Agent": "chess-quest-e2e"})
    for _ in range(5):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as err:
            if err.code != 429:
                raise
            time.sleep(30)
    raise RuntimeError("table indisponible")


def read_board(page, turn):
    pieces = page.evaluate(
        """() => Object.fromEntries([...document.querySelectorAll('.sq')]
            .filter(s => s.querySelector('img'))
            .map(s => [s.dataset.square, s.querySelector('img').src.split('/').pop().slice(0, 2)]))"""
    )
    board = chess.Board(None)
    for sq, code in pieces.items():
        symbol = code[1] if code[0] == "w" else code[1].lower()
        board.set_piece_at(chess.parse_square(sq), chess.Piece.from_symbol(symbol))
    board.turn = turn
    return board


def click_move(page, uci):
    page.click(f'.sq[data-square="{uci[:2]}"]')
    page.click(f'.sq[data-square="{uci[2:4]}"]')
    if len(uci) > 4:
        page.click(f'[data-promotion="{uci[4]}"]')


def wait_turn(page, pieces_before):
    """Attend la fin de combat, ou que le plateau redevienne jouable."""
    page.wait_for_function(
        "document.querySelector('.result') || document.querySelector('.sq.last') !== null", timeout=20000
    )
    page.wait_for_timeout(900)


def fight(page, boss, turn, blunder_kind):
    page.goto(f"{BASE}/#/boss")
    page.wait_for_selector(".boss-card")
    page.goto(f"{BASE}/#/boss/{boss}")
    page.wait_for_selector("[data-fight]")
    page.click("[data-fight]")

    if boss == "opposition":
        for _ in range(4):
            page.wait_for_selector("[data-verdict], [data-counter]")
            if not page.locator("[data-verdict]").count():
                break
            board = read_board(page, chess.WHITE)
            # Le trait de la position n'est pas lisible à l'écran : on l'obtient du texte.
            if page.inner_text(".prompt").startswith("Noirs"):
                board.turn = chess.BLACK
            info = tablebase(board.fen())
            result = info["category"]
            winning = (board.turn == chess.WHITE and result == "win") or (board.turn == chess.BLACK and result == "loss")
            page.click(f'[data-verdict="{"win" if winning else "draw"}"]')
            ok(f"{boss} : verdict accepté", "good" in page.get_attribute("[data-feedback]", "class"),
               page.inner_text("[data-feedback]"))
            page.screenshot(path=SHOTS / "b-opposition-verdict.png", full_page=True)
            page.click("[data-next]")
            page.wait_for_timeout(200)

    page.wait_for_function("document.querySelector('[data-counter]')?.textContent.includes('sur')", timeout=30000)
    page.wait_for_timeout(600)

    # Une erreur volontaire : le coup doit coûter une vie, et être repris.
    lives = page.locator(".hearts i.on").count()
    start = read_board(page, turn)
    info = tablebase(start.fen())
    blunder = next((m for m in info["moves"] if m["category"] in blunder_kind), None)
    ok(f"{boss} : un mauvais coup existe", blunder is not None)
    if blunder:
        click_move(page, blunder["uci"])
        page.wait_for_function(f"document.querySelectorAll('.hearts i.on').length === {lives - 1}", timeout=15000)
        after = read_board(page, turn)
        ok(f"{boss} : coup repris, une vie en moins", after.board_fen() == start.board_fen())
        page.screenshot(path=SHOTS / f"b-{boss}-vie.png", full_page=True)
        page.wait_for_timeout(300)

    for move_index in range(60):
        if page.locator(".result").count():
            break
        board = read_board(page, turn)
        info = tablebase(board.fen())
        click_move(page, info["moves"][0]["uci"])
        page.wait_for_timeout(1400)
    page.wait_for_selector(".result", timeout=20000)
    text = page.inner_text(".result")
    ok(f"{boss} : victoire", "Victoire" in text, text)
    print("   ", text.replace("\n", " | ")[:150])
    page.screenshot(path=SHOTS / f"b-{boss}-fin.png", full_page=True)
    return page.evaluate("JSON.parse(localStorage.getItem('quete-echecs.v1'))")


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        page = ctx.new_page()
        js_errors = []
        page.on("pageerror", lambda e: js_errors.append(str(e)))
        page.goto(BASE)
        page.evaluate("s => localStorage.setItem('quete-echecs.v1', s)", json.dumps(SEED))
        page.reload()

        lost = ("draw", "win", "cursed-win", "maybe-win", "blessed-loss")
        for boss, turn, kinds in [
            ("gardien", chess.WHITE, lost),
            ("mur", chess.WHITE, lost),
            ("opposition", chess.WHITE, lost),
            ("lucena", chess.WHITE, lost),
            ("philidor", chess.BLACK, ("win", "cursed-win", "maybe-win")),
        ]:
            st = fight(page, boss, turn, kinds)
            ok(f"{boss} : palier relevé", st["bosses"][boss]["tier"] == 1, str(st["bosses"][boss]))
            ok(f"{boss} : revanche programmée", st["bosses"][boss]["lastWinDay"] == DAY)

        # Un second combat le même jour reste un entraînement.
        st_before = page.evaluate("JSON.parse(localStorage.getItem('quete-echecs.v1'))")["bosses"]["gardien"]
        st = fight(page, "gardien", chess.WHITE, lost)
        ok("rejouer le même jour ne relève pas le palier", st["bosses"]["gardien"]["tier"] == st_before["tier"])
        ok("rejouer compte pour la quête du jour", st["daily"][DAY]["boss"] >= 1)

        # Vidage des vies : défaite
        page.goto(f"{BASE}/#/boss")
        page.wait_for_selector(".boss-card")
        page.goto(f"{BASE}/#/boss/gardien")
        page.click("[data-fight]")
        page.wait_for_function("document.querySelector('[data-counter]')?.textContent.includes('sur')", timeout=30000)
        for _ in range(3):
            page.wait_for_timeout(500)
            board = read_board(page, chess.WHITE)
            info = tablebase(board.fen())
            bad = next(m for m in info["moves"] if m["category"] in lost)
            click_move(page, bad["uci"])
            page.wait_for_timeout(700)
        page.wait_for_selector(".result", timeout=10000)
        ok("trois vies perdues : défaite", "Défaite" in page.inner_text(".result"))

        # Imports réels de plateformes : lecture seule de comptes publics
        for source, user in [("lichess", "thibault"), ("chesscom", "hikaru")]:
            page.goto(f"{BASE}/#/parties")
            page.wait_for_selector("[data-form]")
            page.fill('[name="username"]', user)
            page.select_option('[name="source"]', source)
            page.fill('[name="count"]', "1")
            page.click("[data-run]")
            page.wait_for_function(
                "document.querySelector('[data-status]').textContent.includes('analysée')"
                " || document.querySelector('[data-status]').className.includes('bad')",
                timeout=300000,
            )
            print(f"    import {source} :", page.inner_text("[data-status]"))
            ok(f"import {source}", "analysée" in page.inner_text("[data-status]"), page.inner_text("[data-status]"))

        ok("aucune erreur JavaScript", not js_errors, str(js_errors[:5]))
        browser.close()
finally:
    server.terminate()

print(f"\n{len(failures)} échec(s)")
sys.exit(1 if failures else 0)
