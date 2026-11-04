// Élo estimé, affiché en haut de chaque page.
import { estimateElo } from '../core/elo.js';
import { loadState } from '../core/store.js';
import { syncStatus } from '../sync.js';
import { esc } from './ui.js';

export function refreshElo() {
  const host = document.querySelector('[data-elo]');
  if (!host) return;
  const elo = estimateElo(loadState());
  host.title = elo.source;
  host.innerHTML = `
    <span class="elo-label">Élo estimé</span>
    <strong class="elo-value">${elo.rating === null ? '—' : `${elo.reliable ? '' : '≈ '}${elo.rating}`}</strong>
    <span class="elo-title">${esc(elo.title)}</span>
    <small class="elo-source">${esc(elo.source)}</small>`;
}

export function refreshSync() {
  const host = document.querySelector('[data-sync]');
  if (!host) return;
  const status = syncStatus();
  host.hidden = !status.running;
  if (status.running) {
    host.innerHTML = `<a href="#/parties"><i class="spinner" aria-hidden="true"></i>Analyse de tes parties${status.total ? ` · ${status.done}/${status.total}` : '…'}</a>`;
  }
}
