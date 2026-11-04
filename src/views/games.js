// Parties réelles : import, analyse, et lien avec l'arbre de compétences.
import { Chess } from '../../vendor/chess.js';
import { dayKey, formatDay } from '../core/time.js';
import { exportState, importState, loadState, resetState, saveState } from '../core/store.js';
import { recordRealError } from '../core/mastery.js';
import { skillById } from '../data/skills.js';
import {
  analyseGame, badgesFromGame, fetchChessComGames, fetchLichessGames, parseGame, playerColor,
  splitPgn,
} from '../analysis.js';
import { refreshElo } from './elobar.js';
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

export function renderGames(app) {
  const state = loadState();
  const today = dayKey();
  let active = true;
  const controller = new AbortController();

  const render = () => {
    const games = [...state.games].sort((a, b) => b.date.localeCompare(a.date));
    app.querySelector('[data-list]').innerHTML = games.length
      ? games.map(gameRow).join('')
      : '<p class="muted">Aucune partie analysée pour l’instant. C’est pourtant là que tout se vérifie.</p>';
  };

  app.innerHTML = `
    <section class="page-head">
      <h1>Tes parties réelles</h1>
      <p class="lead">Importe tes parties : le moteur y cherche tes erreurs et signale les compétences concernées, même déjà validées.</p>
    </section>
    <section class="panel">
      <h2>Importer</h2>
      <form data-form class="form">
        <label>Ton pseudo
          <input name="username" required autocomplete="off" value="${esc(state.settings.username)}" placeholder="pseudo sur la plateforme">
        </label>
        <div class="form-row">
          <label>Source
            <select name="source">
              <option value="lichess">Lichess</option>
              <option value="chesscom">Chess.com</option>
              <option value="pgn">Coller un PGN</option>
            </select>
          </label>
          <label>Nombre de parties
            <input name="count" type="number" min="1" max="30" value="5">
          </label>
        </div>
        <label data-pgn-box hidden>PGN
          <textarea name="pgn" rows="6" placeholder="[Event &quot;…&quot;]"></textarea>
        </label>
        <button class="btn primary" data-run>Importer et analyser</button>
        <p class="muted">Compte quelques minutes par partie : l’analyse tourne dans ton navigateur.</p>
      </form>
      <p class="feedback" data-status role="status" aria-live="polite"></p>
      <div class="bar" data-bar hidden><i></i></div>
    </section>
    <section class="panel">
      <h2>Parties analysées</h2>
      <div data-list></div>
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

  render();
  const form = app.querySelector('[data-form]');
  const status = app.querySelector('[data-status]');
  const bar = app.querySelector('[data-bar]');
  const say = (text, kind = '') => {
    status.className = `feedback ${kind}`;
    status.textContent = text;
  };

  form.source.onchange = () => {
    app.querySelector('[data-pgn-box]').hidden = form.source.value !== 'pgn';
    form.pgn.required = form.source.value === 'pgn';
  };

  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = form.querySelector('[data-run]');
    const username = form.username.value.trim();
    state.settings.username = username;
    saveState();
    button.disabled = true;
    try {
      say('Récupération des parties…');
      const count = Math.max(1, Math.min(30, Number(form.count.value) || 5));
      let pgns;
      if (form.source.value === 'lichess') pgns = await fetchLichessGames(username, count);
      else if (form.source.value === 'chesscom') pgns = await fetchChessComGames(username, count);
      else pgns = splitPgn(form.pgn.value);

      const known = new Set(state.games.map((g) => g.id));
      const parsed = pgns.map(parseGame).filter(Boolean);
      const mine = parsed.filter((g) => playerColor(g, username));
      const fresh = mine.filter((g) => !known.has(g.id));
      if (!parsed.length) throw new Error('Aucune partie lisible trouvée.');
      if (!mine.length) throw new Error(`« ${username} » ne figure dans aucune de ces parties. Vérifie le pseudo.`);
      if (!fresh.length) {
        say('Ces parties sont déjà analysées.');
        return;
      }

      bar.hidden = false;
      let totalErrors = 0;
      for (let i = 0; i < fresh.length; i += 1) {
        const parsedGame = fresh[i];
        const record = await analyseGame(parsedGame, playerColor(parsedGame, username), today, {
          signal: controller.signal,
          onProgress: (done, total) => {
            bar.querySelector('i').style.width = `${((i + done / total) / fresh.length) * 100}%`;
            say(`Analyse de la partie ${i + 1} sur ${fresh.length}…`);
          },
        });
        state.games.push(record);
        totalErrors += record.errors.length;
        for (const error of record.errors) {
          const def = error.skill && skillById(error.skill);
          if (def) recordRealError(state, def, record.id, record.date, today);
        }
        for (const badge of badgesFromGame(record)) {
          if (!state.badges[badge]) {
            state.badges[badge] = { day: record.date, gameId: record.id };
          }
        }
        saveState();
        refreshElo();
        if (active) render();
      }
      say(`${fresh.length} partie${fresh.length > 1 ? 's' : ''} analysée${fresh.length > 1 ? 's' : ''}, ${totalErrors} erreur${totalErrors > 1 ? 's' : ''} repérée${totalErrors > 1 ? 's' : ''}. Voir l’arbre pour les compétences signalées.`, 'good');
    } catch (err) {
      if (err.name === 'AbortError') return;
      const blocked = err instanceof TypeError;
      say(blocked ? 'La plateforme n’est pas joignable depuis le navigateur. Essaie en collant un PGN.' : err.message, 'bad');
    } finally {
      if (active) {
        button.disabled = false;
        bar.hidden = true;
      }
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

  return () => {
    active = false;
    controller.abort();
  };
}
