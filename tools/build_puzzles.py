#!/usr/bin/env python3
"""Construit data/puzzles.json a partir de la base de puzzles Lichess (CC0).

Lit la base en flux et s'arrete des que chaque competence a assez d'exercices :
pas besoin de stocker les 310 Mo sur le disque. Python 3.14+ requis (compression.zstd).

Usage : python tools/build_puzzles.py
"""
import csv
import io
import json
import pathlib
import random
import urllib.request
from compression import zstd

URL = "https://database.lichess.org/lichess_db_puzzle.csv.zst"
OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "puzzles.json"

# competence -> (themes requis, themes exclus, bande de classement (min, max))
SKILLS = {
    "pieces-en-prise": ({"hangingPiece"}, set(), (600, 1300)),
    "mat-en-1": ({"mateIn1"}, set(), (500, 1200)),
    "fourchette": ({"fork"}, set(), (1000, 1700)),
    "clouage": ({"pin"}, set(), (1000, 1700)),
    "enfilade": ({"skewer"}, set(), (1000, 1700)),
    "deviation": ({"deflection"}, set(), (1500, 2200)),
    "attraction": ({"attraction"}, set(), (1500, 2200)),
    "combinaisons": ({"long", "sacrifice"}, set(), (1500, 2200)),
    "finales-fous": ({"bishopEndgame"}, set(), (1200, 2000)),
}
PER_BAND = 80  # exercices conserves par bande
BANDS = 2      # bande basse = premiere session, bande haute = confirmation
# Positions de milieu de jeu servant aux questions generees (structures, cases faibles...).
POSITIONS_WANTED = 1500


def band_of(rating, low, high):
    if rating < low or rating >= high:
        return None
    return 0 if rating < (low + high) / 2 else 1


def main():
    random.seed(20261104)
    buckets = {s: [[] for _ in range(BANDS)] for s in SKILLS}
    positions = []
    decomp = zstd.ZstdDecompressor()
    buf = b""
    header = None
    seen_rows = 0

    def done():
        return len(positions) >= POSITIONS_WANTED and all(
            len(b) >= PER_BAND for bands in buckets.values() for b in bands
        )

    req = urllib.request.Request(URL, headers={"User-Agent": "chess-quest-data-builder"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        while not done():
            chunk = resp.read(1 << 18)
            if not chunk:
                break
            # La base est composee de plusieurs trames zstd consecutives.
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
                seen_rows += 1
                rating = int(row[header["Rating"]])
                if (
                    int(row[header["RatingDeviation"]]) > 90
                    or int(row[header["Popularity"]]) < 75
                    or int(row[header["NbPlays"]]) < 150
                ):
                    continue
                themes = set(row[header["Themes"]].split())
                fen, moves = row[header["FEN"]], row[header["Moves"]]
                for skill, (need, avoid, (low, high)) in SKILLS.items():
                    if not need <= themes or themes & avoid:
                        continue
                    band = band_of(rating, low, high)
                    if band is None or len(buckets[skill][band]) >= PER_BAND:
                        continue
                    buckets[skill][band].append(
                        {"id": row[header["PuzzleId"]], "fen": fen, "moves": moves, "rating": rating}
                    )
                if (
                    "middlegame" in themes
                    and len(positions) < POSITIONS_WANTED
                    and random.random() < 0.05
                ):
                    positions.append(fen)
            if seen_rows % 100000 < 1000:
                filled = {s: [len(b) for b in bands] for s, bands in buckets.items()}
                print(seen_rows, len(positions), filled, flush=True)

    OUT.parent.mkdir(exist_ok=True)
    payload = {
        "source": "Lichess puzzle database (CC0) - https://database.lichess.org/#puzzles",
        "skills": buckets,
        "positions": positions,
    }
    OUT.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf8")
    counts = {s: [len(b) for b in bands] for s, bands in buckets.items()}
    print("OK", seen_rows, "lignes lues", counts, "positions:", len(positions), OUT.stat().st_size, "octets")


if __name__ == "__main__":
    main()
