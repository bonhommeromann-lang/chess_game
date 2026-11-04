// Carte des compétences : un arbre qui s'illumine à mesure que le joueur progresse.
import { branchLevel, isFlagged, skillData, skillStatus } from '../core/mastery.js';
import { BRANCHES, skillsOfBranch } from '../data/skills.js';
import { esc, STATUS_LABEL } from './ui.js';

const W = 1200;
const H = 860;
const TOP = 105; // haut de la rangée la plus élevée
const ROOT = { x: 600, y: 790 };
const TIER_GAP = 130;
const NODE_GAP = 112;

// Position du nœud de branche ; `side` place son titre du côté extérieur.
const BRANCH_LAYOUT = {
  tactique: { x: 170, y: 620, side: -1, cls: 'c-tactique' },
  finales: { x: 440, y: 560, side: -1, cls: 'c-finales' },
  ouvertures: { x: 760, y: 560, side: 1, cls: 'c-ouvertures' },
  strategie: { x: 1030, y: 620, side: 1, cls: 'c-strategie' },
};

const SHORT = {
  'combinaisons': 'Combinaisons',
  'principes': 'Principes',
  'italienne': 'Italienne',
  'caro-kann': 'Caro-Kann',
  'plans-ouverture': 'Plans d’ouverture',
  'activite': 'Activité',
  'structures': 'Structures',
  'bon-mauvais-fou': 'Bon et mauvais fou',
  'colonnes-ouvertes': 'Colonnes ouvertes',
  'plans-long-terme': 'Plans long terme',
  'pieces-en-prise': 'Pièces en prise',
};

const PIECE = {
  'pieces-en-prise': 'P', 'mat-en-1': 'K', fourchette: 'N', clouage: 'B', enfilade: 'R',
  deviation: 'Q', attraction: 'K', combinaisons: 'Q', 'mat-kq': 'Q', 'mat-kr': 'R',
  opposition: 'K', carre: 'P', lucena: 'R', philidor: 'R', 'finales-fous': 'B', principes: 'P',
  italienne: 'B', 'caro-kann': 'N', 'plans-ouverture': 'Q', activite: 'N', 'cases-faibles': 'P',
  structures: 'P', 'bon-mauvais-fou': 'B', 'colonnes-ouvertes': 'R', 'plans-long-terme': 'K',
};

/** Coordonnées de toutes les compétences. Exporté pour les tests. */
export function layoutSkills() {
  const positions = {};
  for (const branch of BRANCHES) {
    const hub = BRANCH_LAYOUT[branch.id];
    for (const tier of [1, 2, 3]) {
      const row = skillsOfBranch(branch.id).filter((s) => s.tier === tier);
      row.forEach((skill, i) => {
        positions[skill.id] = {
          x: hub.x + (i - (row.length - 1) / 2) * NODE_GAP,
          y: hub.y - TIER_GAP * tier,
          r: skill.boss ? 31 : 26,
        };
      });
    }
  }
  return positions;
}

const curve = (a, b) => {
  const middle = (a.y + b.y) / 2;
  return `M${a.x} ${a.y}C${a.x} ${middle} ${b.x} ${middle} ${b.x} ${b.y}`;
};

