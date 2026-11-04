// Construction des séances d'exercices, toutes sources confondues.
import { Chess } from '../vendor/chess.js';
import { LINES, QUIZZES } from './data/quizzes.js';
import {
  bishopQuality, doubledPawns, isolatedPawns, openFiles, passedPawns, pieceMobility, semiOpenFiles,
  weakSquares,
} from './chess/detect.js';

const cache = {};
const loadJson = (name) => {
  cache[name] ??= fetch(new URL(`../data/${name}.json`, import.meta.url)).then((r) => {
    if (!r.ok) throw new Error(`Données ${name} introuvables`);
    return r.json();
  });
  return cache[name];
};
export const loadEndgames = () => loadJson('endgames');
export const loadPuzzles = () => loadJson('puzzles');

export const shuffle = (list, rng = Math.random) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const fenAfter = (moves) => {
  const game = new Chess();
  moves.split(' ').filter(Boolean).forEach((m) => game.move(m));
  return game.fen();
};

const colorName = (c) => (c === 'w' ? 'blancs' : 'noirs');
const orient = (c) => (c === 'w' ? 'white' : 'black');

/** Choisit d'abord les exercices jamais vus, puis les plus anciens. */
function pickFresh(items, seen, size) {
  const fresh = shuffle(items);
  fresh.sort((a, b) => (seen[a.id] ?? '').localeCompare(seen[b.id] ?? ''));
  return fresh.slice(0, size);
}

function puzzleItems(pool, seen, size) {
  return pickFresh(pool, seen, size).map((p) => ({
    id: `pz-${p.id}`,
    kind: 'puzzle',
    fen: p.fen,
    moves: p.moves.split(' '),
    rating: p.rating,
    weight: p.rating / 1000,
  }));
}

function quizItems(skillId, seen, size) {
  const items = QUIZZES[skillId].map((q, i) => {
    const fen = fenAfter(q.moves);
    return {
      id: `qz-${skillId}-${i}`,
      kind: 'choice',
      fen,
      orientation: orient(new Chess(fen).turn()),
      prompt: q.prompt,
      choices: shuffle(q.choices.map((label, idx) => ({ label, correct: idx === 0 }))),
      why: q.why,
      weight: 1,
    };
  });
  return pickFresh(items, seen, size);
}

function lineItems(skillId, band, size) {
  const { side, lines } = LINES[skillId];
  return shuffle(lines).slice(0, size).map((line, i) => ({
    id: `ln-${skillId}-${i}-${line.name}`,
    kind: 'line',
    side,
    name: line.name,
    moves: line.moves.split(' '),
    // À difficulté haute, le nom de la variante n'est plus annoncé avant de jouer.
    showName: band === 0,
    weight: 1 + band * 0.25,
  }));
}

async function carreItems(band, seen, size) {
  const { carre } = await loadEndgames();
  const items = carre.map((c, i) => ({
    id: `ca-${i}`,
    kind: 'choice',
    fen: c.fen,
    orientation: 'white',
    prompt: `${c.turn === 'w' ? 'Blancs' : 'Noirs'} au trait. Le roi noir rattrape-t-il le pion avant la promotion ?`,
    choices: shuffle([
      { label: 'Oui, il le rattrape', correct: c.caught },
      { label: 'Non, le pion passe', correct: !c.caught },
    ]),
    why: c.caught
      ? 'Le roi entre à temps dans le carré du pion : il le rattrape. La table de finales confirme la nulle.'
      : 'Le roi reste hors du carré du pion : il arrive trop tard. La table de finales confirme le résultat.',
    weight: 1 + band * 0.25,
  }));
  return pickFresh(items, seen, size);
}

// --- Questions générées à partir de vraies positions de parties ---

const PIECE = { n: 'cavalier', b: 'fou', r: 'tour' };

