// Mode histoire : deviner les coups d'une partie célèbre.
import { Chess } from '../../vendor/chess.js';
import { Board, uciToMove } from '../chess/board.js';
import { analyse, describeScore, MATE_SCORE } from '../chess/engine.js';
import { dayKey } from '../core/time.js';
import { loadState, saveState } from '../core/store.js';
import { advanceQuest } from '../core/quests.js';
import { CAMPAIGNS, ERAS, GAMES, gameById, THEMES } from '../data/games.js';
import { shuffle } from '../exercises.js';
import { esc, pause, pct } from './ui.js';

const STORY_DEPTH = 12;
export const EQUIVALENT_CP = 30;
export const CORRECT_CP = 120;

/** Points d'un coup, à partir de l'écart moteur avec le coup du maître (en centipions). */
export function pointsForDelta(delta) {
  if (delta <= EQUIVALENT_CP) return 2;
  if (delta <= CORRECT_CP) return 1;
  return 0;
}

export function renderStoryList(app) {
  const state = loadState();
  const cardsFor = (games) => games.map((g) => {
    const record = state.story[g.id];
    const max = (g.guess[1] - g.guess[0] + 1) * 3;
    return `<a class="card game-card" href="#/histoire/${g.id}" data-game="${g.id}">
      <h3>${esc(g.title)}</h3>
      <p class="muted">${esc(g.white)} – ${esc(g.black)}<br>${esc(g.event)}, ${g.year}</p>
      <p class="tags"><span class="tag">${esc(ERAS[g.era])}</span> <span class="tag">${esc(THEMES[g.theme])}</span></p>
      <p class="best">${record ? `Meilleur score : ${record.best}/${max}` : 'Pas encore jouée'}</p>
    </a>`;
  }).join('');
  const tabs = {
    epoque: Object.entries(ERAS).map(([k, label]) => [label, GAMES.filter((g) => g.era === k)]),
    theme: Object.entries(THEMES).map(([k, label]) => [label, GAMES.filter((g) => g.theme === k)]),
    joueur: CAMPAIGNS.map((hero) => [`Campagne ${hero}`, GAMES.filter((g) => g.hero === hero)]),
  };
  app.innerHTML = `
    <section class="page-head">
      <h1>Mode histoire</h1>
      <p class="lead">Mets-toi à la place d’un grand maître et devine ses coups : 3 points pour le sien, 2 pour un coup équivalent, 1 pour un coup correct.</p>
      <div class="segmented" role="group" aria-label="Classer les parties">
        <button class="btn small" data-tab="epoque" aria-pressed="true">Par époque</button>
        <button class="btn small" data-tab="theme" aria-pressed="false">Par thème</button>
        <button class="btn small" data-tab="joueur" aria-pressed="false">Par joueur</button>
      </div>
    </section>
    <div data-chapters></div>`;
  const chapters = app.querySelector('[data-chapters]');
  const show = (key) => {
    app.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === key)));
    chapters.innerHTML = tabs[key].filter(([, g]) => g.length).map(([label, games]) => `
      <section class="chapter"><h2>${esc(label)}</h2><div class="cards">${cardsFor(games)}</div></section>`).join('');
  };
  app.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => show(b.dataset.tab); });
  show('epoque');
}

