// Plan d'entraînement : relie les erreurs des vraies parties aux compétences à travailler.
// Le plan ouvre des compétences mais n'en valide jamais : seuls les exercices et les boss valident.
import { daysBetween } from './time.js';
import { estimateElo } from './elo.js';
import { skillData } from './mastery.js';

export const PLAN_SIZE = 3;
export const RECENT_GAMES = 30;
export const RECENT_DAYS = 90;
export const TIER_2_ELO = 1000;
export const TIER_3_ELO = 1500;

/** Niveaux ouverts d'emblée d'après l'Élo : 0 signifie que l'arbre se débloque normalement. */
export function placementFromElo(rating) {
  if (rating >= TIER_3_ELO) return 3;
  if (rating >= TIER_2_ELO) return 2;
  return 0;
}

/** Dernier entraînement réussi : les erreurs plus anciennes ont déjà été traitées. */
function lastTraining(state, id) {
  const data = skillData(state, id);
  const days = [data.lastPracticed, ...data.passes.map((p) => p.day)].filter(Boolean);
  return days.sort().at(-1) ?? null;
}

/**
 * Compétences à travailler, de la plus urgente à la moins urgente : d'abord celles qui reviennent
 * dans le plus de parties, puis la plus fondamentale à égalité.
 */
export function buildPlan(state, defs, today) {
  const byId = new Map(defs.map((d) => [d.id, d]));
  const games = [...(state.games ?? [])]
    .filter((g) => daysBetween(g.date, today) <= RECENT_DAYS)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, RECENT_GAMES);

  const found = new Map();
  for (const game of games) {
    for (const error of game.errors ?? []) {
      const def = error.skill && byId.get(error.skill);
      if (!def) continue;
      const trained = lastTraining(state, def.id);
      if (trained && game.date <= trained) continue;
      const entry = found.get(def.id) ?? { def, games: new Set(), errors: 0, example: null };
      entry.games.add(game.id);
      entry.errors += 1;
      entry.example ??= { ...error, date: game.date };
      found.set(def.id, entry);
    }
  }

  return [...found.values()]
    .sort((a, b) => b.games.size - a.games.size || b.errors - a.errors || a.def.tier - b.def.tier)
    .slice(0, PLAN_SIZE)
    .map((entry) => ({
      id: entry.def.id,
      def: entry.def,
      gameCount: entry.games.size,
      analysed: games.length,
      errors: entry.errors,
      example: entry.example,
      // Une seule partie peut être un accident : le plan le dit plutôt que d'affirmer une faiblesse.
      recurring: entry.games.size >= 2,
    }));
}

/**
 * Met à jour les ouvertures. Elles ne se referment jamais : une mauvaise passe ne doit pas
 * reverrouiller un entraînement déjà accessible.
 */
export function refreshPlacement(state, defs, today) {
  const elo = estimateElo(state);
  if (elo.reliable && elo.rating !== null) {
    state.placementTier = Math.max(state.placementTier ?? 0, placementFromElo(elo.rating));
  }
  const plan = buildPlan(state, defs, today);
  state.planUnlocked ??= {};
  for (const item of plan) state.planUnlocked[item.id] = true;
  return plan;
}

/** Page à ouvrir pour s'entraîner sur une compétence. */
export const trainingHref = (def) => (def.boss ? `#/boss/${def.boss}` : `#/seance/${def.id}`);
