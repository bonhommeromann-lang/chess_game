// Déroulé d'une séance d'exercices, tous types confondus.
import { Chess } from '../../vendor/chess.js';
import { Board, uciToMove } from '../chess/board.js';
import { dayKey } from '../core/time.js';
import { loadState, saveState } from '../core/store.js';
import {
  nextBand, PASS_THRESHOLD, recordSession, REVIEW_SIZE, SESSION_SIZE, skillData, skillStatus,
} from '../core/mastery.js';
import { recordRatedExercise } from '../core/elo.js';
import { advanceQuest, TACTICS_GOAL } from '../core/quests.js';
import { buildSession, buildTacticsQuest } from '../exercises.js';
import { skillById, SKILLS } from '../data/skills.js';
import { refreshElo } from './elobar.js';
import { esc, pause, pct } from './ui.js';

const sideLabel = (turn) => (turn === 'w' ? 'Trait aux blancs' : 'Trait aux noirs');

/** Joue un exercice dans le conteneur. Résout { correct } une fois l'exercice terminé. */
function playItem(host, item, { isCurrent }) {
  return new Promise((resolve) => {
    host.innerHTML = `
      <div class="play">
        <div class="board-wrap"><div data-board></div></div>
        <aside class="side">
          <p class="prompt" data-prompt></p>
          <div data-choices></div>
          <p class="feedback" data-feedback role="status" aria-live="polite"></p>
          <button class="btn primary" data-next hidden>Suivant</button>
        </aside>
      </div>`;
    const prompt = host.querySelector('[data-prompt]');
    const feedback = host.querySelector('[data-feedback]');
    const next = host.querySelector('[data-next]');
    const choiceBox = host.querySelector('[data-choices]');

    const finish = (correct, message) => {
      feedback.className = `feedback ${correct ? 'good' : 'bad'}`;
      feedback.textContent = message;
      next.hidden = false;
      next.focus();
      next.onclick = () => resolve({ correct });
    };

    if (item.kind === 'puzzle') {
      const game = new Chess(item.fen);
      game.move(uciToMove(item.moves[0]));
      const orientation = game.turn() === 'w' ? 'white' : 'black';
      let index = 1;
      const board = new Board(host.querySelector('[data-board]'), {
        fen: item.fen, orientation, movable: false,
      });
      prompt.textContent = `${sideLabel(game.turn())} : trouve le meilleur coup.`;
      const showSolution = () => {
        const line = [];
        const copy = new Chess(game.fen());
        for (const uci of item.moves.slice(index)) line.push(copy.move(uciToMove(uci)).san);
        return line.join(' ');
      };
      board.onMove = async (uci) => {
        const expected = item.moves[index];
        const test = new Chess(game.fen());
        test.move(uciToMove(uci));
        // Tout coup qui donne mat est accepté, même s'il diffère de la solution enregistrée.
        if (uci !== expected && !test.isCheckmate()) {
          board.setMovable(false);
          board.setMarks({ [uci.slice(2, 4)]: 'bad' }, [[expected.slice(0, 2), expected.slice(2, 4)]]);
          finish(false, `Pas tout à fait. La solution était : ${showSolution()}.`);
          return;
        }
        game.move(uciToMove(uci));
        index += 1;
        board.setFen(game.fen(), [uci.slice(0, 2), uci.slice(2, 4)]);
        if (test.isCheckmate() || index >= item.moves.length) {
          board.setMovable(false);
          board.setMarks({ [uci.slice(2, 4)]: 'good' });
          finish(true, 'Bien vu.');
          return;
        }
        board.setMovable(false);
        feedback.textContent = 'Juste. Continue.';
        await pause(450);
        if (!isCurrent()) return;
        const reply = item.moves[index];
        game.move(uciToMove(reply));
        index += 1;
        board.setFen(game.fen(), [reply.slice(0, 2), reply.slice(2, 4)]);
        board.setMovable(true);
      };
      pause(500).then(() => {
        if (!isCurrent()) return;
        const first = item.moves[0];
        board.setFen(game.fen(), [first.slice(0, 2), first.slice(2, 4)]);
        board.setMovable(true);
      });
      return;
    }

    if (item.kind === 'line') {
      const game = new Chess();
      const board = new Board(host.querySelector('[data-board]'), {
        orientation: item.side === 'w' ? 'white' : 'black', movable: false,
      });
      let index = 0;
      prompt.textContent = item.showName
        ? `${item.name} : joue les coups de ta ligne de répertoire.`
        : 'Joue la ligne de répertoire adaptée aux réponses de l’adversaire.';
      const advance = async () => {
        while (index < item.moves.length && game.turn() !== item.side) {
          await pause(350);
          if (!isCurrent()) return;
          const move = game.move(item.moves[index]);
          index += 1;
          board.setFen(game.fen(), [move.from, move.to]);
        }
        if (index >= item.moves.length) {
          board.setMovable(false);
          finish(true, `Ligne jouée sans faute : ${item.name}.`);
        } else {
          board.setMovable(true);
        }
      };
      board.onMove = (uci) => {
        const expected = new Chess(game.fen()).move(item.moves[index]);
        const playedUci = expected.from + expected.to + (expected.promotion ?? '');
        if (uci !== playedUci) {
          board.setMovable(false);
          board.setMarks({}, [[expected.from, expected.to]]);
          finish(false, `Dans ce répertoire, on joue ${expected.san} (${item.name}).`);
          return;
        }
        const move = game.move(uciToMove(uci));
        index += 1;
        board.setFen(game.fen(), [move.from, move.to]);
        advance();
      };
      advance();
      return;
    }

    if (item.kind === 'choice') {
      const board = new Board(host.querySelector('[data-board]'), { fen: item.fen, orientation: item.orientation });
      if (item.marks) board.setMarks(item.marks);
      prompt.textContent = item.prompt;
      choiceBox.className = 'choices';
      item.choices.forEach((choice) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn choice';
        b.textContent = choice.label;
        b.onclick = () => {
          choiceBox.querySelectorAll('button').forEach((x, i) => {
            x.disabled = true;
            if (item.choices[i].correct) x.classList.add('right');
          });
          if (!choice.correct) b.classList.add('wrong');
          finish(choice.correct, item.why);
        };
        choiceBox.append(b);
      });
      return;
    }

    if (item.kind === 'pick') {
      prompt.textContent = item.prompt;
      const board = new Board(host.querySelector('[data-board]'), { fen: item.fen, orientation: item.orientation });
      board.onPick = (sq) => {
        board.onPick = () => {};
        const correct = item.answers.includes(sq);
        const marks = Object.fromEntries(item.answers.map((a) => [a, 'good']));
        if (!correct) marks[sq] = 'bad';
        board.setMarks(marks);
        finish(correct, item.why);
      };
    }
  });
}

