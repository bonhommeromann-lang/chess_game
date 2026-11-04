// Quêtes quotidiennes et série avec tolérance d'un jour manqué par semaine.
import { addDays, daysBetween } from './time.js';

export const TACTICS_GOAL = 5;
export const STORY_GOAL = 3;

export function dailyEntry(state, today) {
  state.daily[today] ??= { tactics: 0, boss: 0, story: 0, done: false };
  return state.daily[today];
}

export function advanceQuest(state, today, kind, amount = 1) {
  const entry = dailyEntry(state, today);
  entry[kind] = (entry[kind] ?? 0) + amount;
  entry.done = entry.tactics >= TACTICS_GOAL && entry.boss >= 1 && entry.story >= STORY_GOAL;
  return entry;
}

/**
 * Série : jours de quête terminée, en remontant le temps. Un jour manqué est pardonné s'il
 * n'y en a pas eu d'autre dans la même fenêtre de 7 jours. Aujourd'hui, tant qu'il n'est pas
 * terminé, n'interrompt jamais la série.
 */
export function streakInfo(state, today) {
  const done = (day) => Boolean(state.daily[day]?.done);
  const doneDays = Object.keys(state.daily).filter(done).sort();
  let length = done(today) ? 1 : 0;
  let lastMiss = null;
  let cursor = addDays(today, -1);
  while (doneDays.length && cursor >= doneDays[0]) {
    if (done(cursor)) {
      length += 1;
    } else {
      if (lastMiss !== null && daysBetween(cursor, lastMiss) < 7) break;
      lastMiss = cursor;
    }
    cursor = addDays(cursor, -1);
  }
  const toleranceUsed = lastMiss !== null && daysBetween(lastMiss, today) < 7;
  return { length, toleranceUsed };
}
