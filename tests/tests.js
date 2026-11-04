// Tests exécutés dans le navigateur : ouvrir /tests/ (ou lancer tests/run_tests.py).
import { Chess } from '../vendor/chess.js';
import { addDays, daysBetween } from '../src/core/time.js';
import { emptyState } from '../src/core/store.js';
import {
  branchLevel, decayReason, isUnlocked, nextBand, recordBossWin, recordRealError, recordSession,
  rematchInfo, scoreSession, skillStatus, syncDecay,
} from '../src/core/mastery.js';
import { advanceQuest, streakInfo } from '../src/core/quests.js';
import { estimateElo, recordRatedExercise, START_RATING } from '../src/core/elo.js';
import { layoutSkills } from '../src/views/skillmap.js';
import { buildPlan, placementFromElo, refreshPlacement, trainingHref } from '../src/core/plan.js';
import {
  bishopQuality, detectFork, detectLineMotif, doubledPawns, isolatedPawns, isSacrifice, materialKey, openFiles,
  passedPawns, playUci, semiOpenFiles, squareColor, weakSquares,
} from '../src/chess/detect.js';
import { moveOutcome, positionOutcome, probe } from '../src/chess/tablebase.js';
import { analyse } from '../src/chess/engine.js';
import {
  analyseGame, badgesFromGame, classifyError, timeClassOf, isErrorMove, motifOfLine, winChance, controlVerdict, endgameSkill, motifOfMove, parseGame, playerColor,
  splitPgn,
} from '../src/analysis.js';
import { SKILLS, BRANCHES, skillById } from '../src/data/skills.js';
import { BOSSES } from '../src/data/bosses.js';
import { GAMES } from '../src/data/games.js';
import { LINES, QUIZZES } from '../src/data/quizzes.js';
import { buildSession, GENERATORS, loadEndgames, loadPuzzles } from '../src/exercises.js';
import { pointsForDelta } from '../src/views/story.js';
import { MAX_FIGHT_PAWN_RANK, pawnRank } from '../src/views/boss.js';

const out = document.getElementById('out');
const failures = [];
let passes = 0;

