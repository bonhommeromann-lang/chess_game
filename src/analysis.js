// Analyse des parties réelles : détection des erreurs, lien avec les compétences, badges.
import { Chess } from '../vendor/chess.js';
import { analyse, MATE_SCORE } from './chess/engine.js';
import { materialKey, detectFork, detectLineMotif, playUci, winsHangingPiece } from './chess/detect.js';
import { moveOutcome, pieceCount, positionOutcome, probe } from './chess/tablebase.js';

export const ERROR_THRESHOLD = 150;
const CLAMP = 2000;
const clamp = (x) => Math.max(-CLAMP, Math.min(CLAMP, x));

// ---------------------------------------------------------------------------------------------
// Lecture des PGN
// ---------------------------------------------------------------------------------------------

export function splitPgn(text) {
  return text.replace(/\r/g, '').split(/\n(?=\[Event )/).map((s) => s.trim()).filter(Boolean);
}

const hash = (s) => {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

/** Lit une partie. Retourne null si elle est illisible ou non standard. */
export function parseGame(pgn) {
  const game = new Chess();
  try {
    game.loadPgn(pgn);
  } catch {
    return null;
  }
  const headers = game.getHeaders();
  const moves = game.history({ verbose: true });
  if (moves.length < 6 || moves[0].before !== new Chess().fen()) return null;
  const date = (headers.UTCDate || headers.Date || '').replace(/\./g, '-');
  return {
    id: hash(`${headers.White}|${headers.Black}|${date}|${headers.UTCTime ?? ''}|${moves.map((m) => m.san).join(' ')}`),
    white: headers.White ?? '?',
    black: headers.Black ?? '?',
    whiteElo: Number(headers.WhiteElo) || null,
    blackElo: Number(headers.BlackElo) || null,
    result: headers.Result ?? '*',
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    site: headers.Site ?? '',
    moves,
  };
}

export function playerColor(parsed, username) {
  const name = username.trim().toLowerCase();
  if (!name) return null;
  if (parsed.white.toLowerCase() === name) return 'w';
  if (parsed.black.toLowerCase() === name) return 'b';
  return null;
}

// ---------------------------------------------------------------------------------------------
// Classement d'une erreur : quelle compétence a manqué ?
// ---------------------------------------------------------------------------------------------

function gaveMate(fen, uci) {
  return uci ? playUci(fen, uci).after.isCheckmate() : false;
}

/** Motif tactique d'un coup : la compétence qu'il illustre, ou null. */
export function motifOfMove(fen, uci) {
  if (!uci) return null;
  const { after, move } = playUci(fen, uci);
  if (after.isCheckmate()) return 'mat-en-1';
  if (detectFork(after, move)) return 'fourchette';
  const line = detectLineMotif(after, move);
  if (line === 'pin') return 'clouage';
  if (line === 'skewer') return 'enfilade';
  if (winsHangingPiece(fen, uci)) return 'pieces-en-prise';
  return null;
}

/** Compétence de finale correspondant au matériel, du point de vue de `color`. */
export function endgameSkill(fen, color) {
  const key = materialKey(fen);
  const [white, black] = key.split('v');
  const [me, them] = color === 'w' ? [white, black] : [black, white];
  if ((me === 'KQ' && them === 'K') || (me === 'K' && them === 'KQ')) return 'mat-kq';
  if ((me === 'KR' && them === 'K') || (me === 'K' && them === 'KR')) return 'mat-kr';
  if ((me === 'KP' && them === 'K') || (me === 'K' && them === 'KP')) return 'opposition';
  if (me === 'KRP' && them === 'KR') return 'lucena';
  if (me === 'KR' && them === 'KRP') return 'philidor';
  if (/^KBP*$/.test(me) && /^KBP*$/.test(them)) return 'finales-fous';
  return null;
}

/**
 * Identifie la compétence en cause pour une erreur.
 * best : coup que le moteur préférait. reply : meilleure réponse adverse au coup joué.
 */
export function classifyError({ fen, played, best, reply, plyIndex, color, bestPvLength = 0 }) {
  if (gaveMate(fen, best)) return 'mat-en-1';
  const afterFen = playUci(fen, played).after.fen();
  if (gaveMate(afterFen, reply)) return 'mat-en-1';

  const ending = endgameSkill(fen, color);
  if (ending) return ending;

  const missed = motifOfMove(fen, best);
  if (missed && missed !== 'pieces-en-prise') return missed;
  const suffered = motifOfMove(afterFen, reply);
  if (suffered) return suffered;
  if (missed) return missed;

  if (bestPvLength >= 5 && best) {
    const { after, move } = playUci(fen, best);
    if (after.isAttacked(move.to, after.turn())) return 'combinaisons';
  }
  return plyIndex < 20 ? 'principes' : null;
}

// ---------------------------------------------------------------------------------------------
// Analyse complète
// ---------------------------------------------------------------------------------------------

function outcomeFor(result, color) {
  if (result === '1/2-1/2') return 'draw';
  if (result === '1-0') return color === 'w' ? 'win' : 'loss';
  if (result === '0-1') return color === 'b' ? 'win' : 'loss';
  return 'unknown';
}

const isRookEnding = (fen) => {
  const placement = fen.split(' ')[0];
  return /r/.test(placement) && /R/.test(placement) && !/[qbnQBN]/.test(placement);
};

/** Badges gagnés par une partie analysée : ils prouvent une compétence en conditions réelles. */
export function badgesFromGame(record) {
  const out = [];
  if (record.outcome !== 'win') return out;
  if (record.rookEndingEqualish) out.push('finale-tours');
  if (record.playedMotifs.includes('fourchette')) out.push('fourchette-reelle');
  if (record.playedMotifs.includes('clouage')) out.push('clouage-reel');
  if (record.playedMotifs.includes('enfilade')) out.push('enfilade-reelle');
  if (record.finalMaterial === 'KQvK') out.push('mat-dame-reel');
  if (record.finalMaterial === 'KRvK') out.push('mat-tour-reel');
  if (record.lowestEval <= -300) out.push('retournement');
  if (record.myMoves >= 25 && record.errors.length === 0) out.push('sans-bavure');
  return out;
}

export const BADGES = {
  'finale-tours': { name: 'Tour de force', about: 'A gagné une partie grâce à une finale de tours équilibrée.' },
  'fourchette-reelle': { name: 'Double menace', about: 'A gagné une partie grâce à une fourchette.' },
  'clouage-reel': { name: 'Épinglé', about: 'A gagné une partie grâce à un clouage.' },
  'enfilade-reelle': { name: 'En ligne', about: 'A gagné une partie grâce à une enfilade.' },
  'mat-dame-reel': { name: 'Dame souveraine', about: 'A maté roi seul avec roi + dame dans une vraie partie.' },
  'mat-tour-reel': { name: 'Mur tenu', about: 'A maté roi seul avec roi + tour dans une vraie partie.' },
  retournement: { name: 'Retournement', about: 'A gagné une partie après avoir été nettement moins bien.' },
  'sans-bavure': { name: 'Sans bavure', about: 'A gagné une partie longue sans aucune erreur grave.' },
};

/**
 * Analyse une partie avec le moteur. onProgress(fait, total).
 * Retourne l'enregistrement conservé dans l'état du joueur.
 */
export async function analyseGame(parsed, color, today, { depth = 14, onProgress, signal } = {}) {
  const positions = [...parsed.moves.map((m) => m.before), parsed.moves.at(-1).after];
  const evals = [];
  for (let i = 0; i < positions.length; i += 1) {
    if (signal?.aborted) throw new DOMException('Analyse annulée', 'AbortError');
    const game = new Chess(positions[i]);
    if (game.isGameOver()) {
      const score = game.isCheckmate() ? -MATE_SCORE : 0;
      evals.push({ score, best: null, pv: [] });
    } else {
      evals.push(await analyse(positions[i], depth));
    }
    onProgress?.(i + 1, positions.length);
  }

  const errors = [];
  const playedMotifs = new Set();
  let lowestEval = 0;
  let myMoves = 0;
  let rookEndingEqualish = false;
  let seenRookEnding = false;

  for (let i = 0; i < parsed.moves.length; i += 1) {
    const move = parsed.moves[i];
    const before = evals[i];
    const after = evals[i + 1];
    const uci = move.from + move.to + (move.promotion ?? '');
    const pov = move.color === color ? clamp(before.score) : -clamp(before.score);
    lowestEval = Math.min(lowestEval, pov);
    if (isRookEnding(move.before) && !seenRookEnding) {
      seenRookEnding = true;
      rookEndingEqualish = Math.abs(pov) <= 300;
    }
    if (move.color !== color) continue;
    myMoves += 1;

    const scoreBefore = clamp(before.score);
    const scoreAfter = clamp(-after.score);
    const loss = scoreBefore - scoreAfter;

    // Un coup réellement joué, gardant l'avantage acquis, et illustrant un motif : preuve d'usage.
    if (loss < 50 && scoreAfter >= 200) {
      const motif = motifOfMove(move.before, uci);
      if (motif && motif !== 'mat-en-1' && motif !== 'pieces-en-prise') playedMotifs.add(motif);
    }

    let isError = loss >= ERROR_THRESHOLD && scoreBefore > -500 && !(scoreAfter > 500);
    // En finale peu chargée, la table de finales tranche à la place de l'évaluation du moteur.
    if (pieceCount(move.before) <= 5) {
      try {
        const info = await probe(move.before);
        const start = positionOutcome(info);
        const result = moveOutcome(info, uci);
        isError = (start === 'win' && result !== 'win') || (start === 'draw' && result === 'loss');
      } catch {
        // Tables injoignables : on conserve le jugement du moteur.
      }
    }
    if (!isError) continue;

    errors.push({
      ply: i,
      moveNumber: Math.ceil((i + 1) / 2),
      san: move.san,
      fen: move.before,
      best: before.best,
      loss: Math.round(loss),
      skill: classifyError({
        fen: move.before, played: uci, best: before.best, reply: after.best,
        plyIndex: i, color, bestPvLength: before.pv.length,
      }),
    });
  }

  return {
    id: parsed.id,
    white: parsed.white,
    black: parsed.black,
    color,
    outcome: outcomeFor(parsed.result, color),
    rating: color === 'w' ? parsed.whiteElo : parsed.blackElo,
    date: parsed.date ?? today,
    site: parsed.site,
    myMoves,
    errors,
    playedMotifs: [...playedMotifs],
    lowestEval,
    rookEndingEqualish,
    finalMaterial: materialKey(parsed.moves.at(-1).after).replace(/^(K.*)v(K.*)$/, (_, w, b) =>
      (color === 'w' ? `${w}v${b}` : `${b}v${w}`)),
  };
}

// ---------------------------------------------------------------------------------------------
// Import depuis les plateformes (API publiques, lecture seule)
// ---------------------------------------------------------------------------------------------

export async function fetchLichessGames(username, max) {
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?max=${max}&rated=true&perfType=blitz,rapid,classical`;
  const response = await fetch(url, { headers: { Accept: 'application/x-chess-pgn' } });
  if (response.status === 404) throw new Error('Pseudo introuvable sur Lichess.');
  if (!response.ok) throw new Error(`Lichess a répondu ${response.status}.`);
  return splitPgn(await response.text());
}

export async function fetchChessComGames(username, max) {
  const base = `https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}/games/archives`;
  const archives = await fetch(base);
  if (archives.status === 404) throw new Error('Pseudo introuvable sur Chess.com.');
  if (!archives.ok) throw new Error(`Chess.com a répondu ${archives.status}.`);
  const list = (await archives.json()).archives ?? [];
  const out = [];
  for (const url of [...list].reverse()) {
    if (out.length >= max) break;
    const response = await fetch(url);
    // Le mois en cours peut ne pas être encore disponible : on passe au précédent.
    if (response.status === 404) continue;
    if (!response.ok) throw new Error(`Chess.com a répondu ${response.status}.`);
    const { games = [] } = await response.json();
    // Les variantes (Chess960...) ne relèvent pas de l'entraînement.
    out.push(...games.filter((g) => g.rules === 'chess' && g.pgn).map((g) => g.pgn).reverse());
  }
  return out.slice(0, max);
}

/** Règle de contrôle : les récompenses récentes se retrouvent-elles dans les vraies parties ? */
export function controlVerdict(state, today, windowDays = 30) {
  const since = (day) => (Date.parse(today) - Date.parse(day)) / 86400000 <= windowDays;
  const games = state.games.filter((g) => since(g.date)).sort((a, b) => a.date.localeCompare(b.date));
  const rewards = state.log.filter((l) => l.type === 'gain' && since(l.day)).length +
    Object.values(state.badges).filter((b) => since(b.day)).length;
  const rated = games.filter((g) => g.rating);
  const ratingDelta = rated.length >= 2 ? rated.at(-1).rating - rated[0].rating : null;

  const half = Math.floor(games.length / 2);
  const rate = (list) => {
    const moves = list.reduce((sum, g) => sum + g.myMoves, 0);
    return moves ? (list.reduce((sum, g) => sum + g.errors.length, 0) / moves) * 40 : null;
  };
  const errorsBefore = rate(games.slice(0, half));
  const errorsAfter = rate(games.slice(half));

  const base = { rewards, games: games.length, ratingDelta, errorsBefore, errorsAfter };
  if (games.length < 4) return { ...base, status: 'unknown' };
  const ratingUp = ratingDelta !== null && ratingDelta > 0;
  const errorsDown = errorsBefore !== null && errorsAfter !== null && errorsAfter < errorsBefore;
  if (ratingUp || errorsDown) return { ...base, status: 'confirmed' };
  return { ...base, status: rewards > 0 ? 'warning' : 'flat' };
}
