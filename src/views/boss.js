// Boss de finales : leçon guidée, puis combat arbitré par les tables de finales.
import { Chess } from '../../vendor/chess.js';
import { Board, uciToMove } from '../chess/board.js';
import { moveOutcome, positionOutcome, probe } from '../chess/tablebase.js';
import { dayKey, formatDay } from '../core/time.js';
import { loadState, saveState } from '../core/store.js';
import {
  isUnlocked, recordBossWin, rematchInfo, skillStatus,
} from '../core/mastery.js';
import { advanceQuest } from '../core/quests.js';
import { BOSSES, bossById } from '../data/bosses.js';
import { skillById } from '../data/skills.js';
import { loadEndgames, shuffle } from '../exercises.js';
import { esc, hearts, pause, STATUS_LABEL, statusIcon } from './ui.js';

const START_LIVES = 3;
export const MAX_TIER = 2;
export const MAX_FIGHT_PAWN_RANK = 4;

/** Rangée du pion blanc d'après la FEN. */
export const pawnRank = (fen) => 8 - fen.split(' ')[0].split('/').findIndex((row) => row.includes('P'));

export function renderBossList(app) {
  const state = loadState();
  const today = dayKey();
  app.innerHTML = `
    <section class="page-head">
      <h1>Boss de finales</h1>
      <p class="lead">Chaque finale théorique est un combat contre une défense parfaite. Une semaine après la victoire, le boss revient plus difficile.</p>
    </section>
    <div class="cards">
      ${BOSSES.map((boss) => {
        const skill = skillById(boss.skill);
        const status = skillStatus(state, skill, today);
        const info = rematchInfo(state, boss.id, today);
        const line = info.due ? '<span class="tag warn">Revanche disponible</span>'
          : info.day ? `<span class="muted">Revanche le ${formatDay(info.day)}</span>` : '';
        const locked = status === 'locked';
        return `<article class="card boss-card ${status}">
          <p class="status-line ${status}">${statusIcon(status)} ${STATUS_LABEL[status]}</p>
          <h2>${esc(boss.name)}</h2>
          <p class="muted">${esc(boss.material)}</p>
          <p>${esc(boss.tagline)}</p>
          ${line}
          ${locked ? `<p class="muted">Débloqué par : ${skill.requires.map((r) => esc(skillById(r).name)).join(', ')}</p>`
            : `<a class="btn ${info.due || !info.day ? 'primary' : ''}" href="#/boss/${boss.id}">${info.due ? 'Revanche' : info.day ? 'Rejouer' : 'Affronter'}</a>`}
        </article>`;
      }).join('')}
    </div>`;
}

