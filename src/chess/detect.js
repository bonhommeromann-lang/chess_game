// Détecteurs déterministes : structures de pions, cases faibles, fous, colonnes, activité,
// et motifs tactiques (fourchette, clouage, enfilade) utilisés sur les parties réelles.
import { Chess } from '../../vendor/chess.js';

const FILES = 'abcdefgh';
export const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

const fileIdx = (sq) => FILES.indexOf(sq[0]);
const rankOf = (sq) => Number(sq[1]);

function allPieces(game) {
  return game.board().flat().filter(Boolean);
}

function pawnsOf(game, color) {
  return allPieces(game).filter((p) => p.type === 'p' && p.color === color).map((p) => p.square);
}

export function isolatedPawns(game, color) {
  const pawns = pawnsOf(game, color);
  return pawns.filter((sq) => !pawns.some((o) => Math.abs(fileIdx(o) - fileIdx(sq)) === 1));
}

export function doubledPawns(game, color) {
  const pawns = pawnsOf(game, color);
  return pawns.filter((sq) => pawns.some((o) => o !== sq && o[0] === sq[0]));
}

export function passedPawns(game, color) {
  const enemy = pawnsOf(game, color === 'w' ? 'b' : 'w');
  const ahead = (a, b) => (color === 'w' ? rankOf(a) > rankOf(b) : rankOf(a) < rankOf(b));
  return pawnsOf(game, color).filter((sq) =>
    !enemy.some((e) => Math.abs(fileIdx(e) - fileIdx(sq)) <= 1 && ahead(e, sq)));
}

/**
 * Cases faibles du camp `color` : cases de sa moitié d'échiquier (hors bords) qu'aucun de ses
 * pions ne pourra plus jamais attaquer.
 */
export function weakSquares(game, color) {
  const pawns = pawnsOf(game, color);
  const ranks = color === 'w' ? [3, 4] : [5, 6];
  const out = [];
  for (const f of 'bcdefg') {
    for (const r of ranks) {
      const sq = `${f}${r}`;
      if (pawns.includes(sq)) continue;
      const canGuard = pawns.some((p) => {
        if (Math.abs(fileIdx(p) - fileIdx(sq)) !== 1) return false;
        return color === 'w' ? rankOf(p) < r : rankOf(p) > r;
      });
      if (!canGuard) out.push(sq);
    }
  }
  return out;
}

/** Couleur de la case : 'light' ou 'dark'. */
export const squareColor = (sq) => ((fileIdx(sq) + rankOf(sq)) % 2 === 0 ? 'light' : 'dark');

/** Pour chaque fou : part de ses propres pions sur la couleur de ses cases. */
export function bishopQuality(game, color) {
  const pawns = pawnsOf(game, color);
  return allPieces(game)
    .filter((p) => p.type === 'b' && p.color === color)
    .map((p) => {
      const same = pawns.filter((sq) => squareColor(sq) === squareColor(p.square)).length;
      return { square: p.square, same, total: pawns.length };
    });
}

export function openFiles(game) {
  const pawns = allPieces(game).filter((p) => p.type === 'p').map((p) => p.square[0]);
  return [...FILES].filter((f) => !pawns.includes(f));
}

export function semiOpenFiles(game, color) {
  const own = pawnsOf(game, color).map((s) => s[0]);
  const enemy = pawnsOf(game, color === 'w' ? 'b' : 'w').map((s) => s[0]);
  return [...FILES].filter((f) => !own.includes(f) && enemy.includes(f));
}

/** Mobilité légale des pièces du camp au trait, hors roi, dame et pions. */
export function pieceMobility(game) {
  const color = game.turn();
  return allPieces(game)
    .filter((p) => p.color === color && ['n', 'b', 'r'].includes(p.type))
    .map((p) => ({
      square: p.square,
      type: p.type,
      moves: game.moves({ square: p.square, verbose: true }).length,
    }));
}

// ---------------------------------------------------------------------------------------------
// Motifs tactiques
// ---------------------------------------------------------------------------------------------

/** La pièce adverse sur `sq` est-elle défendue ? */
const isDefended = (game, sq, color) => game.isAttacked(sq, color);

/**
 * Après le coup `move` (objet verbose chess.js, position `after`), détecte une fourchette :
 * la pièce jouée attaque au moins deux pièces adverses plus chères qu'elle ou non défendues,
 * sans pouvoir être prise gratuitement.
 */
export function detectFork(after, move) {
  const us = move.color;
  const them = us === 'w' ? 'b' : 'w';
  if (isDefended(after, move.to, them) && !isDefended(after, move.to, us)) return false;
  const attacked = attacksFrom(after, move.to, us);
  const victims = attacked.filter(({ piece, square }) => {
    if (piece.color !== them) return false;
    if (piece.type === 'k') return true;
    if (VALUE[piece.type] > VALUE[move.piece]) return true;
    return VALUE[piece.type] >= 3 && !isDefended(after, square, them);
  });
  return victims.length >= 2;
}

const DIRS = {
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  q: [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]],
  n: [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]],
};

const toSq = (f, r) => (f >= 0 && f < 8 && r >= 1 && r <= 8 ? `${FILES[f]}${r}` : null);

