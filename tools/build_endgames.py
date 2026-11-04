#!/usr/bin/env python3
"""Genere data/endgames.json : positions de depart des boss et exercices de la regle du carre.

Chaque position est validee par les tables de finales Lichess (resultat et distance au mat) :
rien n'est suppose gagnant ou nul sans verification.

Usage : pip install chess && python tools/build_endgames.py
"""
import json
import pathlib
import random
import time
import urllib.parse
import urllib.request

import chess

API = "https://tablebase.lichess.ovh/standard?fen="
OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "endgames.json"
cache = {}


def probe(fen):
    if fen in cache:
        return cache[fen]
    url = API + urllib.parse.quote(fen.replace(" ", "_"))
    for attempt in range(6):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "chess-quest-data-builder"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                cache[fen] = json.load(resp)
                time.sleep(0.25)
                return cache[fen]
        except urllib.error.HTTPError as err:
            if err.code != 429:
                raise
            time.sleep(60)
        except OSError:
            time.sleep(5 * (attempt + 1))
    raise RuntimeError("tablebase indisponible")


def place(pieces, turn):
    board = chess.Board(None)
    for sq, piece in pieces.items():
        board.set_piece_at(chess.parse_square(sq), chess.Piece.from_symbol(piece))
    board.turn = turn
    return board


def random_board(symbols, turn, pawn_rank=None):
    """Position legale aleatoire, sans mat ni pat immediat."""
    while True:
        squares = random.sample(list(chess.SQUARES), len(symbols))
        board = chess.Board(None)
        ok = True
        for symbol, sq in zip(symbols, squares):
            if symbol.lower() == "p":
                rank = chess.square_rank(sq)
                if rank in (0, 7) or (pawn_rank and rank not in pawn_rank):
                    ok = False
                    break
            board.set_piece_at(sq, chess.Piece.from_symbol(symbol))
        if not ok:
            continue
        board.turn = turn
        if board.is_valid() and not board.is_game_over():
            return board


def mate_positions(symbols, ranges, per_range):
    """ranges : [(coups_min, coups_max)] en coups complets jusqu'au mat."""
    found = [[] for _ in ranges]
    tries = 0
    while any(len(b) < per_range for b in found) and tries < 1500:
        tries += 1
        board = random_board(symbols, chess.WHITE)
        info = probe(board.fen())
        if info.get("category") != "win" or info.get("dtm") is None:
            continue
        moves = (abs(info["dtm"]) + 1) // 2
        for i, (low, high) in enumerate(ranges):
            if low <= moves <= high and len(found[i]) < per_range:
                found[i].append({"fen": board.fen(), "dtm": moves})
    return found


def kpk_positions(per_kind):
    win, draw = [], []
    tries = 0
    while (len(win) < per_kind or len(draw) < per_kind) and tries < 1500:
        tries += 1
        board = random_board("KPk", chess.WHITE, pawn_rank=(2, 3, 4, 5))
        pawn = board.pieces(chess.PAWN, chess.WHITE).pop()
        wk, bk = board.king(chess.WHITE), board.king(chess.BLACK)
        # Rois proches du pion : c'est la que l'opposition decide de l'issue.
        if chess.square_distance(wk, pawn) > 2 or chess.square_distance(bk, pawn) > 3:
            continue
        if chess.square_file(pawn) in (0, 7):
            continue
        info = probe(board.fen())
        moves = (abs(info.get("dtm") or 0) + 1) // 2
        if info["category"] == "win" and len(win) < per_kind and 5 <= moves <= 22:
            win.append({"fen": board.fen(), "dtm": moves, "verdict": "win"})
        elif info["category"] == "draw" and len(draw) < per_kind:
            draw.append({"fen": board.fen(), "verdict": "draw"})
    return win, draw


def lucena_positions():
    """Motif de Lucena : Roi blanc devant son pion en 7e, roi noir coupe par la tour."""
    out = []
    for pawn_file in "bcdefg":
        f = ord(pawn_file) - 97
        # Coupe du cote le plus large de l'echiquier.
        side = 1 if f <= 3 else -1
        side_file = chr(97 + f + side)            # colonne de coupe
        king_file = chr(97 + f + 2 * side)        # roi noir derriere la coupe
        far_file = chr(97 + f + 3 * side) if 0 <= f + 3 * side <= 7 else None
        other = chr(97 + f - side)                # colonne de la tour noire
        for king_sq_file in filter(None, [king_file, far_file]):
            for king_rank in (7, 6):
                for rook_rank in (2, 3, 1):
                    for rook_home in (1, 2):
                        pieces = {
                            f"{pawn_file}8": "K",
                            f"{pawn_file}7": "P",
                            f"{side_file}{rook_home}": "R",
                            f"{king_sq_file}{king_rank}": "k",
                            f"{other}{rook_rank}": "r",
                        }
                        if len(pieces) < 5:
                            continue
                        board = place(pieces, chess.WHITE)
                        if not board.is_valid():
                            continue
                        info = probe(board.fen())
                        if info["category"] != "win":
                            continue
                        # Distance reelle a la promotion : en dessous de 5 coups, pas besoin de pont.
                        to_promotion = (abs(info["dtz"] or 0) + 1) // 2
                        if to_promotion >= 5:
                            out.append({"fen": board.fen(), "toPromotion": to_promotion})
    random.shuffle(out)
    return out


