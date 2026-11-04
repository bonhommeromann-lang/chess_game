// Arbre de compétences et fiche détaillée d'une compétence.
import { dayKey, formatDay } from '../core/time.js';
import { loadState } from '../core/store.js';
import {
  branchLevel, canEarnToday, decayReason, isFlagged, levelName, rematchInfo, skillData, skillStatus,
} from '../core/mastery.js';
import { BRANCHES, skillById, skillsOfBranch } from '../data/skills.js';
import { DECAY_REASON, esc, pct, STATUS_LABEL, statusIcon } from './ui.js';

const TIER_NAMES = { 1: 'Niveau 1', 2: 'Niveau 2', 3: 'Niveau 3' };

function node(state, skill, today) {
  const status = skillStatus(state, skill, today);
  const flagged = isFlagged(state, skill, today) && status !== 'decayed';
  const body = `
    <span class="node-icon">${statusIcon(status)}</span>
    <span class="node-text"><strong>${esc(skill.name)}</strong>
    <small>${STATUS_LABEL[status]}${skill.boss ? ' · Boss' : ''}</small></span>
    ${flagged ? '<span class="flag" title="Erreur repérée dans tes parties">Signalée</span>' : ''}`;
  return `<a class="node ${status}" href="#/competence/${skill.id}" data-skill="${skill.id}">${body}</a>`;
}

export function renderTree(app) {
  const state = loadState();
  const today = dayKey();
  app.innerHTML = `
    <section class="page-head">
      <h1>Arbre de compétences</h1>
      <p class="lead">Une compétence se valide par deux sessions réussies à 80 %, sur deux jours distincts, la seconde plus difficile.</p>
    </section>
    <div class="tree">
      ${BRANCHES.map((branch) => {
        const skills = skillsOfBranch(branch.id);
        const score = branchLevel(state, skills, today);
        return `<section class="tree-branch" aria-labelledby="b-${branch.id}">
          <header>
            <h2 id="b-${branch.id}">${esc(branch.name)}</h2>
            <p>${esc(branch.motto)}</p>
            <span class="meter" role="img" aria-label="${score} sur 100"><i style="width:${score}%"></i></span>
            <small>${score}/100 · ${levelName(score)}</small>
          </header>
          ${[1, 2, 3].map((tier) => `
            <h3 class="tier-label">${TIER_NAMES[tier]}</h3>
            <div class="tier">${skills.filter((s) => s.tier === tier).map((s) => node(state, s, today)).join('')}</div>
          `).join('')}
        </section>`;
      }).join('')}
    </div>`;
}

export function renderSkill(app, id) {
  const skill = skillById(id);
  if (!skill) {
    app.innerHTML = '<section class="panel"><h1>Compétence inconnue</h1></section>';
    return;
  }
  const state = loadState();
  const today = dayKey();
  const data = skillData(state, id);
  const status = skillStatus(state, skill, today);
  const reason = decayReason(state, skill, today);
  const missing = skill.requires.filter((r) => !skillData(state, r).validatedDay).map((r) => skillById(r));
  const realErrors = data.realErrors?.length ?? 0;
  let action = '';
  if (status === 'locked') {
    action = `<p class="banner">Pour débloquer : ${missing.map((m) => `<a href="#/competence/${m.id}">${esc(m.name)}</a>`).join(', ')}.</p>`;
  } else if (skill.boss) {
    const info = rematchInfo(state, skill.boss, today);
    action = `<a class="btn primary" href="#/boss/${skill.boss}">${status === 'validated' && !info.due ? 'Rejouer le boss' : 'Affronter le boss'}</a>
      ${info.day ? `<p class="muted">${info.due ? 'Revanche disponible.' : `Revanche le ${formatDay(info.day)}.`}</p>` : ''}`;
  } else if (status === 'decayed') {
    action = '<a class="btn primary" href="#/seance/' + id + '">Faire la révision</a>';
  } else if (status === 'validated') {
    action = '<a class="btn" href="#/seance/' + id + '">S’entraîner</a>';
  } else if (!canEarnToday(state, skill, today)) {
    action = `<p class="banner">Session déjà réussie aujourd’hui. La confirmation compte à partir de demain : c’est ce qui écarte la réussite par chance.</p>
      <a class="btn" href="#/seance/${id}">S’entraîner quand même</a>`;
  } else {
    action = `<a class="btn primary" href="#/seance/${id}">${data.passes.length ? 'Session de confirmation' : 'Passer le test'}</a>`;
  }

  app.innerHTML = `
    <p class="crumb"><a href="#/arbre">← Arbre</a></p>
    <section class="panel skill-sheet">
      <h1>${esc(skill.name)}</h1>
      <p class="status-line ${status}">${statusIcon(status)} ${STATUS_LABEL[status]}</p>
      <p class="lead">${esc(skill.about)}</p>
      ${reason ? `<p class="banner warn">${esc(DECAY_REASON[reason])}</p>` : ''}
      ${!reason && realErrors ? `<p class="banner warn">Repérée ${realErrors} fois dans tes parties réelles récentes.</p>` : ''}
      ${action}
      ${!skill.boss ? `<h2>Validation</h2>
      <ol class="steps">
        ${[0, 1].map((i) => {
          const pass = data.passes[i];
          const label = i === 0 ? 'Test d’entrée' : 'Confirmation, plus difficile, un autre jour';
          return `<li class="${pass ? 'done' : ''}">${label}${pass ? ` : ${pct(pass.score)} le ${formatDay(pass.day)}` : ''}</li>`;
        }).join('')}
      </ol>` : ''}
      ${data.validatedDay ? `<p class="muted">Validée le ${formatDay(data.validatedDay)}.</p>` : ''}
    </section>`;
}