/** Lance une série d'exercices et renvoie les résultats. */
async function runItems(host, items, header, isCurrent) {
  const results = [];
  for (let i = 0; i < items.length; i += 1) {
    if (!isCurrent()) return null;
    header(i, results);
    const { correct } = await playItem(host, items[i], { isCurrent });
    if (!isCurrent()) return null;
    results.push({ correct, weight: items[i].weight, id: items[i].id });
    if (items[i].rating) {
      recordRatedExercise(loadState(), items[i].rating, correct);
      saveState();
      refreshElo();
    }
  }
  return results;
}

const REASONS = {
  score: 'Il faut 80 % pour que la session compte.',
  'meme-jour': 'Session réussie, mais tu en as déjà validé une aujourd’hui. La confirmation doit se faire un autre jour.',
  difficulte: 'Cette session était trop facile pour servir de confirmation.',
  'trop-court': 'Séance trop courte pour compter.',
};

export function renderSkillSession(app, id) {
  const skill = skillById(id);
  let active = true;
  const state = loadState();
  const today = dayKey();
  const status = skill ? skillStatus(state, skill, today) : 'locked';
  if (!skill || skill.boss || status === 'locked') {
    app.innerHTML = `<section class="panel"><h1>Séance indisponible</h1>
      <p><a href="#/arbre">Retour à l’arbre</a></p></section>`;
    return null;
  }
  const isReview = status === 'decayed' || status === 'validated';
  const size = isReview ? REVIEW_SIZE : SESSION_SIZE;
  const band = nextBand(state, skill);

  app.innerHTML = `
    <p class="crumb"><a href="#/competence/${id}">← ${esc(skill.name)}</a></p>
    <section class="session">
      <header class="session-head">
        <h1>${esc(skill.name)}</h1>
        <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${size}" data-bar><i></i></div>
        <p class="muted" data-count>Préparation…</p>
      </header>
      <div data-host></div>
    </section>`;
  const host = app.querySelector('[data-host]');
  const bar = app.querySelector('[data-bar]');
  const count = app.querySelector('[data-count]');

  (async () => {
    let items;
    try {
      items = await buildSession(skill, band, state.seen, size);
    } catch (err) {
      host.innerHTML = `<p class="banner warn">${esc(err.message)}</p>`;
      return;
    }
    const results = await runItems(host, items, (i) => {
      bar.querySelector('i').style.width = `${(i / items.length) * 100}%`;
      bar.setAttribute('aria-valuenow', i);
      count.textContent = `Exercice ${i + 1} sur ${items.length}${band ? ' · difficulté relevée' : ''}`;
    }, () => active);
    if (!results) return;

    results.forEach((r) => { state.seen[r.id] = today; });
    const outcome = recordSession(state, skill, { results, band }, today);
    if (outcome.counted) advanceQuest(state, today, 'boss');
    saveState();
    bar.querySelector('i').style.width = '100%';

    const data = skillData(state, id);
    let verdict;
    if (outcome.event === 'gain') verdict = `<p class="banner good">Compétence validée. Les suivantes de la branche peuvent se débloquer.</p>`;
    else if (outcome.event === 'restored') verdict = `<p class="banner good">Révision réussie : la compétence redevient verte.</p>`;
    else if (outcome.counted && !data.validatedDay) verdict = `<p class="banner good">Session comptée. Reviens demain pour la confirmation.</p>`;
    else if (outcome.counted) verdict = `<p class="banner good">Entretien réussi.</p>`;
    else verdict = `<p class="banner">${esc(REASONS[outcome.reason] ?? '')}</p>`;

    count.textContent = 'Séance terminée';
    host.innerHTML = `<div class="result">
      <p class="score-big">${pct(outcome.score)}</p>
      <p class="muted">${results.filter((r) => r.correct).length} sur ${results.length} · seuil : ${pct(PASS_THRESHOLD)}, score pondéré par la difficulté</p>
      ${verdict}
      <p class="actions"><a class="btn primary" href="#/arbre">Retour à l’arbre</a> <a class="btn" href="#/">Accueil</a></p>
    </div>`;
  })();

  return () => { active = false; };
}

