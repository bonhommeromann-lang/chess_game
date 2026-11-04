// Parties réelles : compte lié, parties analysées, import manuel et sauvegarde.
import { Chess } from '../../vendor/chess.js';
import { dayKey, formatDay } from '../core/time.js';
import { exportState, importState, loadState, resetState, saveState } from '../core/store.js';
import { skillById } from '../data/skills.js';
import { splitPgn } from '../analysis.js';
import {
  analysePastedGames, PLATFORMS, syncAccount, syncStatus, unlinkAccount,
} from '../sync.js';
import { esc } from './ui.js';

const OUTCOME = { win: 'Victoire', loss: 'Défaite', draw: 'Nulle', unknown: '—' };

const bestSan = (fen, uci) => {
  if (!uci) return '';
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
  } catch {
    return uci;
  }
};

function gameRow(game) {
  const opponent = game.color === 'w' ? game.black : game.white;
  const errors = game.errors.map((e) => {
    const skill = e.skill ? skillById(e.skill) : null;
    return `<li>Coup ${e.moveNumber} : <strong>${esc(e.san)}</strong> (meilleur : ${esc(bestSan(e.fen, e.best))})
      ${skill ? ` → <a href="#/competence/${skill.id}">${esc(skill.name)}</a>` : ' <span class="muted">sans compétence associée</span>'}</li>`;
  }).join('');
  return `<details class="game-row">
    <summary>
      <span class="tag ${game.outcome === 'win' ? 'good' : game.outcome === 'loss' ? 'bad' : ''}">${OUTCOME[game.outcome]}</span>
      <span class="game-opp">contre ${esc(opponent)}</span>
      <span class="muted">${formatDay(game.date)}${game.rating ? ` · ${game.rating}` : ''}</span>
      <span class="muted game-err">${game.errors.length} erreur${game.errors.length > 1 ? 's' : ''}</span>
    </summary>
    ${errors ? `<ul class="plain">${errors}</ul>` : '<p class="muted">Aucune erreur grave repérée.</p>'}
  </details>`;
}

function accountSection(state) {
  const { username, platform } = state.settings;
  const status = syncStatus();
  const linked = username && PLATFORMS[platform];
  let line = '';
  if (status.running) line = `<p class="feedback" role="status">Analyse en cours${status.total ? ` : ${status.done} sur ${status.total}` : '…'}. Tu peux changer de page, elle continue.</p>`;
  else if (status.error) line = `<p class="feedback bad" role="status">${esc(status.error)}</p>`;
  else if (status.message) line = `<p class="feedback" role="status">${esc(status.message)}</p>`;
  return `<section class="panel">
    <h2>Ton compte</h2>
    ${linked ? `<div class="account">
      <strong>${esc(username)}</strong> <span class="muted">${esc(PLATFORMS[platform].name)}</span>
      <p class="actions">
        <button class="btn small" data-sync-now ${status.running ? 'disabled' : ''}>Synchroniser</button>
        <button class="btn small" data-unlink ${status.running ? 'disabled' : ''}>Changer de compte</button>
      </p>
    </div>` : `<p class="muted">Aucun compte lié : tes parties ne sont pas analysées automatiquement.</p>
      <button class="btn primary" data-link>Lier un compte</button>`}
    ${line}
  </section>`;
}

export function renderGames(app) {
  const state = loadState();
  const today = dayKey();
  const games = [...state.games].sort((a, b) => b.date.localeCompare(a.date));

  app.innerHTML = `
    <section class="page-head">
      <h1>Tes parties réelles</h1>
      <p class="lead">Le moteur y cherche tes erreurs et signale les compétences concernées, même déjà validées.</p>
    </section>
    ${accountSection(state)}
    <section class="panel">
      <h2>Parties analysées</h2>
      <div data-list>${games.length
        ? games.map(gameRow).join('')
        : '<p class="muted">Aucune partie analysée pour l’instant. C’est pourtant là que tout se vérifie.</p>'}</div>
    </section>
    <section class="panel">
      <details data-paste-box>
        <summary><strong>Coller un PGN</strong> <span class="muted">pour une partie jouée ailleurs</span></summary>
        <form data-paste class="form">
          <label>Ton nom dans cette partie
            <input name="username" required autocomplete="off" value="${esc(state.settings.username)}">
          </label>
          <label>PGN
            <textarea name="pgn" rows="6" required placeholder="[Event &quot;…&quot;]"></textarea>
          </label>
          <button class="btn primary">Analyser</button>
          <p class="feedback" data-paste-status role="status"></p>
        </form>
      </details>
    </section>
    <section class="panel">
      <h2>Sauvegarde</h2>
      <p class="muted">Ta progression reste dans ce navigateur. Exporte-la pour la conserver ou la déplacer.</p>
      <p class="actions">
        <button class="btn small" data-export>Exporter</button>
        <label class="btn small">Importer<input type="file" accept="application/json" data-import hidden></label>
        <button class="btn small danger" data-reset>Tout effacer</button>
      </p>
      <p class="feedback" data-save-status role="status"></p>
    </section>`;

  const backToWelcome = () => { location.hash = '#/'; };
  app.querySelector('[data-sync-now]')?.addEventListener('click', () => syncAccount());
  app.querySelector('[data-link]')?.addEventListener('click', () => {
    state.settings.onboarded = false;
    saveState();
    backToWelcome();
  });
  app.querySelector('[data-unlink]')?.addEventListener('click', () => {
    // eslint-disable-next-line no-alert
    if (window.confirm('Changer de compte retire les parties analysées et leurs badges. Tes compétences validées sont conservées. Continuer ?')) {
      unlinkAccount();
      backToWelcome();
    }
  });

  const paste = app.querySelector('[data-paste]');
  const pasteStatus = app.querySelector('[data-paste-status]');
  paste.onsubmit = async (event) => {
    event.preventDefault();
    try {
      await analysePastedGames(splitPgn(paste.pgn.value), paste.username.value.trim());
    } catch (err) {
      pasteStatus.className = 'feedback bad';
      pasteStatus.textContent = err.message;
    }
  };

  const saveStatus = app.querySelector('[data-save-status]');
  app.querySelector('[data-export]').onclick = () => {
    const blob = new Blob([exportState()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `quete-echecs-${today}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  app.querySelector('[data-import]').onchange = async (e) => {
    try {
      importState(await e.target.files[0].text());
      location.reload();
    } catch (err) {
      saveStatus.className = 'feedback bad';
      saveStatus.textContent = err.message;
    }
  };
  app.querySelector('[data-reset]').onclick = () => {
    // eslint-disable-next-line no-alert
    if (window.confirm('Effacer toute ta progression ? C’est définitif.')) {
      resetState();
      location.hash = '#/';
      location.reload();
    }
  };
}
