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


LICHESS_PGN = """[Event "rated rapid game"]
[Site "https://lichess.org/game/test0001"]
[Date "2026.10.22"]
[White "thibault"]
[Black "adversaire"]
[Result "1-0"]
[UTCDate "2026.10.22"]
[UTCTime "10:00:00"]
[WhiteElo "1800"]
[BlackElo "1790"]
[Variant "Standard"]
[TimeControl "600+0"]
[Termination "Normal"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0
"""


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


def ready(page):
    """Attend la fin du combat, ou que le plateau soit de nouveau jouable."""
    page.wait_for_selector('.result, .board[data-movable="true"]', timeout=30000)


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

    ready(page)

    # Une erreur volontaire : le coup doit coûter une vie, et être repris.
    lives = page.locator(".hearts i.on").count()
    start = read_board(page, turn)
    info = tablebase(start.fen())
    blunder = next((m for m in info["moves"] if m["category"] in blunder_kind), None)
    # Certaines positions n'ont aucun coup qui lache le gain : on ne teste alors que le jeu correct.
    if blunder:
        click_move(page, blunder["uci"])
        page.wait_for_function(f"document.querySelectorAll('.hearts i.on').length === {lives - 1}", timeout=15000)
        after = read_board(page, turn)
        ok(f"{boss} : coup repris, une vie en moins", after.board_fen() == start.board_fen())
        page.screenshot(path=SHOTS / f"b-{boss}-vie.png", full_page=True)

    for move_index in range(60):
        ready(page)
        if page.locator(".result").count():
            break
        board = read_board(page, turn)
        info = tablebase(board.fen())
        click_move(page, info["moves"][0]["uci"])
        page.wait_for_timeout(100)
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
        made = 0
        for _ in range(40):
            ready(page)
            if page.locator(".result").count():
                break
            info = tablebase(read_board(page, chess.WHITE).fen())
            bad = next((m for m in info["moves"] if m["category"] in lost), None)
            click_move(page, (bad or info["moves"][0])["uci"])
            made += 1 if bad else 0
            page.wait_for_timeout(150)
        page.wait_for_selector(".result", timeout=10000)
        ok("trois vies perdues : défaite", "Défaite" in page.inner_text(".result"))

        # Lichess refuse les navigateurs headless : sa réponse est simulée ici, au format réel.
        page.route("https://lichess.org/api/games/user/**", lambda route: route.fulfill(
            status=200, content_type="application/x-chess-pgn", body=LICHESS_PGN,
            headers={"Access-Control-Allow-Origin": "*"},
        ))
        # Chess.com est appelé pour de vrai : lecture seule d'un compte public.
        for source, user in [("lichess", "thibault"), ("chesscom", "hikaru")]:
            page.goto(f"{BASE}/#/boss")
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
