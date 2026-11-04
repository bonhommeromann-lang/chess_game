#!/usr/bin/env python3
"""Mesure la detection des motifs tactiques sur des puzzles etiquetes. Requiert : pip install playwright"""
import json
import pathlib
import socket
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = pathlib.Path(__file__).resolve().parent.parent
ITEMS = json.loads((ROOT / "tests" / "fixtures" / "motifs.json").read_text(encoding="utf8"))
THEME_TO_SKILL = {
    "fork": "fourchette", "pin": "clouage", "skewer": "enfilade",
    "hangingPiece": "pieces-en-prise", "mateIn1": "mat-en-1",
}
# Une solution peut contenir un motif plus loin que le premier coup.
JS = """async (items) => {
  const { Chess } = await import('/vendor/chess.js');
  const { motifOfMove, motifOfLine } = await import('/src/analysis.js');
  const out = [];
  for (const item of items) {
    const moves = item.moves.split(' ');
    const game = new Chess(item.fen);
    game.move({ from: moves[0].slice(0, 2), to: moves[0].slice(2, 4), promotion: moves[0][4] });
    const first = motifOfMove(game.fen(), moves[1]);
    const line = motifOfLine(game.fen(), moves.slice(1));
    const any = [];
    for (let i = 1; i < moves.length; i += 1) {
      if (i % 2 === 1) { const m = motifOfMove(game.fen(), moves[i]); if (m) any.push(m); }
      game.move({ from: moves[i].slice(0, 2), to: moves[i].slice(2, 4), promotion: moves[i][4] });
    }
    out.push({ first, any, line });
  }
  return out;
}"""

with socket.socket() as s:
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
server = subprocess.Popen([sys.executable, str(ROOT / "serve.py"), str(port), "--no-open"], cwd=ROOT, stdout=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        page = browser.new_page()
        page.goto(f"http://127.0.0.1:{port}/tests/index.html", wait_until="commit")
        predictions = page.evaluate(JS, ITEMS)
        browser.close()
finally:
    server.terminate()

print(f"{len(ITEMS)} puzzles\n")
print(f"{'motif':18}{'étiquetés':>10}{'rappel 1er':>12}{'précis. 1er':>13}{'rappel ligne':>14}{'précis. ligne':>15}{'alertes':>9}")
for theme, skill in THEME_TO_SKILL.items():
    labelled = [i for i, x in enumerate(ITEMS) if theme in x["themes"]]
    def score(key):
        predicted = [i for i, pr in enumerate(predictions) if pr[key] == skill]
        hits = sum(1 for i in labelled if predictions[i][key] == skill)
        good = sum(1 for i in predicted if theme in ITEMS[i]["themes"])
        return hits / max(1, len(labelled)), good / max(1, len(predicted)), len(predicted)
    r1, p1, _ = score("first")
    r2, p2, n2 = score("line")
    print(f"{skill:18}{len(labelled):>10}{r1:>12.0%}{p1:>13.0%}{r2:>14.0%}{p2:>15.0%}{n2:>9}")

none = sum(1 for pr in predictions if pr["line"] is None)
print(f"\nsans motif détecté sur la ligne : {none / len(ITEMS):.0%}")
print("\nConfusions (étiquette -> prédit sur la ligne) :")
for theme, skill in THEME_TO_SKILL.items():
    counts = {}
    for x, pr in zip(ITEMS, predictions):
        if theme in x["themes"]:
            counts[pr["line"]] = counts.get(pr["line"], 0) + 1
    print(f"  {skill:18}", sorted(counts.items(), key=lambda kv: -kv[1], )[:5])
others = [pr for x, pr in zip(ITEMS, predictions) if not set(x["themes"]) & set(THEME_TO_SKILL)]
flagged = sum(1 for pr in others if pr["line"])
print(f"\nSans aucune de ces étiquettes : {flagged}/{len(others)} ont tout de même un motif détecté")
