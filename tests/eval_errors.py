#!/usr/bin/env python3
"""Compare notre detection des erreurs aux annotations de l'analyse serveur Lichess.

Analyse chaque position une seule fois, sauvegarde les notes brutes, puis evalue plusieurs regles.
Usage : python tests/eval_errors.py [--depth 14] [--cache fichier.json]
"""
import argparse
import json
import math
import pathlib
import socket
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = pathlib.Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument("--depth", type=int, default=16)
parser.add_argument("--cache", default=str(ROOT / "tests" / "fixtures" / "judged_scores.json"))
args = parser.parse_args()
GAMES = json.loads((ROOT / "tests" / "fixtures" / "judged_games.json").read_text(encoding="utf8"))

JS = """async ({ moves, depth }) => {
  const { Chess } = await import('/vendor/chess.js');
  const { analyse, MATE_SCORE } = await import('/src/chess/engine.js');
  const game = new Chess();
  const scores = [];
  const started = performance.now();
  const evalHere = async () => {
    if (game.isGameOver()) return game.isCheckmate() ? -MATE_SCORE : 0;
    return (await analyse(game.fen(), depth)).score;
  };
  scores.push(await evalHere());
  for (const san of moves) {
    game.move(san);
    scores.push(await evalHere());
  }
  return { scores, ms: performance.now() - started };
}"""


def run_engine():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    server = subprocess.Popen([sys.executable, str(ROOT / "serve.py"), str(port), "--no-open"], cwd=ROOT, stdout=subprocess.DEVNULL)
    time.sleep(1)
    out = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(channel="msedge", headless=True)
            page = browser.new_page()
            page.goto(f"http://127.0.0.1:{port}/tests/index.html", wait_until="commit")
            for i, game in enumerate(GAMES):
                result = page.evaluate(JS, {"moves": game["moves"], "depth": args.depth})
                out.append(result)
                print(f"partie {i + 1}/{len(GAMES)} : {len(game['moves'])} demi-coups en {result['ms'] / 1000:.0f} s", flush=True)
            browser.close()
    finally:
        server.terminate()
    return out


cache = pathlib.Path(args.cache)
if cache.exists():
    data = json.loads(cache.read_text(encoding="utf8"))
else:
    data = run_engine()
    cache.write_text(json.dumps(data), encoding="utf8")

CLAMP = 2000


def clamp(x):
    return max(-CLAMP, min(CLAMP, x))


def win(cp):
    return 50 + 50 * (2 / (1 + math.exp(-0.00368208 * cp)) - 1)


def rule_cp(threshold):
    def judge(before, after):
        before, after = clamp(before), clamp(after)
        return before - after >= threshold and before > -500 and not after > 500
    return judge


def rule_win(threshold):
    def judge(before, after):
        return win(clamp(before)) - win(clamp(after)) >= threshold
    return judge


RULES = {"actuelle : 150 cp": rule_cp(150)}
for t in (100, 200, 300):
    RULES[f"perte >= {t} cp"] = rule_cp(t)
for t in (8, 10, 12, 15, 20):
    RULES[f"chances de gain -{t} pts"] = rule_win(t)

ms = sum(r["ms"] for r in data)
plies = sum(len(g["moves"]) for g in GAMES)
print(f"\n{len(GAMES)} parties, {plies} demi-coups, {ms / 1000 / plies:.2f} s par position, "
      f"soit {ms / 1000 / plies * 80 / 60:.1f} min pour une partie de 40 coups")
blunders = sum(1 for g in GAMES for v in g["labels"].values() if v == "??")
mistakes = sum(1 for g in GAMES for v in g["labels"].values() if v == "?")
print(f"Référence Lichess : {blunders} gaffes (??), {mistakes} erreurs (?)\n")
print(f"{'règle':28}{'signalés':>9}{'justes':>9}{'trouve ??':>11}{'trouve ?':>10}")
for name, judge in RULES.items():
    flagged = good = found_blunders = found_mistakes = 0
    for game, result in zip(GAMES, data):
        scores = result["scores"]
        for ply in range(len(game["moves"])):
            label = game["labels"].get(str(ply))
            is_flagged = judge(scores[ply], -scores[ply + 1])
            if is_flagged:
                flagged += 1
                good += 1 if label else 0
                found_blunders += 1 if label == "??" else 0
                found_mistakes += 1 if label == "?" else 0
    print(f"{name:28}{flagged:>9}{good / max(1, flagged):>9.0%}{found_blunders / max(1, blunders):>11.0%}{found_mistakes / max(1, mistakes):>10.0%}")
