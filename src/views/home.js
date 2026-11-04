// Accueil : l'arbre du joueur, ses quêtes du jour et sa série.
import { dayKey } from '../core/time.js';
import { estimateElo } from '../core/elo.js';
import { loadState } from '../core/store.js';
import { branchLevel, levelName, rematchInfo, skillStatus } from '../core/mastery.js';
import { dailyEntry, streakInfo, STORY_GOAL, TACTICS_GOAL } from '../core/quests.js';
import { BRANCHES, SKILLS, skillsOfBranch, skillById } from '../data/skills.js';
import { BOSSES } from '../data/bosses.js';
import { skillMap } from './skillmap.js';
import { DECAY_REASON, esc } from './ui.js';

/** Tâche de « mise à l'épreuve » du jour : revanche due, sinon compétence orange, sinon la suivante. */
export function practiceTask(state, today) {
  for (const boss of BOSSES) {
    const info = rematchInfo(state, boss.id, today);
    if (info.due) return { title: `Revanche : ${boss.name}`, href: `#/boss/${boss.id}`, kind: 'revanche' };
  }
  const decayed = SKILLS.find((s) => skillStatus(state, s, today) === 'decayed');
  if (decayed) {
    return {
      title: `Révision : ${decayed.name}`,
      href: decayed.boss ? `#/boss/${decayed.boss}` : `#/seance/${decayed.id}`,
      kind: 'revision',
    };
  }
  const boss = BOSSES.find((b) => ['available', 'progress'].includes(skillStatus(state, skillById(b.skill), today)));
  if (boss) return { title: `Combat : ${boss.name}`, href: `#/boss/${boss.id}`, kind: 'boss' };
  const next = SKILLS.find((s) => !s.boss && ['available', 'progress'].includes(skillStatus(state, s, today)));
  if (next) return { title: `Séance : ${next.name}`, href: `#/seance/${next.id}`, kind: 'seance' };
  return { title: 'Rejouer un boss', href: '#/boss', kind: 'libre' };
}

function questRow(label, detail, done, href) {
  return `<li class="quest ${done ? 'done' : ''}">
    <span class="tick" aria-hidden="true"></span>
    <span class="quest-text"><strong>${esc(label)}</strong><small>${esc(detail)}</small></span>
    ${done ? '<span class="tag good">Fait</span>' : `<a class="btn small primary" href="${href}">Jouer</a>`}
  </li>`;
}

export function renderHome(app) {
  const state = loadState();
  const today = dayKey();
  const entry = dailyEntry(state, today);
  const streak = streakInfo(state, today);
  const task = practiceTask(state, today);
  const elo = estimateElo(state);
  const decayed = SKILLS.filter((s) => skillStatus(state, s, today) === 'decayed');
  const validated = SKILLS.filter((s) => skillStatus(state, s, today) === 'validated').length;

  app.innerHTML = `
    <section class="map-panel">
      <header class="map-head">
        <div>
          <h1>Ton arbre</h1>
          <p class="muted">${validated} compétence${validated > 1 ? 's' : ''} validée${validated > 1 ? 's' : ''} sur ${SKILLS.length} : il s’illumine à mesure que tu progresses.</p>
        </div>
        <ul class="map-legend" aria-label="Légende">
          <li><i class="k-validated"></i>Validée</li>
          <li><i class="k-available"></i>Disponible</li>
          <li><i class="k-decayed"></i>À réviser</li>
          <li><i class="k-locked"></i>Verrouillée</li>
        </ul>
      </header>
      ${skillMap(state, today, elo)}
      <div class="profile-mobile">
        ${BRANCHES.map((b) => {
          const score = branchLevel(state, skillsOfBranch(b.id), today);
          return `<a class="branch-meter" href="#/arbre">
            <span class="branch-name">${esc(b.name)}</span>
            <span class="meter" role="img" aria-label="${score} sur 100"><i style="width:${score}%"></i></span>
            <span class="branch-level">${score}<small>/100 · ${levelName(score)}</small></span>
          </a>`;
        }).join('')}
      </div>
    </section>

    <div class="home-columns">
      <section class="panel">
        <div class="panel-head">
          <h2>Quêtes du jour</h2>
          <span class="muted">10 à 15 minutes</span>
        </div>
        <ul class="quests">
          ${questRow(`${TACTICS_GOAL} tactiques`, `${Math.min(entry.tactics, TACTICS_GOAL)} sur ${TACTICS_GOAL}`, entry.tactics >= TACTICS_GOAL, '#/quete/tactique')}
          ${questRow(task.title, 'Une victoire ou une session réussie', entry.boss >= 1, task.href)}
          ${questRow(`${STORY_GOAL} coups du mode histoire`, `${Math.min(entry.story, STORY_GOAL)} sur ${STORY_GOAL}`, entry.story >= STORY_GOAL, '#/histoire')}
        </ul>
        ${entry.done ? '<p class="banner good">Quêtes terminées : ta série est à jour.</p>' : ''}
      </section>

      <div class="home-side">
        <section class="streak" aria-label="Série en cours">
          <strong>${streak.length}</strong>
          <span>jour${streak.length > 1 ? 's' : ''} de série</span>
          <small>${streak.toleranceUsed ? 'Jour de tolérance utilisé cette semaine' : 'Un jour manqué par semaine est pardonné'}</small>
        </section>
        ${decayed.length ? `<section class="panel warn">
          <h2>À réviser</h2>
          <ul class="plain">${decayed.map((s) => {
            const reason = state.skills[s.id]?.decay ?? 'parties';
            return `<li><a href="#/competence/${s.id}">${esc(s.name)}</a><br><small class="muted">${esc(DECAY_REASON[reason] ?? '')}</small></li>`;
          }).join('')}</ul>
        </section>` : ''}
      </div>
    </div>`;
}