function wrapLabel(text, width = 14) {
  const lines = [];
  for (const word of text.split(' ')) {
    const last = lines[lines.length - 1];
    if (last !== undefined && `${last} ${word}`.length <= width) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

const pieceUrl = (color, piece) => new URL(`../../vendor/pieces/${color}${piece}.svg`, import.meta.url).href;

function drawNode(state, skill, pos, today, cls, recommended) {
  const status = skillStatus(state, skill, today);
  const data = skillData(state, skill.id);
  const size = pos.r * 1.25;
  const filled = status === 'validated' || status === 'decayed';
  const name = SHORT[skill.id] ?? skill.name;
  const badges = [];
  if (status === 'progress') {
    badges.push(`<g class="map-count"><rect x="${pos.x - 17}" y="${pos.y + pos.r - 9}" width="34" height="18" rx="9"/><text x="${pos.x}" y="${pos.y + pos.r + 4}">${data.passes.length}/2</text></g>`);
  }
  if (status === 'decayed') {
    badges.push(`<g class="map-alert"><circle cx="${pos.x + pos.r * 0.75}" cy="${pos.y - pos.r * 0.75}" r="10"/><text x="${pos.x + pos.r * 0.75}" y="${pos.y - pos.r * 0.75 + 5}">!</text></g>`);
  }
  if (status === 'locked') {
    badges.push(`<g class="map-lock" transform="translate(${pos.x - pos.r * 0.95} ${pos.y + pos.r * 0.45})"><circle r="11"/><path d="M-4-1v-2a4 4 0 0 1 8 0v2h1v6H-5V-1zm2 0h4v-2a2 2 0 0 0-4 0z"/></g>`);
  }
  if (status !== 'decayed' && isFlagged(state, skill, today)) {
    badges.push(`<circle class="map-flag" cx="${pos.x + pos.r * 0.75}" cy="${pos.y - pos.r * 0.75}" r="7"/>`);
  }
  const labelY = pos.y + pos.r + (status === 'progress' ? 25 : 18);
  const label = wrapLabel(name).map((line, i) =>
    `<text class="map-label" x="${pos.x}" y="${labelY + i * 15}">${esc(line)}</text>`).join('');
  const flagged = isFlagged(state, skill, today) ? ', signalée par tes parties' : '';
  return `<a class="map-node ${status} ${cls}" href="#/competence/${skill.id}" data-skill="${skill.id}"
      aria-label="${esc(skill.name)}, ${STATUS_LABEL[status]}${skill.boss ? ', boss' : ''}${flagged}${recommended.has(skill.id) ? ', recommandée' : ''}">
    ${recommended.has(skill.id) ? `<circle class="map-reco" cx="${pos.x}" cy="${pos.y}" r="${pos.r + 8}"/>` : ''}
    <circle class="map-disc" cx="${pos.x}" cy="${pos.y}" r="${pos.r}"/>
    <image href="${pieceUrl(filled ? 'b' : 'w', PIECE[skill.id])}" x="${pos.x - size / 2}" y="${pos.y - size / 2}" width="${size}" height="${size}" class="map-piece"/>
    ${badges.join('')}${label}
  </a>`;
}

/** SVG complet. `elo` vient de estimateElo. */
export function skillMap(state, today, elo, recommended = new Set()) {
  const positions = layoutSkills();
  const paths = [];
  const nodes = [];
  const hubs = [];

  for (const branch of BRANCHES) {
    const hub = BRANCH_LAYOUT[branch.id];
    const skills = skillsOfBranch(branch.id);
    const score = branchLevel(state, skills, today);

    // La branche maîtresse s'épaissit avec le niveau : le profil se lit d'un coup d'œil.
    const thickness = score > 0 ? 4 + (score / 100) * 6 : 2.5;
    paths.push(`<path class="map-trunk ${score > 0 ? 'lit' : ''} ${hub.cls}" stroke-width="${thickness}" d="M${ROOT.x} ${ROOT.y}C${ROOT.x} ${ROOT.y - 120} ${hub.x} ${hub.y + 170} ${hub.x} ${hub.y}"/>`);

    for (const skill of skills) {
      const to = positions[skill.id];
      const sources = skill.requires.length
        ? skill.requires.map((id) => ({ pos: positions[id], open: Boolean(skillData(state, id).validatedDay) }))
        : [{ pos: hub, open: true }];
      for (const { pos, open } of sources) {
        const reached = open && skillStatus(state, skill, today) !== 'locked';
        const started = reached && (skill.requires.length > 0 || skillData(state, skill.id).passes.length > 0 || skillData(state, skill.id).validatedDay);
        paths.push(`<path class="map-edge ${started ? 'lit' : ''} ${hub.cls}" d="${curve(pos, to)}"/>`);
      }
      nodes.push(drawNode(state, skill, to, today, hub.cls, recommended));
    }

    const textX = hub.x + hub.side * 48;
    const anchor = hub.side < 0 ? 'end' : 'start';
    hubs.push(`<g class="map-hub ${hub.cls}">
      <circle cx="${hub.x}" cy="${hub.y}" r="34"/>
      <text class="map-hub-score" x="${hub.x}" y="${hub.y + 9}">${score}</text>
      <text class="map-hub-name" x="${textX}" y="${hub.y + 4}" style="text-anchor:${anchor}">${esc(branch.name.toUpperCase())}</text>
      <text class="map-hub-sub" x="${textX}" y="${hub.y + 22}" style="text-anchor:${anchor}">sur 100</text>
    </g>`);
  }

  return `<svg class="skill-map" viewBox="0 ${TOP} ${W} ${H - TOP}" role="group" aria-label="Carte de tes compétences">
    ${paths.join('')}
    ${hubs.join('')}
    ${nodes.join('')}
    <g class="map-root">
      <circle cx="${ROOT.x}" cy="${ROOT.y}" r="56"/>
      <text class="map-root-value" x="${ROOT.x}" y="${ROOT.y + 2}">${elo.rating ?? '?'}</text>
      <text class="map-root-label" x="${ROOT.x}" y="${ROOT.y + 24}">${esc(elo.title)}</text>
    </g>
  </svg>`;
}

