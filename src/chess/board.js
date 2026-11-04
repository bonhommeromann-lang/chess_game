// Échiquier interactif : clic-clic, glisser-déposer, clavier, promotion et marquages.
import { Chess } from '../../vendor/chess.js';

const FILES = 'abcdefgh';
const PIECE_NAMES = { p: 'pion', n: 'cavalier', b: 'fou', r: 'tour', q: 'dame', k: 'roi' };
const pieceUrl = (color, type) =>
  new URL(`../../vendor/pieces/${color}${type.toUpperCase()}.svg`, import.meta.url).href;

export class Board {
  /**
   * options : fen, orientation, movable, onMove(uci, move), onPick(square)
   * onMove reçoit un coup déjà jugé légal ; c'est l'appelant qui décide de l'appliquer.
   */
  constructor(host, options = {}) {
    this.host = host;
    this.orientation = options.orientation ?? 'white';
    this.movable = options.movable ?? false;
    this.onMove = options.onMove ?? null;
    this.onPick = options.onPick ?? null;
    this.selected = null;
    this.marks = {};
    this.arrows = [];
    this.lastMove = null;
    this.game = new Chess();
    this.root = document.createElement('div');
    this.root.className = 'board';
    this.root.setAttribute('role', 'grid');
    this.root.setAttribute('aria-label', 'Échiquier');
    host.replaceChildren(this.root);
    this.root.addEventListener('pointerdown', (e) => this.pointerDown(e));
    this.setFen(options.fen ?? new Chess().fen());
  }

  setFen(fen, lastMove = null) {
    this.game.load(fen, { skipValidation: true });
    this.lastMove = lastMove;
    this.selected = null;
    this.render();
  }

  setMovable(value) {
    this.movable = value;
    this.selected = null;
    this.render();
  }

  setOrientation(value) {
    this.orientation = value;
    this.render();
  }

  setMarks(marks = {}, arrows = []) {
    this.marks = marks;
    this.arrows = arrows;
    this.render();
  }

  squares() {
    const ranks = [8, 7, 6, 5, 4, 3, 2, 1];
    const files = [...FILES];
    if (this.orientation === 'black') {
      ranks.reverse();
      files.reverse();
    }
    return ranks.flatMap((r) => files.map((f) => `${f}${r}`));
  }

  targets(square) {
    return this.game.moves({ square, verbose: true }).map((m) => m.to);
  }

  render() {
    const targets = this.selected ? this.targets(this.selected) : [];
    this.root.replaceChildren();
    this.root.dataset.movable = String(this.movable);
    for (const sq of this.squares()) {
      const fileIndex = FILES.indexOf(sq[0]);
      const rank = Number(sq[1]);
      const isLight = (fileIndex + rank) % 2 === 0;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `sq ${isLight ? 'light' : 'dark'}`;
      button.dataset.square = sq;
      const piece = this.game.get(sq);
      button.setAttribute('aria-label', piece
        ? `${sq}, ${PIECE_NAMES[piece.type]} ${piece.color === 'w' ? 'blanc' : 'noir'}`
        : sq);
      if (this.lastMove?.includes(sq)) button.classList.add('last');
      if (this.selected === sq) button.classList.add('selected');
      if (targets.includes(sq)) button.classList.add(piece ? 'target-capture' : 'target');
      if (this.marks[sq]) button.classList.add(`mark-${this.marks[sq]}`);
      if (piece) {
        const img = document.createElement('img');
        img.src = pieceUrl(piece.color, piece.type);
        img.alt = '';
        img.draggable = false;
        img.className = 'piece';
        button.append(img);
      }
      const bottomRank = this.orientation === 'white' ? 1 : 8;
      const leftFile = this.orientation === 'white' ? 'a' : 'h';
      if (rank === bottomRank) {
        button.insertAdjacentHTML('beforeend', `<span class="coord file">${sq[0]}</span>`);
      }
      if (sq[0] === leftFile) {
        button.insertAdjacentHTML('beforeend', `<span class="coord rank">${rank}</span>`);
      }
      button.addEventListener('click', () => this.squareClicked(sq));
      this.root.append(button);
    }
    if (this.arrows.length) this.root.append(this.arrowLayer());
  }