export function renderStory(app, id) {
  const story = gameById(id);
  if (!story) {
    app.innerHTML = '<section class="panel"><h1>Partie inconnue</h1></section>';
    return null;
  }
  let active = true;
  const isActive = () => active;
  const today = dayKey();
  const state = loadState();
  const sans = story.pgn.split(' ');

  app.innerHTML = `
    <p class="crumb"><a href="#/histoire">← Parties</a></p>
    <section class="session">
      <header class="session-head">
        <h1>${esc(story.title)}</h1>
        <p class="muted">${esc(story.white)} – ${esc(story.black)}, ${esc(story.event)} ${story.year}</p>
      </header>
      <div class="play">
        <div class="board-wrap"><div data-board></div></div>
        <aside class="side">
          <p class="counter" data-counter>Ouverture</p>
          <p class="prompt" data-prompt></p>
          <div data-plan></div>
          <p class="feedback" data-feedback role="status" aria-live="polite"></p>
          <p class="idea" data-idea></p>
          <button class="btn primary" data-next hidden>Suivant</button>
          <button class="btn small" data-skip>Passer l’ouverture</button>
          <p class="moves" data-moves aria-label="Coups joués"></p>
        </aside>
      </div>
    </section>`;

  const $ = (sel) => app.querySelector(sel);
  const game = new Chess();
  const board = new Board($('[data-board]'), {
    orientation: story.side === 'w' ? 'white' : 'black', movable: false,
  });
  const say = (text, kind = '') => {
    $('[data-feedback]').className = `feedback ${kind}`;
    $('[data-feedback]').textContent = text;
  };
  let score = 0;
  let guessed = 0;
  let planRight = 0;
  let planTotal = 0;
  let skipOpening = false;
  const moveText = [];
  const logMove = (san) => {
    moveText.push(game.turn() === 'b'
      ? `${game.moveNumber()}. ${san}`
      : san);
    $('[data-moves]').textContent = moveText.join(' ');
  };

  const moveNumberOf = (ply) => Math.floor(ply / 2) + 1;
  const sideOf = (ply) => (ply % 2 === 0 ? 'w' : 'b');
  const shouldGuess = (ply) => sideOf(ply) === story.side &&
    moveNumberOf(ply) >= story.guess[0] && moveNumberOf(ply) <= story.guess[1];

  const playAuto = (ply) => {
    const move = game.move(sans[ply]);
    logMove(move.san);
    board.setFen(game.fen(), [move.from, move.to]);
    return move;
  };

  const askPlan = (plan) => new Promise((resolve) => {
    const box = $('[data-plan]');
    const options = shuffle(plan.choices.map((label, i) => ({ label, correct: i === 0 })));
    box.className = 'choices';
    box.innerHTML = `<p class="prompt">${esc(plan.prompt)}</p>`;
    options.forEach((o) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn choice';
      button.textContent = o.label;
      button.onclick = () => {
        planTotal += 1;
        if (o.correct) planRight += 1;
        box.querySelectorAll('button').forEach((b, i) => {
          b.disabled = true;
          if (options[i].correct) b.classList.add('right');
        });
        if (!o.correct) button.classList.add('wrong');
        say(o.correct ? 'C’était bien le plan de la partie.' : 'Le maître avait une autre idée.', o.correct ? 'good' : 'bad');
        const next = $('[data-next]');
        next.hidden = false;
        next.textContent = 'Jouer le coup';
        next.onclick = () => {
          next.hidden = true;
          box.innerHTML = '';
          box.className = '';
          say('');
          resolve();
        };
      };
      box.append(button);
    });
  });

  /** Note le coup du joueur. Retourne { points, explain }. */
  const evaluate = async (fen, gmUci, uci) => {
    if (uci === gmUci) return { points: 3, explain: '' };
    const after = (m) => {
      const copy = new Chess(fen);
      copy.move(uciToMove(m));
      return copy;
    };
    const mine = after(uci);
    const theirs = after(gmUci);
    // Un mat immédiat n'a pas besoin de moteur.
    if (mine.isCheckmate()) return { points: 2, explain: 'Ton coup donne mat, lui aussi.' };
    const [own, master] = [
      mine.isGameOver() ? { score: 0, pv: [] } : await analyse(mine.fen(), STORY_DEPTH),
      theirs.isGameOver() ? { score: theirs.isCheckmate() ? -MATE_SCORE : 0, pv: [] } : await analyse(theirs.fen(), STORY_DEPTH),
    ];
    const delta = Math.max(-3000, Math.min(3000, own.score)) * 1 - Math.max(-3000, Math.min(3000, master.score));
    const points = pointsForDelta(delta);
    let explain = '';
    if (points === 2) explain = 'Le moteur juge ton coup équivalent.';
    else if (points === 1) explain = 'Coup correct, mais le moteur préfère celui du maître.';
    else {
      const reply = own.pv?.[0];
      const replySan = reply ? (() => {
        const copy = new Chess(mine.fen());
        return copy.move(uciToMove(reply)).san;
      })() : null;
      explain = `Erreur : ${replySan ? `après ${replySan}, ` : ''}l’évaluation tombe à ${describeScore(-own.score)} pour toi, contre ${describeScore(-master.score)} avec le coup du maître.`;
    }
    return { points, explain };
  };

  const waitNext = (label = 'Suivant') => new Promise((resolve) => {
    const next = $('[data-next]');
    next.hidden = false;
    next.textContent = label;
    next.focus();
    next.onclick = () => {
      next.hidden = true;
      resolve();
    };
  });

  const guessMove = (ply) => new Promise((resolve) => {
    const gm = new Chess(game.fen()).move(sans[ply]);
    const gmUci = gm.from + gm.to + (gm.promotion ?? '');
    const fen = game.fen();
    const number = moveNumberOf(ply);
    $('[data-counter]').textContent = `Coup ${number} · score ${score}`;
    $('[data-prompt]').textContent = `${story.side === 'w' ? 'Blancs' : 'Noirs'} : quel coup jouerais-tu ?`;
    $('[data-idea]').textContent = '';
    board.setMovable(true);
    board.onMove = async (uci) => {
      board.setMovable(false);
      say('Analyse du coup…');
      let result;
      try {
        result = await evaluate(fen, gmUci, uci);
      } catch (err) {
        result = { points: 0, explain: `Le moteur n’a pas pu évaluer ce coup (${err.message}).` };
      }
      if (!isActive()) return;
      score += result.points;
      guessed += 1;
      advanceQuest(state, today, 'story');
      saveState();
      const label = { 3: 'Coup du maître : 3 points', 2: 'Équivalent : 2 points', 1: 'Correct : 1 point', 0: '0 point' }[result.points];
      say(`${label}. ${result.explain}`, result.points >= 2 ? 'good' : result.points === 1 ? '' : 'bad');
      const move = game.move(sans[ply]);
      logMove(move.san);
      board.setFen(game.fen(), [move.from, move.to]);
      board.setMarks(uci === gmUci ? {} : { [uci.slice(2, 4)]: 'bad' });
      $('[data-prompt]').textContent = 'Le maître a joué :';
      $('[data-idea]').textContent = `${move.san} : ${story.ideas[number]}`;
      $('[data-counter]').textContent = `Coup ${number} · score ${score}`;
      await waitNext();
      if (!isActive()) return;
      board.setMarks({});
      say('');
      resolve();
    };
  });

  const finish = () => {
    const max = (story.guess[1] - story.guess[0] + 1) * 3;
    const record = (state.story[id] ??= { best: 0, attempts: 0, lastDay: null });
    const previous = record.best;
    record.attempts += 1;
    record.best = Math.max(record.best, score);
    record.lastDay = today;
    saveState();
    $('.play').outerHTML = `<div class="result left">
      <p class="score-big">${score}<small>/${max}</small></p>
      <p class="muted">${pct(score / max)}${planTotal ? ` · plans trouvés : ${planRight}/${planTotal}` : ''}${previous ? ` · ton record précédent : ${previous}` : ''}</p>
      <h2>À retenir</h2>
      <ul class="plain">${story.keyIdeas.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>
      <p class="actions"><a class="btn primary" href="#/histoire">Autres parties</a> <a class="btn" href="#/">Accueil</a></p>
    </div>`;
  };

  (async () => {
    $('[data-skip]').onclick = () => { skipOpening = true; };
    $('[data-prompt]').textContent = 'Les premiers coups se jouent seuls.';
    for (let ply = 0; ply < sans.length; ply += 1) {
      if (!isActive()) return;
      const number = moveNumberOf(ply);
      if (number > story.guess[1]) break;
      if (shouldGuess(ply)) {
        $('[data-skip]').hidden = true;
        const plan = story.plans?.[number];
        if (plan) await askPlan(plan);
        if (!isActive()) return;
        await guessMove(ply);
        continue;
      }
      const opening = number < story.guess[0];
      if (!skipOpening) await pause(opening ? 650 : 900);
      if (!isActive()) return;
      playAuto(ply);
      if (sideOf(ply) === 'b' && story.notes?.[number] && opening) {
        $('[data-idea]').textContent = story.notes[number];
        if (!skipOpening) await pause(1600);
      }
    }
    if (isActive()) finish();
  })();

  return () => { active = false; };
}
