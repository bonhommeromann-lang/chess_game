// Arbre de compétences : 4 branches, 3 paliers. `source` indique d'où viennent les exercices.
export const BRANCHES = [
  { id: 'tactique', name: 'Tactique', motto: 'Voir ce que l’adversaire a laissé' },
  { id: 'finales', name: 'Finales', motto: 'Transformer un avantage en point' },
  { id: 'ouvertures', name: 'Ouvertures', motto: 'Sortir de l’ouverture avec un plan' },
  { id: 'strategie', name: 'Stratégie', motto: 'Comprendre la position sans calcul' },
];

const skill = (id, branch, tier, name, requires, source, about, extra = {}) =>
  ({ id, branch, tier, name, requires, source, about, ...extra });

export const SKILLS = [
  // Tactique
  skill('pieces-en-prise', 'tactique', 1, 'Pièces en prise', [], 'puzzle',
    'Repérer et capturer une pièce mal protégée.'),
  skill('mat-en-1', 'tactique', 1, 'Mat en 1', [], 'puzzle',
    'Trouver le coup qui donne mat immédiatement.'),
  skill('fourchette', 'tactique', 2, 'Fourchette', ['pieces-en-prise'], 'puzzle',
    'Attaquer deux cibles d’un seul coup.'),
  skill('clouage', 'tactique', 2, 'Clouage', ['pieces-en-prise'], 'puzzle',
    'Immobiliser une pièce devant une cible plus précieuse.'),
  skill('enfilade', 'tactique', 2, 'Enfilade', ['pieces-en-prise'], 'puzzle',
    'Chasser une pièce précieuse pour prendre celle qui est derrière.'),
  skill('deviation', 'tactique', 3, 'Déviation', ['fourchette', 'clouage'], 'puzzle',
    'Détourner un défenseur de sa mission.'),
  skill('attraction', 'tactique', 3, 'Attraction', ['fourchette', 'mat-en-1'], 'puzzle',
    'Attirer une pièce sur une case fatale.'),
  skill('combinaisons', 'tactique', 3, 'Combinaisons en 3+ coups', ['fourchette', 'clouage', 'enfilade'], 'puzzle',
    'Enchaîner plusieurs coups forcés avec sacrifice.'),

  // Finales
  skill('mat-kq', 'finales', 1, 'Mat roi + dame', [], 'boss',
    'Mater le roi seul avec la dame et le roi.', { boss: 'gardien' }),
  skill('mat-kr', 'finales', 1, 'Mat roi + tour', ['mat-kq'], 'boss',
    'Mater le roi seul avec la tour et le roi.', { boss: 'mur' }),
  skill('opposition', 'finales', 2, 'Opposition', ['mat-kr'], 'boss',
    'Gagner ou annuler une finale roi + pion contre roi.', { boss: 'opposition' }),
  skill('carre', 'finales', 2, 'Règle du carré', ['mat-kq'], 'carre',
    'Savoir d’un coup d’œil si le roi rattrape le pion.'),
  skill('lucena', 'finales', 3, 'Lucena', ['opposition', 'mat-kr'], 'boss',
    'Construire le pont pour promouvoir le pion.', { boss: 'lucena' }),
  skill('philidor', 'finales', 3, 'Philidor', ['opposition', 'mat-kr'], 'boss',
    'Tenir la nulle en tour + pion contre tour.', { boss: 'philidor' }),
  skill('finales-fous', 'finales', 3, 'Finales de fous', ['carre'], 'puzzle',
    'Convertir et défendre les finales de fous.'),

  // Ouvertures
  skill('principes', 'ouvertures', 1, 'Principes d’ouverture', [], 'quiz',
    'Centre, développement, roque.'),
  skill('italienne', 'ouvertures', 2, 'Répertoire blanc : Italienne', ['principes'], 'line',
    'Jouer les lignes de base de la partie italienne avec les blancs.'),
  skill('caro-kann', 'ouvertures', 2, 'Défense contre 1.e4 : Caro-Kann', ['principes'], 'line',
    'Jouer les lignes de base de la Caro-Kann avec les noirs.'),
  skill('plans-ouverture', 'ouvertures', 3, 'Plans issus de l’ouverture', ['italienne', 'caro-kann'], 'quiz',
    'Savoir quoi faire une fois la théorie terminée.'),

  // Stratégie
  skill('activite', 'strategie', 1, 'Activité des pièces', [], 'generated',
    'Reconnaître la pièce qui agit le plus sur l’échiquier.'),
  skill('cases-faibles', 'strategie', 1, 'Cases faibles', [], 'generated',
    'Repérer les cases qu’aucun pion ne pourra plus défendre.'),
  skill('structures', 'strategie', 2, 'Structures de pions', ['cases-faibles'], 'generated',
    'Identifier les pions isolés, doublés et passés.'),
  skill('bon-mauvais-fou', 'strategie', 3, 'Bon et mauvais fou', ['activite', 'structures'], 'generated',
    'Juger un fou d’après ses propres pions.'),
  skill('colonnes-ouvertes', 'strategie', 3, 'Colonnes ouvertes', ['activite'], 'generated',
    'Trouver les colonnes où placer les tours.'),
  skill('plans-long-terme', 'strategie', 3, 'Plans à long terme', ['structures', 'colonnes-ouvertes'], 'quiz',
    'Déduire un plan de la structure de pions.'),
];

export const skillById = (id) => SKILLS.find((s) => s.id === id);
export const skillsOfBranch = (branch) => SKILLS.filter((s) => s.branch === branch);
