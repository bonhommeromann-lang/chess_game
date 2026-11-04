# Quête d'Échecs

Application web pour progresser aux échecs : arbre de compétences, boss de finales, parties
célèbres à deviner, et analyse de vos vraies parties. La règle de conception : chaque récompense
doit correspondre à un progrès mesurable dans les vraies parties.

## Lancer l'application

Il faut seulement Python 3 et un navigateur récent :

```
python serve.py
```

L'application s'ouvre sur <http://localhost:8000>. Aucune installation ni compilation : ce sont des
fichiers statiques, hébergeables tels quels (GitHub Pages par exemple).

La progression est stockée dans le navigateur. L'onglet **Parties** permet de l'exporter et de la
réimporter.

## Fonctionnalités

| Module | Contenu |
|---|---|
| **Arbre** | 25 compétences, 4 branches, 3 niveaux. Validation : 80 % sur deux sessions, deux jours distincts, la seconde plus difficile. Passe en orange en cas d'oubli, ou d'erreur répétée en partie réelle. |
| **Boss** | Le Gardien, Le Mur, L'Opposition, Lucena, Philidor. Leçon guidée, position aléatoire, 3 vies arbitrées par les tables de finales, revanche plus difficile après 7 jours. |
| **Histoire** | 8 parties célèbres, classées par époque, thème ou joueur. Barème 3/2/1/0 calculé par Stockfish, idée expliquée après chaque coup, annonce du plan. |
| **Parties** | Import Lichess, Chess.com ou PGN. Analyse par Stockfish, erreurs reliées aux compétences, badges gagnés en conditions réelles. |
| **Progrès** | Bilan mensuel, courbe de classement et règle de contrôle (les récompenses se retrouvent-elles dans les parties ?). |
| **Aujourd'hui** | Quêtes quotidiennes et série, avec un jour manqué toléré par semaine. |

## Réseau

Tout fonctionne hors ligne sauf :

- **les boss**, qui interrogent `tablebase.lichess.ovh` à chaque coup ;
- **l'import** depuis Lichess ou Chess.com ;
- la vérification par table des finales à 5 pièces ou moins pendant l'analyse (sans réseau, le
  jugement de Stockfish est conservé).

## Limites connues

- **Pas de comparaison avec d'autres joueurs** en fin de partie du mode histoire : il faudrait un
  serveur. Le score est comparé à votre record.
- **La stratégie n'est pas reliée aux parties réelles** : seules les erreurs de tactique, de finale
  et d'ouverture sont détectées automatiquement.
- **La détection des motifs est heuristique** : une erreur peut être rattachée à la mauvaise
  compétence, ou à aucune. C'est pourquoi il faut la voir dans deux parties avant de passer en orange.
- **Le contenu rédigé est limité** : les questions d'ouverture et de plans sont en nombre fini
  (8 à 10 par compétence) et finissent par se répéter, contrairement aux tactiques.
- **Certains commentaires de parties sont rédigés à la main** : les coups viennent des archives,
  mais les phrases explicatives n'ont pas été relues par un joueur titré.

## Tests

```
pip install playwright chess
python tests/run_tests.py      # règles et validation de tout le contenu
python tests/e2e.py            # parcours complet dans Edge, avec captures
python tests/e2e_boss.py       # chaque boss joué contre la vraie table de finales
```

Les tests utilisent Edge installé sur la machine, et les deux derniers ont besoin du réseau.
Pour une exécution manuelle des tests de règles : ouvrir `/tests/` sur le serveur local.

## Régénérer les données

```
python tools/build_puzzles.py     # Python 3.14+ ; lit la base de puzzles en flux
python tools/build_endgames.py    # pip install chess ; valide chaque position par la table
```

## Structure

```
src/core/      règles pures : maîtrise, quêtes, dates, sauvegarde
src/chess/     échiquier, moteur, tables de finales, détecteurs
src/data/      compétences, boss, parties, questions
src/views/     écrans
src/analysis.js    analyse des parties réelles
src/exercises.js   construction des séances
data/          données générées par tools/
vendor/        dépendances embarquées
```

## Sources et licences

| Élément | Source | Licence |
|---|---|---|
| Moteur | Stockfish 10, paquet `stockfish.js` | **GPL v3** |
| Règles | `chess.js` | BSD-2 |
| Pièces | jeu Cburnett, via Lichess | GPL v2+ |
| Puzzles | base Lichess | CC0 |
| Coups des parties | archives PGN Mentor | faits de jeu |
| Tables de finales | API publique Lichess | service tiers |

Stockfish et les pièces étant sous GPL, toute redistribution de l'application doit respecter cette
licence. Le dépôt n'a pas encore de licence propre.