export function renderQuestTactics(app) {
  let active = true;
  const state = loadState();
  const today = dayKey();
  const unlocked = SKILLS
    .filter((s) => s.branch === 'tactique' && skillStatus(state, s, today) !== 'locked')
    .map((s) => s.id);

  app.innerHTML = `
    <p class="crumb"><a href="#/">← Aujourd’hui</a></p>
    <section class="session">
      <header class="session-head">
        <h1>Tactiques du jour</h1>
        <p class="muted" data-count>Préparation…</p>
      </header>
      <div data-host></div>
    </section>`;
  const host = app.querySelector('[data-host]');
  const count = app.querySelector('[data-count]');
  (async () => {
    const items = await buildTacticsQuest(unlocked, state.seen, TACTICS_GOAL);
    const results = await runItems(host, items, (i) => {
      count.textContent = `Exercice ${i + 1} sur ${items.length}`;
    }, () => active);
    if (!results) return;
    results.forEach((r) => { state.seen[r.id] = today; });
    advanceQuest(state, today, 'tactics', results.length);
    saveState();
    count.textContent = 'Terminé';
    host.innerHTML = `<div class="result">
      <p class="score-big">${results.filter((r) => r.correct).length}/${results.length}</p>
      <p class="muted">L’entraînement quotidien ne valide pas de compétence : il garde l’œil en forme.</p>
      <p class="actions"><a class="btn primary" href="#/">Retour à la séance du jour</a></p>
    </div>`;
  })();
  return () => { active = false; };
}
