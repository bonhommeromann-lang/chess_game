// Dates manipulées sous forme de « clé de jour » locale (AAAA-MM-JJ).
const pad = (n) => String(n).padStart(2, '0');

export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const toUtc = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

export const daysBetween = (a, b) => Math.round((toUtc(b) - toUtc(a)) / 86400000);

export const addDays = (key, n) => {
  const d = new Date(toUtc(key) + n * 86400000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

export const monthKey = (key) => key.slice(0, 7);

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
  'septembre', 'octobre', 'novembre', 'décembre'];

export const monthLabel = (m) => {
  const [y, mm] = m.split('-').map(Number);
  return `${MONTHS[mm - 1]} ${y}`;
};

export const formatDay = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
