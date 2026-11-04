#!/usr/bin/env python3
"""Construit tests/fixtures/judged_games.json : parties publiques annotees par l'analyse serveur Lichess.

Les annotations ? et ?? servent de reference pour mesurer notre detection des erreurs.
Requiert : pip install chess. Usage : python tools/build_judged_games.py pseudo1 pseudo2 ...
"""
import io
import json
import pathlib
import sys
import urllib.parse
import urllib.request

import chess.pgn

OUT = pathlib.Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "judged_games.json"
PER_USER = 6


def fetch(user):
    query = urllib.parse.urlencode({"max": PER_USER, "analysed": "true", "evals": "true", "literate": "true", "rated": "true",
                                    "perfType": "blitz,rapid,classical"})
    url = f"https://lichess.org/api/games/user/{urllib.parse.quote(user)}?{query}"
    req = urllib.request.Request(url, headers={"Accept": "application/x-chess-pgn", "User-Agent": "chess-up-data-builder"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf8")


def main():
    games = []
    for user in sys.argv[1:]:
        stream = io.StringIO(fetch(user))
        while True:
            game = chess.pgn.read_game(stream)
            if game is None:
                break
            labels = {}
            moves = []
            board = game.board()
            for ply, node in enumerate(game.mainline()):
                moves.append(board.san(node.move))
                board.push(node.move)
                if chess.pgn.NAG_BLUNDER in node.nags:
                    labels[ply] = "??"
                elif chess.pgn.NAG_MISTAKE in node.nags:
                    labels[ply] = "?"
            if len(moves) < 30:
                continue
            # Les pseudos ne servent pas a la mesure : ils ne sont pas conserves.
            headers = game.headers
            if any(g["moves"] == moves for g in games):
                continue
            games.append({
                "whiteElo": headers.get("WhiteElo"), "blackElo": headers.get("BlackElo"),
                "event": headers.get("Event"), "moves": moves, "labels": labels,
            })
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(games, ensure_ascii=False), encoding="utf8")
    print("OK", len(games), "parties,", sum(len(g["labels"]) for g in games), "coups annotes,",
          sum(len(g["moves"]) for g in games), "coups")


if __name__ == "__main__":
    main()
