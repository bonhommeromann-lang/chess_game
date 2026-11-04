// Stockfish 10 (WASM) dans un Web Worker. Les analyses sont sérialisées dans une file.
const WORKER_URL = new URL('../../vendor/stockfish/stockfish.wasm.js', import.meta.url);
export const MATE_SCORE = 100000;

let worker = null;
let ready = null;
let queue = Promise.resolve();

function start() {
  if (ready) return ready;
  ready = new Promise((resolve, reject) => {
    try {
      worker = new Worker(WORKER_URL);
    } catch (err) {
      reject(err);
      return;
    }
    const timer = setTimeout(() => reject(new Error('Le moteur ne répond pas.')), 20000);
    worker.onerror = (e) => {
      clearTimeout(timer);
      reject(new Error(e.message || 'Le moteur n’a pas pu démarrer.'));
    };
    worker.onmessage = (e) => {
      if (String(e.data).startsWith('uciok')) {
        worker.postMessage('setoption name Hash value 32');
        worker.postMessage('isready');
      }
      if (String(e.data).startsWith('readyok')) {
        clearTimeout(timer);
        resolve();
      }
    };
    worker.postMessage('uci');
  });
  ready.catch(() => { ready = null; worker = null; });
  return ready;
}

/** Score du point de vue du camp au trait, en centipions (mat = ±MATE_SCORE moins la distance). */
function parseScore(line) {
  const mate = line.match(/score mate (-?\d+)/);
  if (mate) {
    const n = Number(mate[1]);
    return n >= 0 ? MATE_SCORE - n * 100 : -MATE_SCORE - n * 100;
  }
  const cp = line.match(/score cp (-?\d+)/);
  return cp ? Number(cp[1]) : null;
}

function search(fen, depth) {
  return new Promise((resolve, reject) => {
    let result = { score: null, pv: [], best: null };
    const timer = setTimeout(() => reject(new Error('Analyse trop longue.')), 60000);
    worker.onmessage = (e) => {
      const line = String(e.data);
      if (line.startsWith('info') && line.includes(' pv ')) {
        const score = parseScore(line);
        if (score !== null) {
          result = { ...result, score, pv: line.split(' pv ')[1].trim().split(' ') };
        }
      } else if (line.startsWith('bestmove')) {
        clearTimeout(timer);
        const best = line.split(' ')[1];
        resolve({ ...result, best: best === '(none)' ? null : best });
      }
    };
    worker.postMessage('ucinewgame');
    worker.postMessage(`position fen ${fen}`);
    worker.postMessage(`go depth ${depth}`);
  });
}

/** Analyse une position. Résout { score, pv, best } ; rejette si le moteur est indisponible. */
export function analyse(fen, depth = 12) {
  const run = queue.then(async () => {
    await start();
    return search(fen, depth);
  });
  queue = run.catch(() => {});
  return run;
}

/** Convertit un score en texte lisible depuis le point de vue du joueur. */
export function describeScore(score) {
  if (Math.abs(score) >= MATE_SCORE - 10000) {
    const n = Math.ceil((MATE_SCORE - Math.abs(score)) / 100);
    return score > 0 ? `mat en ${n}` : `se fait mater en ${n}`;
  }
  const pawns = (score / 100).toFixed(1).replace('.', ',');
  return `${score > 0 ? '+' : ''}${pawns}`;
}
