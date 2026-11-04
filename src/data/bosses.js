// Boss de finales. Les positions de combat viennent de data/endgames.json (validées par table
// de finales). Les leçons ci-dessous sont vérifiées par la suite de tests.
//
// goal : 'mate' mater, 'promote' promouvoir en conservant le gain, 'hold' tenir la nulle.
// slack : coups accordés au-delà du nombre optimal, par palier (0 = premier combat).

export const BOSSES = [
  {
    id: 'gardien', name: 'Le Gardien', skill: 'mat-kq', material: 'Roi + dame contre roi',
    tagline: 'Mater en moins de 10 coups.',
    goal: 'mate', side: 'w', maxMoves: 9, slack: [3, 2, 1],
    lesson: [
      { fen: '8/8/8/4k3/8/1Q6/8/4K3 w - - 0 1', accept: ['b3d3'],
        prompt: 'Place la dame à un saut de cavalier du roi : elle lui prend beaucoup de cases sans donner échec.',
        then: 'La dame réduit la boîte du roi noir. Répéter ce geste le pousse vers le bord.' },
      { fen: '7k/4Q3/8/8/8/8/8/6K1 w - - 0 1', accept: ['g1f2', 'g1g2', 'g1h2', 'g1f1', 'g1h1'],
        prompt: 'Attention au pat : Qf7 ne laisserait aucun coup aux noirs. Amène plutôt ton roi.',
        then: 'Quand le roi adverse est au bord, la dame attend et c’est ton roi qui avance.' },
      { fen: '6k1/4Q3/8/6K1/8/8/8/8 w - - 0 1', accept: ['g5g6', 'g5f6', 'g5h6'],
        prompt: 'Rapproche ton roi : il doit venir soutenir la dame.',
        then: 'Le roi est en place. La dame va pouvoir donner mat, protégée ou sur la dernière rangée.' },
      { fen: '7k/5Q2/5K2/8/8/8/8/8 w - - 0 1', accept: ['f7g7', 'f7f8', 'f7e8'],
        prompt: 'Donne mat. Il y a plusieurs façons.',
        then: 'Mat ! Dame et roi coopèrent : le roi garde les cases de fuite.' },
    ],
  },
  {
    id: 'mur', name: 'Le Mur', skill: 'mat-kr', material: 'Roi + tour contre roi',
    tagline: 'Mater en moins de 16 coups.',
    goal: 'mate', side: 'w', maxMoves: 15, slack: [3, 2, 1],
    lesson: [
      { fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1', accept: ['a1a4'],
        prompt: 'Coupe le roi noir : la tour forme un mur sur une rangée qu’il ne peut plus franchir.',
        then: 'Le roi noir est enfermé au-dessus de la 4e rangée. Le mur ne bouge plus sans raison.' },
      { fen: '8/8/4k3/R7/8/4K3/8/8 w - - 0 1', accept: ['e3e4'],
        prompt: 'Mets ton roi face au roi noir, à une case de distance : c’est l’opposition.',
        then: 'Le roi noir doit céder du terrain : le prochain échec de la tour le fera reculer.' },
      { fen: '3k4/7R/4K3/8/8/8/8/8 w - - 0 1', accept: ['h7g7', 'h7a7'],
        prompt: 'Le roi noir doit bouger, mais toi aussi. Fais un coup d’attente avec la tour, en restant sur la 7e rangée.',
        then: 'Sur …Ke8 la tour donne mat. Un temps d’attente force le roi à choisir une mauvaise case.' },
      { fen: '4k3/8/4K3/8/8/8/8/R7 w - - 0 1', accept: ['a1a8'],
        prompt: 'Les rois sont en opposition. Donne mat.',
        then: 'Mat : la tour contrôle la rangée, ton roi garde les cases de sortie.' },
    ],
  },
  {
    id: 'opposition', name: 'L’Opposition', skill: 'opposition', material: 'Roi + pion contre roi',
    tagline: 'Dire si c’est gagnant, puis le prouver.',
    goal: 'promote', side: 'w', judge: [2, 3, 3], slack: [6, 3, 1],
    lesson: [
      { fen: '4k3/8/8/4K3/4P3/8/8/8 w - - 0 1', accept: ['e5e6'],
        prompt: 'Prends l’opposition : place ton roi face au roi noir, devant ton pion.',
        then: 'Les noirs doivent céder la case. Le roi blanc devant le pion est décisif.' },
      { fen: '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1', accept: ['e6d6', 'e6f6'],
        prompt: 'Ton roi est en 6e rangée, devant le pion : c’est gagné, quel que soit le trait. Écarte-le pour laisser passer le pion.',
        then: 'Roi en 6e devant son pion : le gain est toujours là, même sans l’opposition.' },
      { fen: '5k2/3K4/4P3/8/8/8/8/8 w - - 0 1', accept: ['e6e7'],
        prompt: 'Ton roi contrôle la case de promotion. Pousse le pion.',
        then: 'Avec le roi à côté de la case de promotion, plus rien n’arrête le pion.' },
      { fen: '4k3/8/4P3/4K3/8/8/8/8 b - - 0 1', accept: ['e8e7'],
        prompt: 'Côté noir : quand le pion est devant son roi, prends l’opposition.',
        then: 'C’est nulle : le pion devant son roi ne peut pas forcer le passage si tu gardes l’opposition.' },
    ],
  },
  {
    id: 'lucena', name: 'Lucena', skill: 'lucena', material: 'Tour + pion contre tour',
    tagline: 'Construire le pont pour promouvoir.',
    goal: 'promote', side: 'w', slack: [8, 5, 3],
    lesson: [
      { fen: '6K1/4k1P1/8/8/8/8/7r/5R2 w - - 0 1', accept: ['f1f4'],
        prompt: 'Première étape du pont : place ta tour sur la 4e rangée.',
        then: 'Cette tour viendra plus tard couper les échecs en s’interposant.' },
      { fen: '6K1/4k1P1/8/8/5R2/8/8/7r w - - 0 1', accept: ['f4e4'],
        prompt: 'Éloigne le roi noir d’une colonne en donnant échec.',
        then: 'Le roi noir ne peut plus revenir aider : ton roi va pouvoir sortir.' },
      { fen: '6K1/3k2P1/8/8/4R3/8/8/7r w - - 0 1', accept: ['g8f7'],
        prompt: 'Sors ton roi de devant le pion.',
        then: 'Les noirs vont donner une série d’échecs : le roi avance pour les arrêter.' },
      { fen: '8/3k2P1/8/6K1/4R3/8/8/6r1 w - - 0 1', accept: ['e4g4'],
        prompt: 'Termine le pont : interpose ta tour pour couper les échecs.',
        then: 'Le pont est construit : le pion va promouvoir.' },
    ],
  },
  {
    id: 'philidor', name: 'Philidor', skill: 'philidor', material: 'Tour contre tour + pion',
    tagline: 'Tenir la nulle contre le moteur.',
    goal: 'hold', side: 'b', holdMoves: [10, 14, 18],
    lesson: [
      { fen: '4k3/R7/8/3KP3/8/8/8/1r6 b - - 0 1', accept: ['b1b6'],
        prompt: 'Place ta tour sur la 6e rangée : le roi blanc ne pourra plus avancer.',
        then: 'Tant que le pion reste en e5, cette barrière interdit la 6e rangée au roi blanc.' },
      { fen: '4k3/R7/1r2P3/3K4/8/8/8/8 b - - 0 1', accept: ['b6b1'],
        prompt: 'Le pion vient en e6 : le roi blanc n’a plus d’abri derrière lui. Va tout au fond avec ta tour.',
        then: 'Ta tour va donner échec par derrière, sans fin.' },
      { fen: '4k3/R7/3KP3/8/8/8/8/1r6 b - - 0 1', accept: ['b1d1'],
        prompt: 'Le roi blanc s’avance. Donne échec par derrière.',
        then: 'Les échecs continuent et le pion ne protège plus le roi : c’est nulle.' },
    ],
  },
];

export const bossById = (id) => BOSSES.find((b) => b.id === id);
