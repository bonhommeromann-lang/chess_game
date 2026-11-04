#!/usr/bin/env python3
"""Construit tests/fixtures/motifs.json : puzzles Lichess (CC0) avec TOUTES leurs etiquettes.

Sert a mesurer la detection des motifs tactiques : precision et rappel, par motif.
Lit la base en flux et s'arrete des que l'echantillon est complet. Python 3.14+.
"""
import csv
import io
import json
import pathlib
import random
import urllib.request
from compression import zstd

URL = "https://database.lichess.org/lichess_db_puzzle.csv.zst"
OUT = pathlib.Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "motifs.json"
TARGETS = ("fork", "pin", "skewer", "hangingPiece", "mateIn1")
PER_THEME = 200
OTHERS = 400  # puzzles sans aucun de ces motifs : mesurent les fausses alertes
KEPT = set(TARGETS) | {"discoveredAttack", "deflection", "attraction", "sacrifice", "trappedPiece", "backRankMate"}


def main():
    random.seed(1924)
    buckets = {t: [] for t in TARGETS}
    others = []
    decomp = zstd.ZstdDecompressor()
    buf = b""
    header = None
    req = urllib.request.Request(URL, headers={"User-Agent": "chess-up-data-builder"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        while any(len(b) < PER_THEME for b in buckets.values()) or len(others) < OTHERS:
            chunk = resp.read(1 << 18)
            if not chunk:
                break
            while chunk:
                buf += decomp.decompress(chunk)
                chunk = b""
                if decomp.eof:
                    chunk = decomp.unused_data
                    decomp = zstd.ZstdDecompressor()
            lines = buf.split(b"\n")
            buf = lines.pop()
            for raw in lines:
                row = next(csv.reader(io.StringIO(raw.decode("utf8"))))
                if header is None:
                    header = {name: i for i, name in enumerate(row)}
                    continue
                if int(row[header["Popularity"]]) < 80 or int(row[header["NbPlays"]]) < 300:
                    continue
                if random.random() > 0.3:
                    continue
                themes = set(row[header["Themes"]].split())
                item = {
                    "fen": row[header["FEN"]],
                    "moves": row[header["Moves"]],
                    "rating": int(row[header["Rating"]]),
                    "themes": sorted(themes & KEPT),
                }
                hits = [t for t in TARGETS if t in themes]
                if not hits:
                    if len(others) < OTHERS:
                        others.append(item)
                    continue
                for t in hits:
                    if len(buckets[t]) < PER_THEME:
                        buckets[t].append(item)
                        break

    items = [i for b in buckets.values() for i in b] + others
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(items, separators=(",", ":")), encoding="utf8")
    print("OK", {t: len(b) for t, b in buckets.items()}, "autres", len(others), OUT.stat().st_size, "octets")


if __name__ == "__main__":
    main()