def philidor_positions():
    """Defense de Philidor : la tour noire garde la 6e rangee, le roi tient la case de promotion."""
    out = []
    for f in "bcdefg":
        i = ord(f) - 97
        for wk_shift in (-1, 0, 1):
            wk_file = chr(97 + i + wk_shift)
            for wr_file in "abcdefgh":
                for wr_rank in (7, 1, 2):
                    for br_file in "abcdefgh":
                        pieces = {
                            f"{wk_file}5": "K",
                            f"{f}5" if wk_shift else f"{f}4": "P",
                            f"{wr_file}{wr_rank}": "R",
                            f"{f}8": "k",
                            f"{br_file}6": "r",
                        }
                        if len(pieces) < 5:
                            continue
                        if random.random() > 0.05:
                            continue
                        board = place(pieces, chess.BLACK)
                        if not board.is_valid() or board.is_game_over():
                            continue
                        info = probe(board.fen())
                        if info["category"] != "draw":
                            continue
                        # Exiger au moins un coup perdant : sinon il n'y a rien a defendre.
                        losing = [m for m in info["moves"] if m["category"] == "win"]
                        if len(losing) >= 3:
                            out.append({"fen": board.fen(), "losingMoves": len(losing)})
    random.shuffle(out)
    return out


def square_rule_exercises(per_kind):
    """Roi noir contre pion passe, roi blanc hors-jeu : le roi noir rattrape-t-il le pion ?"""
    caught, escaped = [], []
    tries = 0
    while (len(caught) < per_kind or len(escaped) < per_kind) and tries < 1500:
        tries += 1
        pawn_file = random.randint(0, 7)
        pawn_rank = random.randint(2, 5)
        pawn = chess.square(pawn_file, pawn_rank)
        # Roi blanc dans un coin eloigne, qui ne peut pas aider.
        wk = chess.square(0 if pawn_file > 4 else 7, 0)
        bk = chess.square(random.randint(0, 7), random.randint(1, 7))
        if len({pawn, wk, bk}) < 3 or chess.square_distance(bk, pawn) < 2:
            continue
        side_to_move = random.choice([chess.WHITE, chess.BLACK])
        board = chess.Board(None)
        board.set_piece_at(pawn, chess.Piece.from_symbol("P"))
        board.set_piece_at(wk, chess.Piece.from_symbol("K"))
        board.set_piece_at(bk, chess.Piece.from_symbol("k"))
        board.turn = side_to_move
        if not board.is_valid() or board.is_game_over():
            continue
        # Cas ou le roi passe tout pres du carre : la question n'a d'interet que la.
        steps = 7 - pawn_rank
        margin = max(abs(chess.square_file(bk) - pawn_file), 7 - chess.square_rank(bk)) - steps
        if side_to_move == chess.BLACK:
            margin -= 1
        if abs(margin) > 1:
            continue
        info = probe(board.fen())
        item = {"fen": board.fen(), "turn": "w" if side_to_move else "b"}
        if info["category"] in ("draw",) and len(caught) < per_kind:
            caught.append({**item, "caught": True})
        elif info["category"] in ("win", "loss") and len(escaped) < per_kind:
            escaped.append({**item, "caught": False})
    return caught + escaped


def tiers(positions, difficulty, per_tier=8):
    """Repartit les positions en trois paliers de difficulte croissante."""
    ordered = sorted(positions[:60], key=difficulty)
    third = max(1, len(ordered) // 3)
    groups = [ordered[:third], ordered[third:2 * third], ordered[2 * third:]]
    return [random.sample(group, min(per_tier, len(group))) for group in groups]


def main():
    random.seed(1858)
    data = {"source": "Positions validees par https://tablebase.lichess.ovh"}

    # Trois paliers : le palier 0 sert le premier combat, les suivants aux revanches.
    data["gardien"] = mate_positions("KQk", [(4, 6), (6, 8), (8, 9)], 10)
    print("gardien", [len(x) for x in data["gardien"]], flush=True)
    data["mur"] = mate_positions("KRk", [(7, 10), (10, 12), (12, 14)], 10)
    print("mur", [len(x) for x in data["mur"]], flush=True)

    win, draw = kpk_positions(25)
    data["opposition"] = {"win": win, "draw": draw}
    print("opposition", len(win), len(draw), flush=True)

    # Paliers : plus la promotion est lointaine, ou plus il y a de coups perdants, plus c'est dur.
    data["lucena"] = tiers(lucena_positions(), lambda p: p["toPromotion"])
    print("lucena", [len(x) for x in data["lucena"]], flush=True)
    data["philidor"] = tiers(philidor_positions(), lambda p: p["losingMoves"])
    print("philidor", [len(x) for x in data["philidor"]], flush=True)

    data["carre"] = square_rule_exercises(30)
    print("carre", len(data["carre"]), flush=True)

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(data, separators=(",", ":")), encoding="utf8")
    print("OK", OUT.stat().st_size, "octets")


if __name__ == "__main__":
    main()
