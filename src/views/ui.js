// Petits utilitaires d'affichage partagés.
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

export const STATUS_LABEL = {
  locked: 'Verrouillée',
  available: 'Disponible',
  progress: 'En cours',
  validated: 'Validée',
  decayed: 'À réviser',
};

export const DECAY_REASON = {
  oubli: 'Non pratiquée depuis trop longtemps.',
  parties: 'Cette erreur revient dans tes parties réelles.',
  revanche: 'La revanche contre le boss n’a pas été livrée à temps.',
};

export const statusIcon = (status) => ({
  locked: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 7V5a4 4 0 0 1 8 0v2h1v7H3V7zm2 0h4V5a2 2 0 0 0-4 0z"/></svg>',
  available: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5"/></svg>',
  progress: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2a6 6 0 1 0 0 12z"/></svg>',
  validated: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.4 12.6 2.5 8.7l1.6-1.6 2.3 2.3 5.5-5.5 1.6 1.6z"/></svg>',
  decayed: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 15 14H1zM7 6v4h2V6zm0 5v2h2v-2z"/></svg>',
}[status]);

export const hearts = (lives, total = 3) =>
  `<span class="hearts" role="img" aria-label="${lives} vies sur ${total}">${
    Array.from({ length: total }, (_, i) => `<i class="${i < lives ? 'on' : ''}"></i>`).join('')}</span>`;

export const pause = (ms) => new Promise((r) => setTimeout(r, ms));

export const pct = (x) => `${Math.round(x * 100)} %`;
