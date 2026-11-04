// Tables de finales (jusqu'à 7 pièces) via l'API publique Lichess, avec cache en mémoire.
const API = 'https://tablebase.lichess.ovh/standard?fen=';
const cache = new Map();

export class TablebaseError extends Error {}

export async function probe(fen) {
  if (cache.has(fen)) return cache.get(fen);
  let response;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetch(API + encodeURIComponent(fen.replaceAll(' ', '_')));
    } catch {
      response = null;
    }
    if (response?.ok) break;
    if (response && response.status !== 429 && response.status < 500) break;
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
  if (!response?.ok) {
    throw new TablebaseError('Les tables de finales sont injoignables. Vérifie ta connexion.');
  }
  const data = await response.json();
  cache.set(fen, data);
  return data;
}

/** Nombre de pièces sur l'échiquier d'après la FEN. */
export const pieceCount = (fen) => fen.split(' ')[0].replace(/[^a-zA-Z]/g, '').length;

/**
 * Classe un coup depuis la réponse de la table, du point de vue du joueur.
 * L'API note chaque coup du point de vue de l'adversaire qui jouera ensuite.
 */
export function moveOutcome(info, uci) {
  const entry = info.moves.find((m) => m.uci === uci);
  if (!entry) return 'unknown';
  if (['loss', 'syzygy-loss', 'maybe-loss', 'blessed-loss'].includes(entry.category)) return 'win';
  if (['win', 'syzygy-win', 'maybe-win', 'cursed-win'].includes(entry.category)) return 'loss';
  return 'draw';
}

export const positionOutcome = (info) => {
  if (['win', 'syzygy-win', 'maybe-win', 'cursed-win'].includes(info.category)) return 'win';
  if (['loss', 'syzygy-loss', 'maybe-loss', 'blessed-loss'].includes(info.category)) return 'loss';
  return 'draw';
};
