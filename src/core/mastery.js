// Règles de l'arbre de compétences. Fonctions pures : (état, définition, jour) -> résultat.
//
// Anti-farm : aucune progression au volume. Une compétence se valide par deux sessions réussies
// à 80 %, séparées d'au moins un jour, la seconde à difficulté supérieure. Rejouer des exercices
// faciles ne rapporte donc rien.
import { addDays, daysBetween } from './time.js';

export const PASS_THRESHOLD = 0.8;
export const SESSION_SIZE = 8;
export const REVIEW_SIZE = 5;
export const BASE_INTERVAL = 21;
export const MAX_INTERVAL = 120;
export const REAL_ERROR_GAMES = 2;   // parties distinctes avant de passer en orange
export const REAL_ERROR_WINDOW = 30; // jours
export const REMATCH_DAYS = 7;
export const REMATCH_GRACE = 3;

const blank = () => ({
  passes: [], validatedDay: null, lastPracticed: null, intervalDays: BASE_INTERVAL,
  decay: null, realErrors: [],
});

export const skillData = (state, id) => state.skills[id] ?? blank();

function ensure(state, id) {
  state.skills[id] ??= blank();
  return state.skills[id];
}

/** Ouverte par ses prérequis, par le niveau du joueur, ou parce que ses parties la recommandent. */
export function isUnlocked(state, def) {
  if ((state.placementTier ?? 0) >= def.tier || state.planUnlocked?.[def.id]) return true;
  return def.requires.every((req) => skillData(state, req).validatedDay);
}

/** Erreurs réelles récentes commises depuis la dernière révision réussie. */
export function recentRealErrors(state, id, today) {
  const data = skillData(state, id);
  return data.realErrors.filter((e) =>
    daysBetween(e.day, today) <= REAL_ERROR_WINDOW &&
    (!data.lastPracticed || e.day >= data.lastPracticed));
}

/** Raison de dégradation actuelle, ou null. */
export function decayReason(state, def, today) {
  const data = skillData(state, def.id);
  if (!data.validatedDay) return null;
  if (data.decay) return data.decay;
  const games = new Set(recentRealErrors(state, def.id, today).map((e) => e.gameId));
  if (games.size >= REAL_ERROR_GAMES) return 'parties';
  if (def.boss) {
    const boss = state.bosses?.[def.boss];
    if (boss?.lastWinDay &&
        daysBetween(addDays(boss.lastWinDay, REMATCH_DAYS), today) > REMATCH_GRACE) return 'revanche';
    return null;
  }
  if (data.lastPracticed && daysBetween(data.lastPracticed, today) > data.intervalDays) return 'oubli';
  return null;
}

/** locked | available | progress | validated | decayed */
export function skillStatus(state, def, today) {
  const data = skillData(state, def.id);
  if (data.validatedDay) return decayReason(state, def, today) ? 'decayed' : 'validated';
  if (!isUnlocked(state, def)) return 'locked';
  return data.passes.length ? 'progress' : 'available';
}

/** Une compétence peut être signalée par les parties réelles, même validée. */
export const isFlagged = (state, def, today) => recentRealErrors(state, def.id, today).length > 0;

/** Bande de difficulté à servir : 0 pour la 1re session, 1 pour la confirmation et les révisions. */
export function nextBand(state, def) {
  const data = skillData(state, def.id);
  return data.validatedDay || data.passes.length ? 1 : 0;
}

/** Une seule session réussie compte par jour : la régularité est exigée, pas le volume. */
export function canEarnToday(state, def, today) {
  const data = skillData(state, def.id);
  if (data.validatedDay) return true;
  return !data.passes.some((p) => p.day === today);
}

/** Score pondéré par la difficulté : rater un exercice dur coûte plus que rater un facile. */
export function scoreSession(results) {
  const total = results.reduce((sum, r) => sum + r.weight, 0);
  if (!total) return 0;
  return results.reduce((sum, r) => sum + (r.correct ? r.weight : 0), 0) / total;
}

/**
 * Enregistre une session terminée.
 * results : [{ correct, weight }], band : bande réellement jouée.
 * Retourne { score, passed, counted, event: null|'gain'|'restored', reason? }.
 */
