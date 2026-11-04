// Tableau mensuel, badges et règle de contrôle.
import { dayKey, formatDay, monthKey, monthLabel } from '../core/time.js';
import { loadState } from '../core/store.js';
import { BADGES, controlVerdict } from '../analysis.js';
import { CADENCE_NAMES, cadenceOf, mainCadence } from '../core/elo.js';
import { skillById } from '../data/skills.js';
import { esc } from './ui.js';

const CONTROL = {
  unknown: ['neutral', 'Pas encore vérifiable', 'Il faut au moins 4 parties réelles sur 30 jours pour vérifier que l’entraînement porte ses fruits.'],
  confirmed: ['good', 'Progrès confirmé', 'Tes récompenses récentes se retrouvent dans tes vraies parties.'],
  warning: ['warn', 'Attention', 'Tu accumules des récompenses, mais ni ton classement ni ton taux d’erreurs ne s’améliorent. Joue et analyse davantage de vraies parties.'],
  flat: ['neutral', 'Stable', 'Pas de progrès mesuré ce mois-ci, et pas de nouvelle récompense non plus.'],
};

/** Courbe de classement : une seule série, pas de légende, info-bulle au survol, table associée. */
function ratingChart(points, width) {
  const W = Math.max(300, Math.min(760, width));
  const H = 220;
  const M = { top: 16, right: 16, bottom: 28, left: 44 };
  const values = points.map((p) => p.rating);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 20);
  const low = min - span * 0.15;
  const high = max + span * 0.15;
  const x = (i) => M.left + (points.length === 1 ? 0.5 : i / (points.length - 1)) * (W - M.left - M.right);
  const y = (v) => M.top + (1 - (v - low) / (high - low)) * (H - M.top - M.bottom);
  const ticks = [low + (high - low) * 0.15, (low + high) / 2, high - (high - low) * 0.15].map(Math.round);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.rating).toFixed(1)}`).join('');
  return `<figure class="chart">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Classement de ${points[0].rating} à ${points.at(-1).rating}">
      ${ticks.map((t) => `<line class="grid" x1="${M.left}" x2="${W - M.right}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${M.left - 8}" y="${y(t) + 4}" text-anchor="end">${t}</text>`).join('')}
      <path class="line" d="${path}"/>
      ${points.map((p, i) => `<g class="dot-group" tabindex="0"><title>${formatDay(p.date)} : ${p.rating}</title>
        <circle class="hit" cx="${x(i)}" cy="${y(p.rating)}" r="14"/>
        <circle class="dot" cx="${x(i)}" cy="${y(p.rating)}" r="4"/></g>`).join('')}
      <text class="axis" x="${M.left}" y="${H - 8}">${formatDay(points[0].date)}</text>
      ${points.length > 1 ? `<text class="axis" x="${W - M.right}" y="${H - 8}" text-anchor="end">${formatDay(points.at(-1).date)}</text>` : ''}
    </svg>
    <details><summary>Voir en tableau</summary>
      <table><thead><tr><th>Date</th><th>Classement</th></tr></thead>
      <tbody>${points.map((p) => `<tr><td>${formatDay(p.date)}</td><td>${p.rating}</td></tr>`).join('')}</tbody></table>
    </details>
  </figure>`;
}

export function renderProgress(app, monthArg = null) {
  const month = typeof monthArg === 'string' ? monthArg : null;
  const state = loadState();
  const today = dayKey();
  const current = month ?? monthKey(today);
  const months = [...new Set([
    monthKey(today),
    ...state.games.map((g) => monthKey(g.date)),
    ...state.log.map((l) => monthKey(l.day)),
  ])].sort().reverse();

  const games = state.games.filter((g) => monthKey(g.date) === current);
  const log = state.log.filter((l) => monthKey(l.day) === current);
  const gains = log.filter((l) => l.type === 'gain');
  const losses = log.filter((l) => l.type === 'loss');

  const counts = {};
  for (const game of games) {
    for (const err of game.errors) {
      if (err.skill) counts[err.skill] = (counts[err.skill] ?? 0) + 1;
    }
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topMax = top[0]?.[1] ?? 1;
  const cadence = mainCadence(state.games);
  const rated = games.filter((g) => g.rating && cadenceOf(g) === cadence)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((g) => ({ date: g.date, rating: g.rating }));

  const control = controlVerdict(state, today);
  const [kind, title, text] = CONTROL[control.status];
  const skillLink = (id) => `<a href="#/competence/${id}">${esc(skillById(id)?.name ?? id)}</a>`;

  app.innerHTML = `
    <section class="page-head">
      <h1>Progrès</h1>
      <p class="lead">Chaque récompense doit correspondre à un progrès mesurable dans tes vraies parties.</p>
    </section>

    <section class="panel control ${kind}">
      <h2>${title}</h2>
      <p>${text}</p>
      <dl class="stats">
        <div><dt>Récompenses (30 j)</dt><dd>${control.rewards}</dd></div>
        <div><dt>Parties réelles (30 j)</dt><dd>${control.games}</dd></div>
        <div><dt>Évolution du classement</dt><dd>${control.ratingDelta === null ? '—' : `${control.ratingDelta > 0 ? '+' : ''}${control.ratingDelta}`}</dd></div>
        <div><dt>Erreurs pour 40 coups</dt><dd>${control.errorsAfter === null ? '—' : control.errorsAfter.toFixed(1).replace('.', ',')}${control.errorsBefore !== null ? `<small> (avant : ${control.errorsBefore.toFixed(1).replace('.', ',')})</small>` : ''}</dd></div>
      </dl>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>Bilan de ${monthLabel(current)}</h2>
        <label class="inline">Mois
          <select data-month>${months.map((m) => `<option value="${m}" ${m === current ? 'selected' : ''}>${monthLabel(m)}</option>`).join('')}</select>
        </label>
      </div>
      <div class="columns">
        <div>
          <h3>Erreurs les plus fréquentes</h3>
          ${top.length ? `<ul class="bars">${top.map(([id, n]) => `<li>
            <span>${skillLink(id)}</span>
            <span class="meter small" aria-hidden="true"><i style="width:${(n / topMax) * 100}%"></i></span>
            <b>${n}</b></li>`).join('')}</ul>` : '<p class="muted">Aucune erreur enregistrée ce mois-ci. Importe tes parties pour en savoir plus.</p>'}
        </div>
        <div>
          <h3>Compétences gagnées</h3>
          ${gains.length ? `<ul class="plain">${gains.map((l) => `<li>${skillLink(l.id)} <span class="muted">${formatDay(l.day)}</span></li>`).join('')}</ul>` : '<p class="muted">Aucune ce mois-ci.</p>'}
          <h3>Compétences perdues</h3>
          ${losses.length ? `<ul class="plain">${losses.map((l) => `<li>${skillLink(l.id)} <span class="muted">${formatDay(l.day)}</span></li>`).join('')}</ul>` : '<p class="muted">Aucune ce mois-ci.</p>'}
        </div>
      </div>
      <h3>Classement en parties réelles${CADENCE_NAMES[cadence] ? ` (${CADENCE_NAMES[cadence]})` : ''}</h3>
      ${rated.length ? ratingChart(rated, app.clientWidth - 72) : '<p class="muted">Pas de partie classée ce mois-ci.</p>'}
    </section>

    <section class="panel">
      <h2>Badges</h2>
      <p class="muted">Ils se gagnent uniquement dans de vraies parties, jamais à l’assiduité.</p>
      <ul class="badges">
        ${Object.entries(BADGES).map(([id, b]) => {
          const earned = state.badges[id];
          return `<li class="badge ${earned ? 'earned' : ''}">
            <strong>${esc(b.name)}</strong>
            <small>${esc(b.about)}</small>
            <small class="muted">${earned ? `Obtenu le ${formatDay(earned.day)}` : 'Pas encore obtenu'}</small>
          </li>`;
        }).join('')}
      </ul>
    </section>`;

  app.querySelector('[data-month]').onchange = (e) => renderProgress(app, e.target.value);
}
