// Routeur et démarrage.
import { dayKey } from './core/time.js';
import { loadState, saveState } from './core/store.js';
import { syncDecay } from './core/mastery.js';
import { SKILLS } from './data/skills.js';
import { renderHome } from './views/home.js';
import { renderTree, renderSkill } from './views/tree.js';
import { renderSkillSession, renderQuestTactics } from './views/session.js';
import { renderBossList, renderBoss } from './views/boss.js';
import { renderStoryList, renderStory } from './views/story.js';
import { renderGames } from './views/games.js';
import { renderProgress } from './views/progress.js';

const app = document.getElementById('app');
let cleanup = null;

const routes = [
  [/^\/?$/, 'home', renderHome],
  [/^\/arbre$/, 'arbre', renderTree],
  [/^\/competence\/([\w-]+)$/, 'arbre', renderSkill],
  [/^\/seance\/([\w-]+)$/, 'arbre', renderSkillSession],
  [/^\/quete\/tactique$/, 'home', renderQuestTactics],
  [/^\/boss$/, 'boss', renderBossList],
  [/^\/boss\/([\w-]+)$/, 'boss', renderBoss],
  [/^\/histoire$/, 'histoire', renderStoryList],
  [/^\/histoire\/([\w-]+)$/, 'histoire', renderStory],
  [/^\/parties$/, 'parties', renderGames],
  [/^\/progres$/, 'progres', renderProgress],
];

function navigate() {
  const path = location.hash.replace(/^#/, '') || '/';
  const match = routes.map(([re, nav, view]) => ({ m: path.match(re), nav, view })).find((r) => r.m);
  cleanup?.();
  cleanup = null;
  window.scrollTo(0, 0);
  if (!match) {
    app.innerHTML = '<section class="panel"><h1>Page introuvable</h1><p><a href="#/">Retour à l’accueil</a></p></section>';
    return;
  }
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === match.nav) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const state = loadState();
  syncDecay(state, SKILLS, dayKey());
  saveState();
  try {
    cleanup = match.view(app, ...match.m.slice(1)) ?? null;
  } catch (err) {
    console.error(err);
    app.innerHTML = `<section class="panel"><h1>Une erreur est survenue</h1><p>${err.message}</p></section>`;
  }
}

window.addEventListener('hashchange', navigate);
navigate();