function check(name, condition, detail = '') {
  if (condition) passes += 1;
  else failures.push(`${name}${detail ? ` : ${detail}` : ''}`);
}
const eq = (name, a, b) => check(name, JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

const good = Array.from({ length: 8 }, () => ({ correct: true, weight: 1 }));
const def = { id: 't', requires: [], tier: 1 };
const D0 = '2026-03-01';

// -- Dates ----------------------------------------------------------------------------------
eq('jours entre deux dates', daysBetween('2026-02-27', '2026-03-02'), 3);
eq('ajout de jours', addDays('2026-12-31', 1), '2027-01-01');

// -- Validation et anti-farm ----------------------------------------------------------------
{
  const s = emptyState();
  eq('statut initial', skillStatus(s, def, D0), 'available');
  const r1 = recordSession(s, def, { results: good, band: 0 }, D0);
  check('1re session comptée', r1.passed && r1.counted);
  eq('en cours après une session', skillStatus(s, def, D0), 'progress');
  eq('confirmation plus difficile', nextBand(s, def), 1);

  const same = recordSession(s, def, { results: good, band: 1 }, D0);
  check('2 réussites le même jour ne valident pas', !same.counted && same.reason === 'meme-jour');
  eq('toujours en cours', skillStatus(s, def, D0), 'progress');

  const easy = recordSession(s, def, { results: good, band: 0 }, addDays(D0, 1));
  check('la bande facile ne confirme pas', !easy.counted && easy.reason === 'difficulte');

  const r2 = recordSession(s, def, { results: good, band: 1 }, addDays(D0, 1));
  eq('validation le lendemain', r2.event, 'gain');
  eq('validée', skillStatus(s, def, addDays(D0, 1)), 'validated');
}
{
  const s = emptyState();
  const low = [...Array(7).fill({ correct: true, weight: 1 }), ...Array(3).fill({ correct: false, weight: 1 })];
  const failed = recordSession(s, def, { results: low, band: 0 }, D0);
  check('70 % ne suffit pas', !failed.passed);
  // Volume : 50 sessions ratées ou faciles ne valident rien.
  for (let i = 0; i < 50; i += 1) recordSession(s, def, { results: low, band: 0 }, addDays(D0, i));
  eq('le volume ne valide pas', skillStatus(s, def, addDays(D0, 60)), 'available');
  const short = recordSession(s, def, { results: good.slice(0, 3), band: 0 }, D0);
  check('séance trop courte refusée', !short.passed && short.reason === 'trop-court');
}
eq('score pondéré par la difficulté',
  scoreSession([{ correct: true, weight: 1 }, { correct: false, weight: 3 }]), 0.25);

// -- Dégradation ----------------------------------------------------------------------------
{
  const s = emptyState();
  recordSession(s, def, { results: good, band: 0 }, D0);
  recordSession(s, def, { results: good, band: 1 }, addDays(D0, 1));
  const D1 = addDays(D0, 1);
  eq('verte juste avant l’échéance', skillStatus(s, def, addDays(D1, 21)), 'validated');
  eq('orange après oubli', skillStatus(s, def, addDays(D1, 22)), 'decayed');
  syncDecay(s, [def], addDays(D1, 22));
  eq('dégradation journalisée', s.log.at(-1).type, 'loss');
  syncDecay(s, [def], addDays(D1, 23));
  eq('journalisée une seule fois', s.log.filter((l) => l.type === 'loss').length, 1);
  const review = recordSession(s, def, { results: good.slice(0, 5), band: 1 }, addDays(D1, 23));
  eq('révision réussie', review.event, 'restored');
  eq('redevient verte', skillStatus(s, def, addDays(D1, 23)), 'validated');
  eq('intervalle allongé', s.skills.t.intervalDays, 42);
}
{
  const s = emptyState();
  recordSession(s, def, { results: good, band: 0 }, D0);
  recordSession(s, def, { results: good, band: 1 }, addDays(D0, 1));
  const day = addDays(D0, 5);
  recordRealError(s, def, 'g1', day, day);
  eq('une erreur réelle reste verte', skillStatus(s, def, day), 'validated');
  recordRealError(s, def, 'g1', day, day);
  eq('même partie comptée une fois', s.skills.t.realErrors.length, 1);
  recordRealError(s, def, 'g2', day, day);
  eq('deux parties : orange', decayReason(s, def, day), 'parties');
  eq('perte journalisée', s.log.at(-1).reason, 'parties');
  s.skills.t.intervalDays = 120;
  eq('fenêtre glissante : l’erreur ancienne expire', decayReason(s, def, addDays(day, 40)), null);
}
{
  const s = emptyState();
  const a = { id: 'a', requires: [], tier: 1 };
  const b = { id: 'b', requires: ['a'], tier: 2 };
  eq('prérequis verrouille', skillStatus(s, b, D0), 'locked');
  recordSession(s, a, { results: good, band: 0 }, D0);
  eq('une session ne débloque pas', isUnlocked(s, b), false);
  recordSession(s, a, { results: good, band: 1 }, addDays(D0, 1));
  eq('la validation débloque', skillStatus(s, b, addDays(D0, 1)), 'available');
  eq('niveau de branche pondéré', branchLevel(s, [a, b], addDays(D0, 1)), 33);
}

// -- Boss et revanche -----------------------------------------------------------------------
{
  const s = emptyState();
  const bossSkill = { id: 'x', requires: [], tier: 1, boss: 'gardien' };
  eq('victoire valide', recordBossWin(s, 'gardien', bossSkill, D0, 2), 'gain');
  eq('palier relevé', s.bosses.gardien.tier, 1);
  eq('revanche pas encore due', rematchInfo(s, 'gardien', addDays(D0, 6)).due, false);
  eq('revanche due à 7 jours', rematchInfo(s, 'gardien', addDays(D0, 7)).due, true);
  eq('verte pendant le délai de grâce', skillStatus(s, bossSkill, addDays(D0, 10)), 'validated');
  eq('orange si revanche négligée', skillStatus(s, bossSkill, addDays(D0, 11)), 'decayed');
  syncDecay(s, [bossSkill], addDays(D0, 11));
  eq('revanche restaure', recordBossWin(s, 'gardien', bossSkill, addDays(D0, 11), 2), 'restored');
  eq('redevient verte', skillStatus(s, bossSkill, addDays(D0, 11)), 'validated');
  eq('palier 3', s.bosses.gardien.tier, 2);
  recordBossWin(s, 'gardien', bossSkill, addDays(D0, 20), 2);
  eq('palier plafonné', s.bosses.gardien.tier, 2);
}

// -- Quêtes et séries -----------------------------------------------------------------------
{
  const s = emptyState();
  const complete = (day) => {
    advanceQuest(s, day, 'tactics', 5);
    advanceQuest(s, day, 'boss');
    advanceQuest(s, day, 'story', 3);
  };
  advanceQuest(s, D0, 'tactics', 5);
  check('quête incomplète', !s.daily[D0].done);
  complete(D0);
  check('quête complète', s.daily[D0].done);
  eq('série de 1', streakInfo(s, D0).length, 1);
  eq('aujourd’hui en attente ne casse rien', streakInfo(s, addDays(D0, 1)).length, 1);

  const t = emptyState();
  for (let i = 0; i < 5; i += 1) complete2(t, addDays(D0, i));
  eq('5 jours', streakInfo(t, addDays(D0, 4)).length, 5);
  // Un jour manqué est pardonné.
  complete2(t, addDays(D0, 6));
  const st = streakInfo(t, addDays(D0, 6));
  eq('un jour manqué pardonné', st.length, 6);
  check('tolérance signalée', st.toleranceUsed);
  // Deux jours manqués consécutifs cassent la série.
  complete2(t, addDays(D0, 9));
  eq('deux manqués : remise à zéro', streakInfo(t, addDays(D0, 9)).length, 1);
  // Deux manqués espacés d'une semaine sont pardonnés tous les deux.
  const u = emptyState();
  const days = [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 16];
  days.forEach((d) => complete2(u, addDays(D0, d)));
  eq('un manqué par semaine reste toléré', streakInfo(u, addDays(D0, 16)).length, 15);
  // Deux manqués dans la même semaine ne le sont pas.
  const v = emptyState();
  [0, 1, 3, 5].forEach((d) => complete2(v, addDays(D0, d)));
  eq('deux manqués dans la semaine', streakInfo(v, addDays(D0, 5)).length, 2);
}
function complete2(s, day) {
  advanceQuest(s, day, 'tactics', 5);
  advanceQuest(s, day, 'boss');
  advanceQuest(s, day, 'story', 3);
}

// -- Détecteurs -----------------------------------------------------------------------------
{
  eq('couleur de a1', squareColor('a1'), 'dark');
  eq('couleur de h1', squareColor('h1'), 'light');
  const g = new Chess('4k3/8/8/8/2P5/2P5/P5PP/4K3 w - - 0 1');
  eq('pions isolés', isolatedPawns(g, 'w').sort(), ['a2', 'c3', 'c4']);
  eq('pions doublés', doubledPawns(g, 'w').sort(), ['c3', 'c4']);
  const p = new Chess('4k3/p7/8/8/4P3/8/P7/4K3 w - - 0 1');
  eq('pion passé', passedPawns(p, 'w'), ['e4']);
  const opened = new Chess('4k3/pp4pp/8/8/8/8/PP3PPP/4K3 w - - 0 1');
  eq('colonnes ouvertes', openFiles(opened), ['c', 'd', 'e']);
  eq('colonnes semi-ouvertes', semiOpenFiles(new Chess('4k3/4p3/8/8/8/8/3P4/4K3 w - - 0 1'), 'w'), ['e']);
  const holes = new Chess('4k3/8/8/8/8/P6P/8/4K3 w - - 0 1');
  check('case faible : aucun pion voisin', weakSquares(holes, 'w').includes('e3'));
  const noHole = new Chess('4k3/8/8/8/8/8/3P1P2/4K3 w - - 0 1');
  check('e3 garde-able par d2', !weakSquares(noHole, 'w').includes('e3'));
  const b = bishopQuality(new Chess('4k3/8/8/8/8/2P1P3/1P1P1P2/2B1K3 w - - 0 1'), 'w')[0];
  eq('mauvais fou : pions de sa couleur', [b.same, b.total], [5, 5]);
  eq('signature de matériel', materialKey('8/8/8/4k3/8/8/4PK2/7R w - - 0 1'), 'KRPvK');

  const fork = playUci('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', 'b5c7');
  check('fourchette de cavalier', detectFork(fork.after, fork.move));
  const noFork = playUci('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', 'b5a3');
  check('pas de fourchette', !detectFork(noFork.after, noFork.move));
  eq('clouage de fou', motifOfMove('4k3/3n4/8/8/8/8/8/4K2B w - - 0 1', 'h1c6'), 'clouage');
  eq('enfilade dame puis tour', motifOfMove('2r5/3q4/8/8/8/8/8/K4B1k w - - 0 1', 'f1h3'), 'enfilade');
  const line = playUci('4k3/8/8/8/8/8/8/4K2R w - - 0 1', 'h1h7');
  eq('pas de motif de ligne sans cible', detectLineMotif(line.after, line.move), null);
}

// -- Cadences ---------------------------------------------------------------------------------
{
  eq('cadence bullet', timeClassOf('60'), 'bullet');
  eq('cadence bullet avec incrément', timeClassOf('60+1'), 'bullet');
  eq('cadence blitz', timeClassOf('300+2'), 'blitz');
  eq('cadence rapide', timeClassOf('600'), 'rapid');
  eq('cadence classique', timeClassOf('1800+30'), 'classical');
  eq('correspondance', timeClassOf('1/86400'), 'daily');
  eq('cadence absente', timeClassOf(undefined), 'unknown');

  const mix = emptyState();
  mix.games = [
    { date: '2026-01-01', rating: 1000, timeClass: 'blitz' },
    { date: '2026-01-02', rating: 1600, timeClass: 'rapid' },
    { date: '2026-01-03', rating: 1400, timeClass: 'rapid' },
    { date: '2026-01-04', rating: 2200, timeClass: 'bullet' },
    { date: '2026-01-05', rating: 2200, timeClass: 'bullet' },
    { date: '2026-01-06', rating: 2200, timeClass: 'bullet' },
  ];
  eq('Élo : cadence principale, sans mélanger ni compter le bullet', estimateElo(mix).rating, 1500);
  check('Élo : cadence annoncée', estimateElo(mix).source.includes('rapide'));
  const onlyBullet = emptyState();
  onlyBullet.games = [{ date: '2026-01-01', rating: 900, timeClass: 'bullet' }];
  eq('Élo : le bullet sert s’il n’y a rien d’autre', estimateElo(onlyBullet).rating, 900);
}

// -- Sacrifices --------------------------------------------------------------------------------
{
  const sac = (fen, uci) => {
    const { after, move } = playUci(fen, uci);
    return isSacrifice(after, move);
  };
  check('sacrifice : fou donné en f7', sac('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 0 1', 'c4f7'));
  check('pas de sacrifice : poussée de pion défendue', !sac('r1bqkbnr/pp2pppp/2np4/2p5/2B1PP2/5N2/PPPP2PP/RNBQK2R b KQkq - 0 1', 'e7e6'));
  check('pas de sacrifice : case non attaquée', !sac('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'a1a7'));
  check('pas de sacrifice : prise gagnante', !sac('4k3/8/3p4/4q3/8/8/8/4R1K1 w - - 0 1', 'e1e5'));
  check('sacrifice : dame défendue prise par un pion', sac('4k3/8/3p4/R7/8/8/8/4Q1K1 w - - 0 1', 'e1e5'));
  eq('combinaisons : plus de fourre-tout', classifyError({
    fen: 'r1bqkbnr/pp2pppp/2np4/2p5/2B1PP2/5N2/PPPP2PP/RNBQK2R b KQkq - 0 1',
    played: 'g7g6', best: 'e7e6', reply: 'c4f7', plyIndex: 30, color: 'b',
    bestLine: ['e7e6', 'e1g1', 'g8f6', 'd2d3', 'f8e7'], replyLine: [],
  }), null);
}

// -- Lien entre erreurs et compétences -------------------------------------------------------
{
  eq('finale de tours côté défense', endgameSkill('8/8/8/4k3/8/8/4PK2/r6R b - - 0 1', 'b'), 'philidor');
  eq('finale de tours côté attaque', endgameSkill('8/8/8/4k3/8/8/4PK2/r6R b - - 0 1', 'w'), 'lucena');
  eq('roi + dame', endgameSkill('8/8/8/4k3/8/8/5K2/7Q w - - 0 1', 'w'), 'mat-kq');
  eq('finale de fous', endgameSkill('8/5pp1/4b3/4k3/8/4B3/4PK2/8 w - - 0 1', 'w'), 'finales-fous');
  eq('pas de finale', endgameSkill(new Chess().fen(), 'w'), null);

  // Mat en 1 manqué : Qh7 était mat, le joueur a joué autre chose.
  const mateFen = '6k1/5ppp/8/8/8/8/5PPP/3Q2K1 w - - 0 1';
  eq('mat en 1 manqué', classifyError({
    fen: mateFen, played: 'g2g3', best: 'd1d8', reply: 'g7g6', plyIndex: 40, color: 'w',
  }), 'mat-en-1');
  // Fourchette subie : le coup joué permet Nc2+.
  eq('fourchette subie', classifyError({
    fen: 'r3k3/8/8/8/1n6/8/8/R3K2R w - - 0 1', played: 'h1g1', best: 'a1a8', reply: 'b4c2', plyIndex: 40, color: 'w',
  }), 'fourchette');
  eq('ouverture sans motif : principes', classifyError({
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    played: 'g8h6', best: 'e7e5', reply: 'd2d4', plyIndex: 1, color: 'b',
  }), 'principes');
  eq('milieu de jeu sans motif : pas de compétence', classifyError({
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    played: 'g8h6', best: 'e7e5', reply: 'd2d4', plyIndex: 30, color: 'b',
  }), null);
}

// -- Lecture des PGN ------------------------------------------------------------------------
{
  const pgn = `[Event "A"]\n[White "Moi"]\n[Black "Toi"]\n[WhiteElo "1500"]\n[Result "1-0"]\n[UTCDate "2026.03.01"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 1-0\n\n[Event "B"]\n[White "Toi"]\n[Black "Moi"]\n[Result "0-1"]\n\n1. d4 d5 2. c4 e6 3. Nc3 Nf6 0-1\n`;
  const list = splitPgn(pgn);
  eq('découpage du PGN', list.length, 2);
  const a = parseGame(list[0]);
  eq('date du PGN', a.date, '2026-03-01');
  eq('classement', a.whiteElo, 1500);
  eq('couleur du joueur, casse ignorée', playerColor(a, 'moi'), 'w');
  eq('joueur absent', playerColor(a, 'autre'), null);
  eq('PGN illisible', parseGame('[Event "x"]\n\n1. e4 e4 *'), null);
  check('identifiant stable', parseGame(list[0]).id === a.id);
}

// -- Badges et règle de contrôle ------------------------------------------------------------
{
  const base = { outcome: 'win', rookEndingEqualish: true, playedMotifs: ['fourchette'], finalMaterial: 'KRvKP', lowestEval: -400, myMoves: 30, errors: [] };
  const b = badgesFromGame(base);
  ['finale-tours', 'fourchette-reelle', 'retournement', 'sans-bavure'].forEach((id) => check(`badge ${id}`, b.includes(id)));
  eq('aucun badge sur une défaite', badgesFromGame({ ...base, outcome: 'loss' }), []);

  const today = '2026-03-30';
  const s = emptyState();
  eq('contrôle sans parties', controlVerdict(s, today).status, 'unknown');
  s.log.push({ day: '2026-03-20', type: 'gain', id: 'x' });
  const mk = (date, rating, errors) => ({ date, rating, myMoves: 40, errors: Array(errors).fill({}) });
  s.games = [mk('2026-03-10', 1500, 2), mk('2026-03-12', 1490, 2), mk('2026-03-20', 1480, 2), mk('2026-03-25', 1470, 3)];
  eq('badges sans progrès : avertissement', controlVerdict(s, today).status, 'warning');
  s.games.at(-1).rating = 1560;
  eq('classement en hausse : confirmé', controlVerdict(s, today).status, 'confirmed');
}

eq('barème : équivalent', pointsForDelta(10), 2);
eq('barème : correct', pointsForDelta(100), 1);
eq('barème : erreur', pointsForDelta(300), 0);

// -- Contenu rédigé -------------------------------------------------------------------------
{
  eq('4 branches', BRANCHES.length, 4);
  for (const s of SKILLS) {
    for (const r of s.requires) {
      check(`prérequis ${s.id}/${r}`, skillById(r) && skillById(r).branch === s.branch && skillById(r).tier <= s.tier);
    }
  }
  const legal = (moves, label) => {
    const g = new Chess();
    for (const m of moves.split(' ')) {
      try {
        g.move(m);
      } catch {
        check(`${label} : ${m} illégal`, false, g.fen());
        return null;
      }
    }
    return g;
  };
  for (const [skill, questions] of Object.entries(QUIZZES)) {
    questions.forEach((q, i) => {
      const g = legal(q.moves, `quiz ${skill} ${i}`);
      if (!g) return;
      passes += 1;
      if (/^[a-zA-Z][\w+#=-]*$/.test(q.choices[0]) && q.choices.every((c) => c.length < 8)) {
        q.choices.forEach((c) => {
          try { new Chess(g.fen()).move(c); passes += 1; } catch { check(`quiz ${skill} ${i} choix ${c}`, false); }
        });
      }
      eq(`quiz ${skill} ${i} : 3 choix`, q.choices.length, 3);
      check(`quiz ${skill} ${i} : explication`, q.why?.length > 10);
    });
    check(`quiz ${skill} : au moins 8`, questions.length >= 8);
  }
  for (const [skill, { lines }] of Object.entries(LINES)) {
    check(`lignes ${skill}`, lines.length >= 5);
    lines.forEach((l) => check(`ligne ${l.name}`, Boolean(legal(l.moves, `ligne ${l.name}`))));
  }
  for (const game of GAMES) {
    const g = legal(game.pgn, `partie ${game.id}`);
    check(`partie ${game.id} légale`, Boolean(g));
    if (!g) continue;
    const history = g.history({ verbose: true });
    const number = (i) => Math.floor(i / 2) + 1;
    for (let n = game.guess[0]; n <= game.guess[1]; n += 1) {
      check(`${game.id} : idée au coup ${n}`, game.ideas[n]?.length > 10);
      const idx = (n - 1) * 2 + (game.side === 'w' ? 0 : 1);
      check(`${game.id} : coup ${n} existe`, Boolean(history[idx]), `${history.length}`);
      check(`${game.id} : numérotation`, number(idx) === n);
    }
    eq(`${game.id} : pas d’idée en trop`, Object.keys(game.ideas).length, game.guess[1] - game.guess[0] + 1);
    check(`${game.id} : 2 ou 3 idées clés`, game.keyIdeas.length >= 2 && game.keyIdeas.length <= 3);
    for (const [n, plan] of Object.entries(game.plans ?? {})) {
      eq(`${game.id} : plan ${n}`, plan.choices.length, 3);
      check(`${game.id} : plan dans la fenêtre`, n >= game.guess[0] && n <= game.guess[1]);
    }
  }
}

// -- Données générées -----------------------------------------------------------------------
const { skills: puzzleSkills, positions } = await loadPuzzles();
for (const s of SKILLS.filter((x) => x.source === 'puzzle')) {
  const bands = puzzleSkills[s.id];
  check(`puzzles ${s.id}`, bands[0].length >= 40 && bands[1].length >= 40);
  const avg = (b) => b.reduce((n, p) => n + p.rating, 0) / b.length;
  check(`${s.id} : la bande haute est plus difficile`, avg(bands[1]) > avg(bands[0]));
  const sample = bands[0][0];
  const g = new Chess(sample.fen);
  for (const m of sample.moves.split(' ')) g.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
  passes += 1;
}
const endgames = await loadEndgames();
for (const k of ['gardien', 'mur']) {
  endgames[k].forEach((tier, i) => check(`${k} palier ${i}`, tier.length >= 3, String(tier.length)));
}
BOSSES.filter((b) => b.goal === 'mate').forEach((boss) => {
  endgames[boss.id].forEach((tier, i) => tier.forEach((p) => {
    check(`${boss.id} faisable`, p.dtm <= boss.maxMoves, `${p.dtm}`);
    new Chess(p.fen);
    // Le palier le plus dur doit rester faisable avec sa marge réduite.
    check(`${boss.id} limite ≥ optimum`, Math.min(boss.maxMoves, p.dtm + boss.slack[i]) >= p.dtm);
  }));
});
check('Opposition : positions', endgames.opposition.win.length >= 5 && endgames.opposition.draw.length >= 5);
for (const key of ['lucena', 'philidor']) {
  eq(`${key} : 3 paliers`, endgames[key].length, 3);
  endgames[key].forEach((tier, i) => check(`${key} palier ${i}`, tier.length >= 3, String(tier.length)));
}
endgames.lucena.flat().forEach((p) => check('Lucena : le pont est nécessaire', p.toPromotion >= 5, String(p.toPromotion)));
const avgOf = (list, f) => list.reduce((n, p) => n + f(p), 0) / list.length;
check('Lucena : le palier 3 est plus long', avgOf(endgames.lucena[2], (p) => p.toPromotion) > avgOf(endgames.lucena[0], (p) => p.toPromotion));
eq('rangée du pion', pawnRank('8/8/8/8/4P3/8/8/4K2k w - - 0 1'), 4);
check('Opposition : assez de vraies finales à jouer',
  endgames.opposition.win.filter((p) => pawnRank(p.fen) <= MAX_FIGHT_PAWN_RANK).length >= 10);
check('Carré : positions', endgames.carre.length >= 16, String(endgames.carre.length));
check('Carré : deux réponses possibles', endgames.carre.some((c) => c.caught) && endgames.carre.some((c) => !c.caught));

// Les séances peuvent toujours être construites, à toutes les difficultés.
for (const s of SKILLS.filter((x) => !x.boss)) {
  for (const band of [0, 1]) {
    const session = await buildSession(s, band, {}, 8);
    check(`séance ${s.id} bande ${band}`, session.length >= 5, String(session.length));
    const ids = new Set(session.map((i) => i.id));
    eq(`séance ${s.id} : pas de doublon`, ids.size, session.length);
  }
}
// Les exercices générés ont une réponse vérifiable.
for (const skill of Object.keys(GENERATORS)) {
  for (const fen of positions.slice(0, 40)) {
    const item = GENERATORS[skill](fen);
    if (!item) continue;
    if (item.kind === 'pick') check(`${skill} : réponse`, item.answers.length > 0);
    else eq(`${skill} : une seule bonne réponse`, item.choices.filter((c) => c.correct).length, 1);
  }
}

// -- Leçons de boss vérifiées par les tables de finales --------------------------------------
for (const boss of BOSSES) {
  check(`${boss.id} : 3-4 positions guidées`, boss.lesson.length >= 3 && boss.lesson.length <= 4);
  for (const step of boss.lesson) {
    const game = new Chess(step.fen);
    const info = await probe(step.fen);
    const start = positionOutcome(info);
    for (const uci of step.accept) {
      try {
        game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
        game.undo();
      } catch {
        check(`${boss.id} : ${uci} illégal`, false, step.fen);
        continue;
      }
      const result = moveOutcome(info, uci);
      check(`${boss.id} ${step.fen} ${uci} conserve le résultat`, result === start, `${start} → ${result}`);
    }
  }
}
// Sens de l'arbitrage : perdre le gain, c'est bien ce que signale moveOutcome.
{
  const info = await probe('7k/4Q3/8/8/8/8/8/6K1 w - - 0 1');
  eq('Qf7 fait pat : détecté', moveOutcome(info, 'e7f7'), 'draw');
  eq('coup gagnant : détecté', moveOutcome(info, 'g1f2'), 'win');
  eq('position gagnante', positionOutcome(info), 'win');
}
{
  const philidor = endgames.philidor[0][0];
  const info = await probe(philidor.fen);
  eq('Philidor : position de nulle', positionOutcome(info), 'draw');
  check('Philidor : certains coups perdent', info.moves.some((m) => moveOutcome(info, m.uci) === 'loss'));
}

// -- Élo estimé ------------------------------------------------------------------------------
{
  const s = emptyState();
  eq('Élo : aucune estimation sans données', estimateElo(s).rating, null);
  for (let i = 0; i < 4; i += 1) recordRatedExercise(s, 1200, true);
  eq('Élo : pas d’estimation avant 5 exercices', estimateElo(s).rating, null);
  recordRatedExercise(s, 1200, true);
  check('Élo : réussir fait monter', estimateElo(s).rating > START_RATING);
  check('Élo : marqué comme approximatif', !estimateElo(s).reliable);

  const low = emptyState();
  for (let i = 0; i < 10; i += 1) recordRatedExercise(low, 1200, false);
  check('Élo : échouer fait baisser', estimateElo(low).rating < START_RATING);

  const farm = emptyState();
  for (let i = 0; i < 300; i += 1) recordRatedExercise(farm, 600, true);
  check('Élo : les exercices faciles ne font pas monter sans fin', estimateElo(farm).rating < 1600, String(estimateElo(farm).rating));

  const hard = emptyState();
  for (let i = 0; i < 30; i += 1) recordRatedExercise(hard, 1900, true);
  check('Élo : réussir du difficile compte davantage', estimateElo(hard).rating > estimateElo(farm).rating);

  const real = emptyState();
  real.games = [{ date: '2026-01-01', rating: 900 }, { date: '2026-03-01', rating: 1500 }];
  eq('Élo : parties réelles seules', estimateElo(real).rating, 1200);
  check('Élo : parties réelles fiables', estimateElo(real).reliable);
  for (let i = 0; i < 40; i += 1) recordRatedExercise(real, 2500, true);
  check('Élo : les parties pèsent le plus', Math.abs(estimateElo(real).rating - 1200) < Math.abs(real.elo.rating - 1200) / 2);
}

// -- Plan d'entraînement -----------------------------------------------------------------------
{
  const err = (skill, san = 'a3') => ({ skill, san, moveNumber: 12, fen: new Chess().fen(), best: 'e2e4' });
  const game = (id, date, errors, rating = 1200) => ({ id, date, errors, rating, timeClass: 'rapid', myMoves: 30 });
  const today = '2026-03-30';
  const planned = emptyState();
  planned.games = [
    game('a', '2026-03-20', [err('clouage')]),
    game('b', '2026-03-21', [err('fourchette'), err('fourchette'), err('fourchette')]),
    game('c', '2026-03-22', [err('clouage'), err(null)]),
    game('d', '2026-03-23', [err('lucena')]),
    game('e', '2026-03-24', [err('enfilade')]),
    game('vieux', '2025-01-01', [err('mat-en-1'), err('mat-en-1')]),
  ];
  const plan = buildPlan(planned, SKILLS, today);
  eq('plan : le récurrent d’abord, pas le plus gros volume', plan.map((p) => p.id)[0], 'clouage');
  eq('plan : limité à 3', plan.length, 3);
  check('plan : récurrence annoncée', plan[0].recurring && plan[0].gameCount === 2);
  check('plan : une seule partie reste à confirmer', !plan[1].recurring);
  check('plan : ignore les vieilles parties', !plan.some((p) => p.id === 'mat-en-1'));
  check('plan : ignore les erreurs sans compétence', plan.every((p) => p.def));
  eq('plan : à égalité, le plus fondamental', plan[2].id, 'enfilade');

  // S'entraîner traite les erreurs passées ; une nouvelle erreur revient au plan.
  planned.skills.clouage = { passes: [{ day: '2026-03-25', score: 1, band: 0 }], validatedDay: null, lastPracticed: null, intervalDays: 21, decay: null, realErrors: [] };
  check('plan : l’entraînement traite les erreurs passées', !buildPlan(planned, SKILLS, today).some((p) => p.id === 'clouage'));
  planned.games.push(game('f', '2026-03-28', [err('clouage')]));
  check('plan : une nouvelle erreur y revient', buildPlan(planned, SKILLS, today).some((p) => p.id === 'clouage'));
  eq('plan : vide sans parties', buildPlan(emptyState(), SKILLS, today), []);

  eq('placement : débutant', placementFromElo(900), 0);
  eq('placement : niveau 2', placementFromElo(1000), 2);
  eq('placement : niveau 3', placementFromElo(1500), 3);

  const placed = emptyState();
  const locked = skillById('deviation');
  eq('sans placement : verrouillée', skillStatus(placed, locked, today), 'locked');
  placed.games = [game('x', '2026-03-20', [], 1600)];
  refreshPlacement(placed, SKILLS, today);
  eq('placement : ouverte par l’Élo', skillStatus(placed, locked, today), 'available');
  check('placement : ouvrir n’est pas valider', !placed.skills.deviation?.validatedDay);
  eq('placement : aucun niveau de branche offert', branchLevel(placed, SKILLS, today), 0);
  placed.games = [game('x', '2026-03-20', [], 800)];
  refreshPlacement(placed, SKILLS, today);
  eq('placement : ne se referme pas', skillStatus(placed, locked, today), 'available');

  const weak = emptyState();
  weak.games = [game('y', '2026-03-20', [err('lucena')], 700)];
  eq('placement bas : verrouillée avant le plan', skillStatus(weak, skillById('lucena'), today), 'locked');
  refreshPlacement(weak, SKILLS, today);
  eq('plan : ouvre la compétence recommandée', skillStatus(weak, skillById('lucena'), today), 'available');
  eq('plan : le reste suit l’arbre', skillStatus(weak, skillById('philidor'), today), 'locked');
  eq('lien vers le boss', trainingHref(skillById('lucena')), '#/boss/lucena');
  eq('lien vers la séance', trainingHref(skillById('fourchette')), '#/seance/fourchette');
}

// -- Carte des compétences -------------------------------------------------------------------
{
  const pos = Object.values(layoutSkills());
  eq('carte : toutes les compétences placées', pos.length, SKILLS.length);
  check('carte : tout tient dans le cadre', pos.every((p) => p.x - p.r >= 0 && p.x + p.r <= 1200 && p.y - p.r >= 0));
  const overlap = pos.some((a, i) => pos.slice(i + 1).some((b) => Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r));
  check('carte : aucun nœud ne se chevauche', !overlap);
}

// -- Qualité de la détection, mesurée sur des références externes ----------------------------
// Seuils volontairement sous les mesures : ils bloquent une régression, pas une variation.
{
  const motifs = await (await fetch('fixtures/motifs.json')).json();
  const THEMES = { fork: ['fourchette', 0.9, 0.75], skewer: ['enfilade', 0.85, 0.75], pin: ['clouage', 0.35, 0.75], hangingPiece: ['pieces-en-prise', 0.6, 0.8], mateIn1: ['mat-en-1', 0.95, 0.95] };
  const predictions = motifs.map((item) => {
    const moves = item.moves.split(' ');
    const g = new Chess(item.fen);
    g.move({ from: moves[0].slice(0, 2), to: moves[0].slice(2, 4), promotion: moves[0][4] });
    return motifOfLine(g.fen(), moves.slice(1));
  });
  for (const [theme, [skill, minRecall, minPrecision]] of Object.entries(THEMES)) {
    const labelled = motifs.filter((m) => m.themes.includes(theme));
    const hits = motifs.filter((m, i) => m.themes.includes(theme) && predictions[i] === skill).length;
    const predicted = predictions.filter((p) => p === skill).length;
    check(`motif ${skill} : rappel`, hits / labelled.length >= minRecall, (hits / labelled.length).toFixed(2));
    check(`motif ${skill} : précision`, hits / predicted >= minPrecision, (hits / predicted).toFixed(2));
  }

  const judged = await (await fetch('fixtures/judged_games.json')).json();
  const scores = await (await fetch('fixtures/judged_scores.json')).json();
  let flagged = 0;
  let right = 0;
  let foundBlunders = 0;
  let blunders = 0;
  judged.forEach((game, g) => {
    game.moves.forEach((_, ply) => {
      const label = game.labels[ply];
      if (label === '??') blunders += 1;
      if (isErrorMove(scores[g].scores[ply], -scores[g].scores[ply + 1])) {
        flagged += 1;
        if (label) right += 1;
        if (label === '??') foundBlunders += 1;
      }
    });
  });
  check('erreurs : au moins 85 % des signalements sont justes', right / flagged >= 0.85, (right / flagged).toFixed(2));
  check('erreurs : au moins 65 % des gaffes sont trouvées', foundBlunders / blunders >= 0.65, (foundBlunders / blunders).toFixed(2));
  check('chances de gain : symétriques', Math.abs(winChance(300) + winChance(-300) - 100) < 1e-9);
  check('perdre un pion à égalité est une erreur', isErrorMove(0, -200));
  check('perdre un pion en partie gagnée n’en est pas une', !isErrorMove(1500, 1300));
}

// -- Moteur ---------------------------------------------------------------------------------
{
  const mate = await analyse('6k1/5ppp/8/8/8/8/5PPP/3Q2K1 w - - 0 1', 8);
  eq('Stockfish trouve le mat', mate.best, 'd1d8');
  check('Stockfish note le mat', mate.score > 90000, String(mate.score));

  // Non-régression : une ligne de théorie saine ne doit pas être remplie de fausses erreurs.
  const line = '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Na5 6. Bb5+ c6 7. dxc6 bxc6 8. Be2 h6 *';
  const sound = await analyseGame(parseGame(line), 'w', '2026-01-01');
  eq('analyse : pas de fausse erreur sur une ligne de théorie', sound.errors.map((e) => e.san), []);
  // Et une vraie gaffe reste détectée.
  const blunder = await analyseGame(parseGame('1. e4 e5 2. Qh5 Nc6 3. Qxf7+ Kxf7 *'), 'w', '2026-01-01');
  check('analyse : une dame donnée est une erreur', blunder.errors.some((e) => e.san === 'Qxf7+'));
  const legend = await analyseGame(parseGame('1. e4 d6 2. d4 Nf6 3. Nc3 g6 4. Be3 Bg7 5. Qd2 c6 6. f3 b5 7. Nge2 Nbd7 8. Bh6 Bxh6 9. Qxh6 Bb7 10. a3 e5 11. O-O-O Qe7 12. Kb1 a6 13. Nc1 O-O-O 14. Nb3 exd4 15. Rxd4 c5 16. Rd1 Nb6 17. g3 Kb8 18. Na5 Ba8 19. Bh3 d5 20. Qf4+ Ka7 21. Rhe1 d4 22. Nd5 Nbxd5 23. exd5 Qd6 24. Rxd4 *'), 'w', '2026-01-01');
  eq('analyse : le sacrifice de Kasparov n’est pas une erreur', legend.errors.filter((e) => e.san === 'Rxd4').length, 0);
}

out.innerHTML = `<span class="${failures.length ? 'fail' : 'pass'}">${passes} réussis, ${failures.length} échecs</span>\n${failures.map((f) => `ÉCHEC ${f}`).join('\n')}`;
window.__results = { passes, failures };