/** Chaque générateur renvoie un exercice ou null si la position ne s'y prête pas. */
export const GENERATORS = {
  activite(fen) {
    const game = new Chess(fen);
    const list = pieceMobility(game).sort((a, b) => b.moves - a.moves);
    if (list.length < 3 || list[0].moves < 6 || list[0].moves - list[1].moves < 3) return null;
    return {
      kind: 'pick',
      fen,
      orientation: orient(game.turn()),
      prompt: `${colorName(game.turn()) === 'blancs' ? 'Blancs' : 'Noirs'} au trait. Clique sur la pièce la plus active (cavalier, fou ou tour) : celle qui a le plus de coups possibles.`,
      answers: [list[0].square],
      why: `Le ${PIECE[list[0].type]} en ${list[0].square} a ${list[0].moves} coups possibles, contre ${list[1].moves} pour la suivante.`,
    };
  },

  'cases-faibles'(fen) {
    const game = new Chess(fen);
    const color = Math.random() < 0.5 ? 'w' : 'b';
    const weak = weakSquares(game, color);
    const ranks = color === 'w' ? [3, 4] : [5, 6];
    const strong = [...'bcdefg'].flatMap((f) => ranks.map((r) => `${f}${r}`))
      .filter((sq) => !weak.includes(sq) && !game.get(sq));
    const candidates = weak.filter((sq) => !game.get(sq));
    if (!candidates.length || strong.length < 2) return null;
    const answer = shuffle(candidates)[0];
    const options = shuffle([answer, ...shuffle(strong).slice(0, 2)]);
    return {
      kind: 'choice',
      fen,
      orientation: orient(color),
      prompt: `Laquelle de ces cases est une case faible du camp ${colorName(color) === 'blancs' ? 'blanc' : 'noir'} : aucun de ses pions ne pourra plus jamais l’attaquer ?`,
      choices: options.map((sq) => ({ label: sq, correct: sq === answer })),
      marks: Object.fromEntries(options.map((sq) => [sq, 'option'])),
      why: `En ${answer}, aucun pion voisin ne peut plus avancer pour la contrôler : une pièce adverse peut s’y installer durablement.`,
    };
  },

  structures(fen) {
    const game = new Chess(fen);
    const color = Math.random() < 0.5 ? 'w' : 'b';
    const name = color === 'w' ? 'blanc' : 'noir';
    const kinds = shuffle([
      { label: 'isolé', list: isolatedPawns(game, color), def: 'aucun pion ami sur les colonnes voisines' },
      { label: 'doublé', list: doubledPawns(game, color), def: 'un autre pion ami sur la même colonne' },
      { label: 'passé', list: passedPawns(game, color), def: 'aucun pion adverse devant lui, ni sur les colonnes voisines' },
    ]);
    const kind = kinds.find((k) => k.list.length);
    if (!kind) return null;
    return {
      kind: 'pick',
      fen,
      orientation: orient(color),
      prompt: `Clique sur un pion ${kind.label} ${name}.`,
      answers: kind.list,
      why: `Un pion ${kind.label} a ${kind.def}. Ici : ${kind.list.join(', ')}.`,
    };
  },

  'bon-mauvais-fou'(fen) {
    const game = new Chess(fen);
    const color = Math.random() < 0.5 ? 'w' : 'b';
    const usable = bishopQuality(game, color).filter((b) => b.total >= 4);
    const clear = usable.find((b) => b.same / b.total >= 0.7 || b.same / b.total <= 0.25);
    if (!clear) return null;
    const bad = clear.same / clear.total >= 0.7;
    return {
      kind: 'choice',
      fen,
      orientation: orient(color),
      prompt: `Observe le fou ${color === 'w' ? 'blanc' : 'noir'} en ${clear.square}, d’après ses propres pions. Est-il bon ou mauvais ?`,
      choices: [{ label: 'Bon fou', correct: !bad }, { label: 'Mauvais fou', correct: bad }],
      marks: { [clear.square]: 'option' },
      why: `${clear.same} pions sur ${clear.total} sont sur la même couleur de cases que lui. ${bad ? 'Ils lui bloquent le chemin : mauvais fou.' : 'Ses diagonales sont libres : bon fou.'}`,
    };
  },

  'colonnes-ouvertes'(fen) {
    const game = new Chess(fen);
    const open = openFiles(game);
    const color = game.turn();
    if (open.length >= 1 && open.length <= 3 && Math.random() < 0.6) {
      return {
        kind: 'pick',
        fen,
        orientation: orient(color),
        prompt: 'Clique sur n’importe quelle case d’une colonne ouverte (sans aucun pion).',
        answers: open.flatMap((f) => [1, 2, 3, 4, 5, 6, 7, 8].map((r) => `${f}${r}`)),
        why: `Colonne${open.length > 1 ? 's' : ''} ouverte${open.length > 1 ? 's' : ''} : ${open.join(', ')}. Aucun pion n’y gêne les tours.`,
      };
    }
    const semi = semiOpenFiles(game, color);
    if (semi.length >= 1 && semi.length <= 3) {
      return {
        kind: 'pick',
        fen,
        orientation: orient(color),
        prompt: `Clique sur une case d’une colonne semi-ouverte pour les ${colorName(color)} : sans pion ${color === 'w' ? 'blanc' : 'noir'}, mais avec un pion adverse.`,
        answers: semi.flatMap((f) => [1, 2, 3, 4, 5, 6, 7, 8].map((r) => `${f}${r}`)),
        why: `Colonnes concernées : ${semi.join(', ')}. Une tour y fait pression sur le pion adverse.`,
      };
    }
    return null;
  },
};

async function generatedItems(skillId, band, seen, size) {
  const { positions } = await loadPuzzles();
  const pieces = (fen) => fen.split(' ')[0].replace(/[^a-zA-Z]/g, '').length;
  // Bande haute : positions plus chargées, donc plus difficiles à lire.
  const pool = shuffle(positions).filter((f) => (band === 0 ? pieces(f) <= 22 : pieces(f) > 22));
  const items = [];
  for (const fen of pool) {
    if (items.length >= size) break;
    const id = `gn-${skillId}-${fen}`;
    if (seen[id]) continue;
    const item = GENERATORS[skillId](fen);
    if (item) items.push({ ...item, id, weight: 1 + band * 0.25 });
  }
  return items;
}

/** Séance pour une compétence. Retourne une liste d'exercices jouables. */
export async function buildSession(def, band, seen, size) {
  switch (def.source) {
    case 'puzzle': {
      const { skills } = await loadPuzzles();
      return puzzleItems(skills[def.id][band], seen, size);
    }
    case 'quiz':
      return quizItems(def.id, seen, size);
    case 'line':
      return lineItems(def.id, band, size);
    case 'carre':
      return carreItems(band, seen, size);
    case 'generated':
      return generatedItems(def.id, band, seen, size);
    default:
      throw new Error(`Compétence sans séance : ${def.id}`);
  }
}

/** Mini-séance tactique de la quête du jour, tirée des compétences débloquées. */
export async function buildTacticsQuest(unlockedIds, seen, size) {
  const { skills } = await loadPuzzles();
  const pool = unlockedIds.flatMap((id) => skills[id]?.[0] ?? []);
  return puzzleItems(pool, seen, size);
}