  arrowLayer() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 8 8');
    svg.setAttribute('class', 'arrows');
    svg.setAttribute('aria-hidden', 'true');
    const pos = (sq) => {
      const f = FILES.indexOf(sq[0]);
      const r = Number(sq[1]) - 1;
      return this.orientation === 'white'
        ? { x: f + 0.5, y: 7 - r + 0.5 }
        : { x: 7 - f + 0.5, y: r + 0.5 };
    };
    for (const [from, to] of this.arrows) {
      const a = pos(from);
      const b = pos(to);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      const tip = { x: b.x - ux * 0.12, y: b.y - uy * 0.12 };
      const base = { x: tip.x - ux * 0.36, y: tip.y - uy * 0.36 };
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', a.x + ux * 0.3);
      line.setAttribute('y1', a.y + uy * 0.3);
      line.setAttribute('x2', base.x);
      line.setAttribute('y2', base.y);
      const head = document.createElementNS(ns, 'polygon');
      head.setAttribute('points', [
        `${tip.x},${tip.y}`,
        `${base.x - uy * 0.24},${base.y + ux * 0.24}`,
        `${base.x + uy * 0.24},${base.y - ux * 0.24}`,
      ].join(' '));
      svg.append(line, head);
    }
    return svg;
  }

  squareClicked(sq) {
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    if (this.onPick) {
      this.onPick(sq);
      return;
    }
    if (!this.movable) return;
    if (this.selected && this.targets(this.selected).includes(sq)) {
      this.tryMove(this.selected, sq);
      return;
    }
    const piece = this.game.get(sq);
    this.selected = piece?.color === this.game.turn() && this.selected !== sq ? sq : null;
    this.render();
  }

  tryMove(from, to) {
    const options = this.game.moves({ square: from, verbose: true }).filter((m) => m.to === to);
    if (!options.length) return;
    const finish = (promotion) => {
      const move = options.find((m) => !promotion || m.promotion === promotion);
      this.selected = null;
      this.onMove?.(`${from}${to}${promotion ?? ''}`, move);
    };
    if (options[0].promotion) this.askPromotion(this.game.turn(), finish);
    else finish();
  }

  askPromotion(color, done) {
    const overlay = document.createElement('div');
    overlay.className = 'promotion';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Choisir la pièce de promotion');
    for (const type of ['q', 'r', 'b', 'n']) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.promotion = type;
      b.setAttribute('aria-label', PIECE_NAMES[type]);
      b.innerHTML = `<img src="${pieceUrl(color, type)}" alt="">`;
      b.addEventListener('click', () => {
        overlay.remove();
        done(type);
      });
      overlay.append(b);
    }
    this.root.append(overlay);
    overlay.querySelector('button').focus();
  }

  // Glisser-déposer : le clic simple reste géré par squareClicked.
  pointerDown(event) {
    if (!this.movable || this.onPick) return;
    const button = event.target.closest('.sq');
    const img = button?.querySelector('.piece');
    if (!img) return;
    const from = button.dataset.square;
    if (this.game.get(from)?.color !== this.game.turn()) return;
    const start = { x: event.clientX, y: event.clientY };
    let ghost = null;

    const move = (e) => {
      if (!ghost && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;
      if (!ghost) {
        ghost = img.cloneNode();
        ghost.className = 'piece ghost';
        ghost.style.width = `${button.offsetWidth}px`;
        ghost.style.height = `${button.offsetWidth}px`;
        document.body.append(ghost);
        img.style.opacity = '0.25';
        this.selected = from;
      }
      ghost.style.left = `${e.clientX}px`;
      ghost.style.top = `${e.clientY}px`;
    };

    const up = (e) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!ghost) return;
      ghost.remove();
      this.suppressClick = true;
      setTimeout(() => { this.suppressClick = false; }, 0);
      const below = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.sq');
      this.selected = null;
      if (below && below.dataset.square !== from && this.targets(from).includes(below.dataset.square)) {
        this.tryMove(from, below.dataset.square);
      } else {
        this.render();
      }
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }
}

/** Convertit un coup UCI en objet accepté par chess.js. */
export const uciToMove = (uci) => ({
  from: uci.slice(0, 2),
  to: uci.slice(2, 4),
  promotion: uci[4],
});