export function renderBoss(app, id) {
  const boss = bossById(id);
  const state = loadState();
  const today = dayKey();
  const skill = boss && skillById(boss.skill);
  if (!boss || !isUnlocked(state, skill)) {
    app.innerHTML = `<section class="panel"><h1>Boss indisponible</h1>
      <p>Valide d’abord les compétences requises. <a href="#/boss">Retour aux boss</a></p></section>`;
    return null;
  }
  let active = true;
  const isActive = () => active;
  const record = (state.bosses[id] ??= { tier: 0, wins: 0, lastWinDay: null, attempts: 0, lessonDone: false });

  app.innerHTML = `<p class="crumb"><a href="#/boss">← Boss</a></p>
    <section class="session">
      <header class="session-head">
        <h1>${esc(boss.name)}</h1>
        <p class="muted" data-sub>${esc(boss.material)}</p>
      </header>
      <div data-host></div>
    </section>`;
  const host = app.querySelector('[data-host]');
  const sub = app.querySelector('[data-sub]');

  const intro = () => {
    const info = rematchInfo(state, id, today);
    host.innerHTML = `<div class="result left">
      <p class="lead">${esc(boss.tagline)}</p>
      <ul class="plain">
        <li>Trois vies. Un coup qui laisse échapper le résultat en coûte une, et il est annulé.</li>
        <li>La position de départ change à chaque combat.</li>
        ${record.tier ? `<li>Palier ${record.tier + 1} : moins de coups autorisés et départ moins favorable.</li>` : ''}
        ${info.day && !info.due ? `<li>Revanche le ${formatDay(info.day)} : d’ici là, ce combat est un entraînement.</li>` : ''}
      </ul>
      <p class="actions">
        <button class="btn primary" data-lesson>${record.lessonDone ? 'Revoir la leçon' : 'Commencer la leçon'}</button>
        ${record.lessonDone ? '<button class="btn primary" data-fight>Combattre</button>' : ''}
      </p>
    </div>`;
    host.querySelector('[data-lesson]').onclick = () => lesson(0);
    const fightButton = host.querySelector('[data-fight]');
    if (fightButton) fightButton.onclick = startCombat;
  };

  const lesson = (index) => {
    if (index >= boss.lesson.length) {
      record.lessonDone = true;
      saveState();
      intro();
      return;
    }
    const step = boss.lesson[index];
    const game = new Chess(step.fen);
    sub.textContent = `Leçon, position ${index + 1} sur ${boss.lesson.length}`;
    host.innerHTML = `<div class="play">
      <div class="board-wrap"><div data-board></div></div>
      <aside class="side">
        <p class="prompt">${esc(step.prompt)}</p>
        <p class="feedback" data-feedback role="status" aria-live="polite"></p>
        <button class="btn primary" data-next hidden>Suivant</button>
      </aside>
    </div>`;
    const feedback = host.querySelector('[data-feedback]');
    const next = host.querySelector('[data-next]');
    const board = new Board(host.querySelector('[data-board]'), {
      fen: step.fen, orientation: game.turn() === 'w' ? 'white' : 'black', movable: true,
    });
    board.onMove = (uci) => {
      if (!step.accept.includes(uci)) {
        const hint = step.accept[0];
        board.setMarks({}, [[hint.slice(0, 2), hint.slice(2, 4)]]);
        feedback.className = 'feedback bad';
        feedback.textContent = 'Pas ici. La flèche montre le coup : joue-le.';
        return;
      }
      game.move(uciToMove(uci));
      board.setMovable(false);
      board.setMarks({});
      board.setFen(game.fen(), [uci.slice(0, 2), uci.slice(2, 4)]);
      feedback.className = 'feedback good';
      feedback.textContent = step.then;
      next.hidden = false;
      next.focus();
      next.onclick = () => lesson(index + 1);
    };
  };

  const startCombat = async () => {
    host.innerHTML = '<p class="muted">Le boss se prépare…</p>';
    let data;
    try {
      data = await loadEndgames();
    } catch (err) {
      host.innerHTML = `<p class="banner warn">${esc(err.message)}</p>`;
      return;
    }
    if (!isActive()) return;
    record.attempts += 1;
    saveState();
    const tier = Math.min(record.tier, MAX_TIER);
    const fights = {
      gardien: () => shuffle(data.gardien[tier])[0],
      mur: () => shuffle(data.mur[tier])[0],
      lucena: () => shuffle(data.lucena[tier])[0],
      philidor: () => shuffle(data.philidor[tier])[0],
      opposition: () => shuffle(data.opposition.win.filter((p) => pawnRank(p.fen) <= MAX_FIGHT_PAWN_RANK))[0],
    };
    const position = fights[id]();
    if (id === 'opposition') {
      const pool = shuffle([...data.opposition.win, ...data.opposition.draw]).slice(0, boss.judge[tier]);
      judgePhase(pool, 0, START_LIVES, position, tier);
    } else {
      combat(position, tier, START_LIVES);
    }
  };

  const judgePhase = (pool, index, lives, position, tier) => {
    if (index >= pool.length) {
      combat(position, tier, lives);
      return;
    }
    const item = pool[index];
    sub.textContent = `Jugement ${index + 1} sur ${pool.length}`;
    const turn = new Chess(item.fen).turn();
    host.innerHTML = `<div class="play">
      <div class="board-wrap"><div data-board></div></div>
      <aside class="side">
        <p>${hearts(lives)}</p>
        <p class="prompt">${turn === 'w' ? 'Blancs' : 'Noirs'} au trait. Les blancs gagnent-ils avec un jeu parfait ?</p>
        <div class="choices">
          <button class="btn choice" data-verdict="win">Oui, c’est gagnant</button>
          <button class="btn choice" data-verdict="draw">Non, c’est nulle</button>
        </div>
        <p class="feedback" data-feedback role="status" aria-live="polite"></p>
        <button class="btn primary" data-next hidden>Suivant</button>
      </aside>
    </div>`;
    new Board(host.querySelector('[data-board]'), { fen: item.fen });
    host.querySelectorAll('[data-verdict]').forEach((button) => {
      button.onclick = () => {
        const correct = button.dataset.verdict === item.verdict;
        const newLives = correct ? lives : lives - 1;
        host.querySelectorAll('[data-verdict]').forEach((b) => {
          b.disabled = true;
          if (b.dataset.verdict === item.verdict) b.classList.add('right');
        });
        if (!correct) button.classList.add('wrong');
        const feedback = host.querySelector('[data-feedback]');
        feedback.className = `feedback ${correct ? 'good' : 'bad'}`;
        feedback.textContent = (correct ? 'Exact. ' : 'Raté. ') + (item.verdict === 'win'
          ? 'La table de finales confirme le gain.'
          : 'La table de finales confirme la nulle.');
        const next = host.querySelector('[data-next]');
        next.hidden = false;
        next.focus();
        next.onclick = () => {
          if (newLives <= 0) defeat('Plus de vies.');
          else judgePhase(pool, index + 1, newLives, position, tier);
        };
      };
    });
  };

  const defeat = (message) => {
    sub.textContent = 'Défaite';
    host.innerHTML = `<div class="result">
      <p class="score-big bad">Défaite</p>
      <p>${esc(message)}</p>
      <p class="actions"><button class="btn primary" data-again>Recommencer</button>
      <button class="btn" data-lesson>Revoir la leçon</button></p>
    </div>`;
    host.querySelector('[data-again]').onclick = startCombat;
    host.querySelector('[data-lesson]').onclick = () => lesson(0);
  };

  const victory = (message) => {
    const info = rematchInfo(state, id, today);
    const counts = !record.lastWinDay || info.due || skillStatus(state, skill, today) === 'decayed';
    let note = 'Ce combat d’entraînement ne change rien : la revanche compte à sa date.';
    if (counts) {
      const event = recordBossWin(state, id, skill, today, MAX_TIER);
      if (event === 'gain') note = 'Boss vaincu : la compétence est validée.';
      else if (event === 'restored') note = 'Revanche gagnée : la compétence redevient verte.';
      else note = 'Revanche gagnée.';
      const nextInfo = rematchInfo(state, id, today);
      note += ` Le boss reviendra plus fort le ${formatDay(nextInfo.day)}.`;
    }
    advanceQuest(state, today, 'boss');
    saveState();
    sub.textContent = 'Victoire';
    host.innerHTML = `<div class="result">
      <p class="score-big good">Victoire</p>
      <p>${esc(message)}</p>
      <p class="banner good">${esc(note)}</p>
      <p class="actions"><a class="btn primary" href="#/boss">Retour aux boss</a> <a class="btn" href="#/">Accueil</a></p>
    </div>`;
  };

  const combat = async (position, tier, startLives) => {
    let lives = startLives;
    let moves = 0;
    const game = new Chess(position.fen);
    const playerTurn = boss.side;
    host.innerHTML = `<div class="play">
      <div class="board-wrap"><div data-board></div></div>
      <aside class="side">
        <p data-lives></p>
        <p class="counter" data-counter></p>
        <p class="prompt">${esc(boss.goal === 'hold' ? 'Tiens la nulle.' : boss.goal === 'promote' ? 'Promeus ton pion en gardant le gain.' : 'Donne mat.')}</p>
        <p class="feedback" data-feedback role="status" aria-live="polite"></p>
        <button class="btn" data-retry hidden>Réessayer</button>
      </aside>
    </div>`;
    const board = new Board(host.querySelector('[data-board]'), {
      fen: game.fen(), orientation: playerTurn === 'w' ? 'white' : 'black', movable: false,
    });
    const feedback = host.querySelector('[data-feedback]');
    const say = (text, kind = '') => {
      feedback.className = `feedback ${kind}`;
      feedback.textContent = text;
    };

    let limit;
    let goalMoves = null;
    try {
      await probe(game.fen());
      if (!isActive()) return;
      if (boss.goal === 'mate') {
        limit = Math.min(boss.maxMoves, position.dtm + boss.slack[tier]);
      } else if (id === 'lucena') {
        limit = position.toPromotion + boss.slack[tier];
      } else if (id === 'opposition') {
        limit = position.dtm + boss.slack[tier];
      } else {
        goalMoves = boss.holdMoves[tier];
      }
    } catch (err) {
      say(err.message, 'bad');
      const retry = host.querySelector('[data-retry]');
      retry.hidden = false;
      retry.onclick = () => combat(position, tier, startLives);
      return;
    }

    const refresh = () => {
      host.querySelector('[data-lives]').innerHTML = hearts(lives);
      host.querySelector('[data-counter]').textContent = goalMoves
        ? `Coup ${moves} sur ${goalMoves} à tenir`
        : `Coup ${moves} sur ${limit} au maximum`;
    };
    refresh();
    sub.textContent = `Combat · palier ${tier + 1}`;

    const netError = (err) => {
      say(`${err.message} Aucune vie n’est retirée : rejoue ton coup.`, 'bad');
      board.setFen(game.fen());
      board.setMovable(true);
    };

    const opponentReply = async () => {
      let info;
      try {
        info = await probe(game.fen());
      } catch (err) {
        say(err.message, 'bad');
        await pause(2000);
        if (isActive()) opponentReply();
        return;
      }
      if (!isActive()) return;
      await pause(350);
      if (!isActive()) return;
      // En défense, le moteur varie ses essais parmi les coups qui conservent le meilleur résultat.
      const top = info.moves[0];
      const best = info.moves.filter((m) => m.category === top.category);
      const choice = boss.goal === 'hold' ? shuffle(best.slice(0, 4))[0] : top;
      const move = game.move(uciToMove(choice.uci));
      board.setFen(game.fen(), [move.from, move.to]);
      if (game.isGameOver()) {
        finishByRules();
        return;
      }
      board.setMovable(true);
    };

    const finishByRules = () => {
      if (boss.goal === 'hold') {
        victory('La position est nulle : tu as tenu.');
      } else if (game.isCheckmate()) {
        victory(`Mat en ${moves} coups.`);
      } else {
        defeat('La partie s’est terminée sans gain.');
      }
    };

    board.onMove = async (uci) => {
      board.setMovable(false);
      say('');
      let info;
      try {
        info = await probe(game.fen());
      } catch (err) {
        netError(err);
        return;
      }
      if (!isActive()) return;
      const start = positionOutcome(info);
      const result = moveOutcome(info, uci);
      const bad = (start === 'win' && result !== 'win') || (start === 'draw' && result === 'loss');
      if (bad) {
        lives -= 1;
        refresh();
        if (lives <= 0) {
          defeat(start === 'win' ? 'Ce coup laissait échapper le gain.' : 'Ce coup perdait la partie.');
          return;
        }
        const test = new Chess(game.fen());
        test.move(uciToMove(uci));
        say(test.isStalemate()
          ? 'Pat ! Ce coup annule la partie. Il coûte une vie et il est repris.'
          : `${start === 'win' ? 'Ce coup laisse échapper le gain.' : 'Ce coup perd.'} Il coûte une vie et il est repris.`, 'bad');
        board.setFen(game.fen());
        board.setMovable(true);
        return;
      }
      const move = game.move(uciToMove(uci));
      moves += 1;
      refresh();
      board.setFen(game.fen(), [move.from, move.to]);

      if (boss.goal === 'promote' && move.promotion) {
        victory(`Promotion réussie en ${moves} coups, sans perdre le gain.`);
        return;
      }
      if (boss.goal === 'hold') {
        const hasPawn = /[Pp]/.test(game.fen().split(' ')[0]);
        if (!hasPawn || game.isDraw() || moves >= goalMoves) {
          victory(hasPawn ? `Tu as tenu ${moves} coups sans faiblir.` : 'Le pion est tombé : la nulle est acquise.');
          return;
        }
      }
      if (game.isGameOver()) {
        finishByRules();
        return;
      }
      if (limit && moves >= limit) {
        defeat(`Limite de ${limit} coups atteinte : tu as gardé le gain, mais trop lentement.`);
        return;
      }
      opponentReply();
    };

    if (game.turn() === playerTurn) board.setMovable(true);
    else opponentReply();
  };

  intro();
  return () => { active = false; };
}
