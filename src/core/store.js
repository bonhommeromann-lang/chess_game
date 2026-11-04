// État du joueur, persistant dans le navigateur, avec export/import pour le sauvegarder.
const KEY = 'quete-echecs.v1';

export const emptyState = () => ({
  version: 1,
  skills: {},   // id -> { passes, validatedDay, lastPracticed, intervalDays, decay, realErrors }
  seen: {},     // id d'exercice -> jour
  bosses: {},   // id -> { tier, wins, lastWinDay, attempts }
  story: {},    // id de partie -> { best, attempts, lastDay }
  games: [],    // parties réelles importées et analysées
  badges: {},   // id -> { day, gameId }
  elo: { rating: 1000, attempts: 0 }, // estimation d'après les exercices classés
  placementTier: 0, // niveaux ouverts d'emblée d'après l'Élo
  planUnlocked: {}, // compétences ouvertes par le plan d'entraînement
  daily: {},    // jour -> { tactics, boss, story, done }
  log: [],      // { day, type: 'gain'|'loss', id, reason }
  settings: { username: '', platform: null, onboarded: false },
});

let state = null;

export function loadState() {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? { ...emptyState(), ...JSON.parse(raw) } : emptyState();
  } catch {
    state = emptyState();
  }
  return state;
}

export function saveState() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Sauvegarde impossible', err);
  }
}

export const exportState = () => JSON.stringify(loadState(), null, 2);

export function importState(text) {
  const parsed = JSON.parse(text);
  if (parsed.version !== 1 || typeof parsed.skills !== 'object') {
    throw new Error('Ce fichier n’est pas une sauvegarde valide.');
  }
  state = { ...emptyState(), ...parsed };
  saveState();
}

export function resetState() {
  state = emptyState();
  saveState();
}