/** Pièces atteintes par la pièce de `square`, sans tenir compte du trait. */
function attacksFrom(game, square, color) {
  const piece = game.get(square);
  if (!piece) return [];
  const f = fileIdx(square);
  const r = rankOf(square);
  const out = [];
  const add = (sq) => {
    const target = sq && game.get(sq);
    if (target) out.push({ square: sq, piece: target });
    return target;
  };
  if (piece.type === 'p') {
    const dr = color === 'w' ? 1 : -1;
    add(toSq(f - 1, r + dr));
    add(toSq(f + 1, r + dr));
  } else if (piece.type === 'n' || piece.type === 'k') {
    const steps = piece.type === 'n' ? DIRS.n : DIRS.q;
    for (const [df, dr] of steps) add(toSq(f + df, r + dr));
  } else {
    for (const [df, dr] of DIRS[piece.type]) {
      let cf = f + df;
      let cr = r + dr;
      while (toSq(cf, cr)) {
        if (add(toSq(cf, cr))) break;
        cf += df;
        cr += dr;
      }
    }
  }
  return out;
}

/** Sur les lignes de la pièce jouée : renvoie 'pin', 'skewer' ou null. */
export function detectLineMotif(after, move) {
  if (!['b', 'r', 'q'].includes(move.piece)) return null;
  const them = move.color === 'w' ? 'b' : 'w';
  const f = fileIdx(move.to);
  const r = rankOf(move.to);
  for (const [df, dr] of DIRS[move.piece]) {
    let cf = f + df;
    let cr = r + dr;
    const hits = [];
    while (toSq(cf, cr) && hits.length < 2) {
      const piece = after.get(toSq(cf, cr));
      if (piece) hits.push(piece);
      cf += df;
      cr += dr;
    }
    if (hits.length < 2 || hits[0].color !== them || hits[1].color !== them) continue;
    const [front, back] = hits;
    if (VALUE[front.type] >= 3 && VALUE[back.type] > VALUE[front.type] && VALUE[back.type] > VALUE[move.piece]) {
      return 'pin';
    }
    if (VALUE[front.type] > VALUE[back.type] && VALUE[back.type] >= 3 && VALUE[front.type] > VALUE[move.piece]) {
      return 'skewer';
    }
  }
  return null;
}

/**
 * Exploitation d'un clouage déjà en place : une de nos pièces à longue portée cloue une pièce
 * adverse sur son roi ou sa dame, et le coup joué attaque ou prend cette pièce clouée.
 */
export function exploitsPin(after, move) {
  const us = move.color;
  const them = us === 'w' ? 'b' : 'w';
  const targets = new Set(attacksFrom(after, move.to, us)
    .filter(({ piece }) => piece.color === them)
    .map(({ square }) => square));
  for (const piece of allPieces(after)) {
    if (piece.color !== us || !['b', 'r', 'q'].includes(piece.type)) continue;
    for (const [df, dr] of DIRS[piece.type]) {
      let cf = fileIdx(piece.square) + df;
      let cr = rankOf(piece.square) + dr;
      const hits = [];
      while (toSq(cf, cr) && hits.length < 2) {
        const found = after.get(toSq(cf, cr));
        if (found) hits.push({ ...found, square: toSq(cf, cr) });
        cf += df;
        cr += dr;
      }
      if (hits.length < 2 || hits[0].color !== them || hits[1].color !== them) continue;
      const [front, back] = hits;
      const pinned = VALUE[front.type] >= 3 && VALUE[back.type] > VALUE[front.type] && ['k', 'q'].includes(back.type);
      if (pinned && targets.has(front.square) && piece.square !== move.to) return true;
    }
  }
  return false;
}

/**
 * Sacrifice : la pièce jouée (hors pion) peut être prise avec perte de matériel, soit parce qu'elle
 * n'est pas défendue, soit parce que l'adversaire la prend avec une pièce de moindre valeur.
 */
export function isSacrifice(after, move) {
  if (move.piece === 'p') return false;
  const them = move.color === 'w' ? 'b' : 'w';
  const attackers = after.moves({ verbose: true }).filter((m) => m.to === move.to && m.captured);
  if (!attackers.length) return false;
  const gained = VALUE[move.captured] ?? 0;
  if (VALUE[move.piece] <= gained) return false;
  const defended = after.isAttacked(move.to, move.color);
  const cheapest = Math.min(...attackers.map((m) => VALUE[m.piece]));
  return them === after.turn() && (!defended || cheapest < VALUE[move.piece]);
}

/** Applique un coup UCI et renvoie { after, move } sans modifier la position d'origine. */
export function playUci(fen, uci) {
  const game = new Chess(fen, { skipValidation: true });
  const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  return { after: game, move };
}

/** Le coup UCI capture-t-il une pièce laissée sans protection suffisante ? */
export function winsHangingPiece(fen, uci) {
  const { after, move } = playUci(fen, uci);
  if (!move.captured || VALUE[move.captured] < 3) return false;
  const them = move.color === 'w' ? 'b' : 'w';
  return !isDefended(after, move.to, them) || VALUE[move.captured] > VALUE[move.piece];
}

/** Signature de matériel, ex. « KRPvKR » du point de vue des blancs. */
export function materialKey(fen) {
  const placement = fen.split(' ')[0];
  const order = 'KQRBNP';
  const side = (test) => [...order]
    .map((p) => p.repeat([...placement].filter((c) => test(c) && c.toUpperCase() === p).length))
    .join('');
  return `${side((c) => c === c.toUpperCase() && /[A-Z]/.test(c))}v${side((c) => c === c.toLowerCase() && /[a-z]/.test(c))}`;
}
