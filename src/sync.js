// Synchronisation du compte en arrière-plan : elle continue quand le joueur change de page,
// et reprend à la visite suivante si l'onglet a été fermé (les parties déjà analysées sont gardées).
import { dayKey } from './core/time.js';
import { loadState, saveState } from './core/store.js';
import { recordRealError } from './core/mastery.js';
import { skillById } from './data/skills.js';
import {
  analyseGame, badgesFromGame, fetchChessComGames, fetchLichessGames, parseGame, playerColor,
} from './analysis.js';

export const SYNC_GAMES = 20;

export const PLATFORMS = {
  chesscom: { name: 'Chess.com', fetchGames: fetchChessComGames, profile: (u) => `https://api.chess.com/pub/player/${encodeURIComponent(u.toLowerCase())}` },
  lichess: { name: 'Lichess', fetchGames: fetchLichessGames, profile: (u) => `https://lichess.org/api/user/${encodeURIComponent(u)}` },
};

const listeners = new Set();
let status = { running: false, done: 0, total: 0, error: null, finished: false, message: '' };

export const syncStatus = () => status;
export const onSync = (fn) => listeners.add(fn);

function update(patch, event = 'status') {
  status = { ...status, ...patch };
  listeners.forEach((fn) => fn(event, status));
}

/** Vérifie qu'un compte existe, sans rien stocker. Lance une erreur lisible sinon. */
export async function verifyAccount(platform, username) {
  const info = PLATFORMS[platform];
  let response;
  try {
    response = await fetch(info.profile(username));
  } catch {
    throw new Error(`${info.name} n’est pas joignable. Vérifie ta connexion.`);
  }
  if (response.status === 404) throw new Error(`Aucun compte « ${username} » sur ${info.name}. Vérifie l’orthographe.`);
  if (!response.ok) throw new Error(`${info.name} a répondu ${response.status}. Réessaie dans un instant.`);
}

/** Intègre une partie analysée : erreurs reliées aux compétences, badges, enregistrement. */
export function applyRecord(state, record, today) {
  state.games.push(record);
  for (const error of record.errors) {
    const def = error.skill && skillById(error.skill);
    if (def) recordRealError(state, def, record.id, record.date, today);
  }
  for (const badge of badgesFromGame(record)) {
    state.badges[badge] ??= { day: record.date, gameId: record.id };
  }
}

/** Le bullet reflète surtout la gestion du temps : on l'écarte, sauf s'il n'y a que ça. */
export function selectGames(parsed, username, known) {
  const mine = parsed.filter((g) => playerColor(g, username));
  const serious = mine.filter((g) => g.timeClass !== 'bullet');
  const pool = serious.length ? serious : mine;
  return { mine, fresh: pool.filter((g) => !known.has(g.id)) };
}

async function analyseAll(games, username) {
  const state = loadState();
  const today = dayKey();
  update({ total: games.length, done: 0 });
  for (let i = 0; i < games.length; i += 1) {
    const record = await analyseGame(games[i], playerColor(games[i], username), today);
    applyRecord(state, record, today);
    saveState();
    update({ done: i + 1 }, 'game');
  }
}

/** Récupère et analyse les nouvelles parties du compte lié. Sans effet si une synchro tourne déjà. */
export async function syncAccount() {
  if (status.running) return;
  const state = loadState();
  const { username, platform } = state.settings;
  if (!username || !PLATFORMS[platform]) return;
  update({ running: true, done: 0, total: 0, error: null, finished: false, message: '' });
  try {
    const pgns = await PLATFORMS[platform].fetchGames(username, SYNC_GAMES);
    const parsed = pgns.map(parseGame).filter(Boolean);
    const known = new Set(state.games.map((g) => g.id));
    const { mine, fresh } = selectGames(parsed, username, known);
    if (!mine.length) {
      update({ running: false, finished: true, message: 'Aucune partie classée trouvée sur ce compte.' });
      return;
    }
    await analyseAll(fresh, username);
    update({ running: false, finished: true, message: fresh.length ? '' : 'Tes parties sont à jour.' });
  } catch (err) {
    update({
      running: false,
      error: err instanceof TypeError ? 'La plateforme n’est pas joignable pour le moment.' : err.message,
    });
  }
}

/** Analyse des parties collées à la main. */
export async function analysePastedGames(pgns, username) {
  if (status.running) throw new Error('Une analyse est déjà en cours.');
  const state = loadState();
  const parsed = pgns.map(parseGame).filter(Boolean);
  if (!parsed.length) throw new Error('Aucune partie lisible trouvée.');
  const known = new Set(state.games.map((g) => g.id));
  const mine = parsed.filter((g) => playerColor(g, username));
  if (!mine.length) throw new Error(`« ${username} » ne figure dans aucune de ces parties. Vérifie le pseudo.`);
  const fresh = mine.filter((g) => !known.has(g.id));
  if (!fresh.length) throw new Error('Ces parties sont déjà analysées.');
  update({ running: true, error: null, finished: false, message: '' });
  try {
    await analyseAll(fresh, username);
    update({ running: false, finished: true });
  } catch (err) {
    update({ running: false, error: err.message });
  }
}

export function linkAccount(platform, username) {
  const state = loadState();
  state.settings = { ...state.settings, platform, username, onboarded: true };
  saveState();
  syncAccount();
}

/** Délier le compte retire ce qui vient de ses parties, sinon elles fausseraient le suivant. */
export function unlinkAccount() {
  const state = loadState();
  state.games = [];
  state.badges = {};
  for (const skill of Object.values(state.skills)) skill.realErrors = [];
  state.settings = { ...state.settings, platform: null, username: '', onboarded: false };
  saveState();
}
