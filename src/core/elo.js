// Élo estimé. Il combine les vraies parties, qui comptent le plus, et les exercices classés.
//
// Les exercices suivent une mise à jour de type Elo : réussir un exercice très facile ne rapporte
// presque rien, donc enchaîner des exercices faciles ne fait pas monter l'estimation.
export const START_RATING = 1000;
export const MIN_ATTEMPTS = 5;
export const RELIABLE_ATTEMPTS = 20;
const RECENT_GAMES = 5;
const GAMES_WEIGHT = 0.7;

const expected = (rating, opponent) => 1 / (1 + 10 ** ((opponent - rating) / 400));

/** Plus il y a d'exercices joués, moins chacun fait bouger l'estimation. */
const stepSize = (attempts) => Math.max(24, 160 / (1 + attempts * 0.25));

export function recordRatedExercise(state, exerciseRating, correct) {
  const current = state.elo ?? { rating: START_RATING, attempts: 0 };
  const rating = current.rating +
    stepSize(current.attempts) * ((correct ? 1 : 0) - expected(current.rating, exerciseRating));
  state.elo = { rating, attempts: current.attempts + 1 };
}

function recentGamesRating(state) {
  const rated = (state.games ?? [])
    .filter((g) => g.rating)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-RECENT_GAMES);
  if (!rated.length) return null;
  return { rating: rated.reduce((sum, g) => sum + g.rating, 0) / rated.length, count: rated.length };
}

export function eloTitle(rating) {
  if (rating < 800) return 'Débutant';
  if (rating < 1200) return 'Novice';
  if (rating < 1600) return 'Intermédiaire';
  if (rating < 2000) return 'Avancé';
  if (rating < 2300) return 'Expert';
  return 'Maître';
}

/**
 * Retourne { rating, title, source, reliable } ; rating vaut null tant qu'il n'y a pas assez
 * d'éléments pour estimer quoi que ce soit.
 */
export function estimateElo(state) {
  const games = recentGamesRating(state);
  const attempts = state.elo?.attempts ?? 0;
  const exercises = attempts >= MIN_ATTEMPTS ? state.elo.rating : null;
  let rating = null;
  if (games && exercises !== null) rating = GAMES_WEIGHT * games.rating + (1 - GAMES_WEIGHT) * exercises;
  else if (games) rating = games.rating;
  else if (exercises !== null) rating = exercises;

  if (rating === null) {
    return {
      rating: null,
      title: 'À évaluer',
      source: `Encore ${MIN_ATTEMPTS - attempts} tactique${MIN_ATTEMPTS - attempts > 1 ? 's' : ''} ou une partie importée pour une première estimation.`,
      reliable: false,
    };
  }
  const parts = [];
  if (games) parts.push(`${games.count} partie${games.count > 1 ? 's' : ''} réelle${games.count > 1 ? 's' : ''}`);
  if (exercises !== null) parts.push(`${attempts} exercices`);
  return {
    rating: Math.round(rating),
    title: eloTitle(rating),
    source: `Estimé d’après ${parts.join(' et ')}.`,
    reliable: Boolean(games) || attempts >= RELIABLE_ATTEMPTS,
  };
}