export function recordSession(state, def, { results, band }, today) {
  const data = ensure(state, def.id);
  const score = scoreSession(results);
  const passed = score >= PASS_THRESHOLD && results.length >= 5;
  const outcome = { score, passed, counted: false, event: null };
  if (!passed) {
    outcome.reason = results.length >= 5 ? 'score' : 'trop-court';
    return outcome;
  }

  if (data.validatedDay) {
    const wasDecayed = Boolean(decayReason(state, def, today));
    data.lastPracticed = today;
    data.decay = null;
    data.realErrors = [];
    if (wasDecayed) {
      data.intervalDays = Math.min(data.intervalDays * 2, MAX_INTERVAL);
      outcome.event = 'restored';
      state.log.push({ day: today, type: 'gain', id: def.id, reason: 'revision' });
    }
    outcome.counted = true;
    return outcome;
  }

  const expected = data.passes.length ? 1 : 0;
  if (band < expected) {
    outcome.reason = 'difficulte';
    return outcome;
  }
  if (data.passes.some((p) => daysBetween(p.day, today) < 1)) {
    outcome.reason = 'meme-jour';
    return outcome;
  }
  data.passes.push({ day: today, score, band });
  outcome.counted = true;
  if (data.passes.length >= 2) {
    validate(state, def, today);
    outcome.event = 'gain';
  }
  return outcome;
}

function validate(state, def, today) {
  const data = ensure(state, def.id);
  data.validatedDay = today;
  data.lastPracticed = today;
  data.decay = null;
  data.realErrors = [];
  state.log.push({ day: today, type: 'gain', id: def.id, reason: 'validation' });
}

/** Une victoire contre un boss valide la compétence et programme la revanche. */
export function recordBossWin(state, bossId, skillDef, today, maxTier) {
  const boss = (state.bosses[bossId] ??= { tier: 0, wins: 0, lastWinDay: null, attempts: 0 });
  const data = ensure(state, skillDef.id);
  const wasDecayed = Boolean(decayReason(state, skillDef, today));
  boss.wins += 1;
  boss.lastWinDay = today;
  boss.tier = Math.min(boss.tier + 1, maxTier);
  if (!data.validatedDay) {
    validate(state, skillDef, today);
    return 'gain';
  }
  data.lastPracticed = today;
  data.decay = null;
  data.realErrors = [];
  if (wasDecayed) state.log.push({ day: today, type: 'gain', id: skillDef.id, reason: 'revanche' });
  return wasDecayed ? 'restored' : null;
}

export function rematchInfo(state, bossId, today) {
  const boss = state.bosses?.[bossId];
  if (!boss?.lastWinDay) return { due: false, day: null, tier: boss?.tier ?? 0 };
  const day = addDays(boss.lastWinDay, REMATCH_DAYS);
  return { due: daysBetween(day, today) >= 0, day, tier: boss.tier };
}

/** Enregistre une erreur détectée en partie réelle. Fait passer en orange si elle se répète. */
export function recordRealError(state, def, gameId, day, today) {
  const data = ensure(state, def.id);
  if (data.realErrors.some((e) => e.gameId === gameId)) return;
  const before = Boolean(decayReason(state, def, today));
  data.realErrors.push({ gameId, day });
  if (!before && decayReason(state, def, today)) {
    state.log.push({ day: today, type: 'loss', id: def.id, reason: 'parties' });
  }
}

/** Fige et journalise les dégradations par oubli (appelé au démarrage de l'application). */
export function syncDecay(state, defs, today) {
  for (const def of defs) {
    const reason = decayReason(state, def, today);
    if (!reason || reason === 'parties') continue;
    const data = ensure(state, def.id);
    if (data.decay !== reason) {
      data.decay = reason;
      state.log.push({ day: today, type: 'loss', id: def.id, reason });
    }
  }
}

/** Niveau de branche sur 100, pondéré par palier. Le volume de jeu n'y entre pas. */
export function branchLevel(state, defs, today) {
  let total = 0;
  let earned = 0;
  for (const def of defs) {
    total += def.tier;
    const status = skillStatus(state, def, today);
    if (status === 'validated') earned += def.tier;
    else if (status === 'decayed') earned += def.tier * 0.5;
    else if (status === 'progress') earned += def.tier * 0.25;
  }
  return total ? Math.round((earned / total) * 100) : 0;
}

export function levelName(score) {
  if (score >= 85) return 'Maître';
  if (score >= 60) return 'Confirmé';
  if (score >= 35) return 'Solide';
  if (score > 0) return 'Apprenti';
  return 'Novice';
}
