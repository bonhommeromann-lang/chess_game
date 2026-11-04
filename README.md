# Chess Up

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

## Installer l'application

Chess Up s'installe comme une application, sur téléphone ou ordinateur, et ses exercices fonctionnent
hors ligne. L'installation exige que l'application soit servie en **HTTPS** : `localhost` convient sur
la machine qui lance le serveur, mais un téléphone a besoin d'une version en ligne (GitHub Pages par
exemple). Avant chaque publication, lancer `python tools/build_sw.py` pour actualiser la version hors
ligne.

- **Android et ordinateur** : bouton « Installer l'application » dans la barre latérale, ou menu du navigateur.
- **iPhone et iPad** : dans Safari, Partager puis « Sur l'écran d'accueil ».

La progression est stockée dans le navigateur. L'onglet **Parties** permet de l'exporter et de la
réimporter.

## Fonctionnalités

| Module | Contenu |
|---|---|
| **Arbre** | 25 compétences, 4 branches, 3 niveaux. Validation : 80 % sur deux sessions, deux jours distincts, la seconde plus difficile. Passe en orange en cas d'oubli, ou d'erreur répétée en partie réelle. |
| **Boss** | Le Gardien, Le Mur, L'Opposition, Lucena, Philidor. Leçon guidée, position aléatoire, 3 vies arbitrées par les tables de finales, revanche plus difficile après 7 jours. |
| **Histoire** | 8 parties célèbres, classées par époque, thème ou joueur. Barème 3/2/1/0 calculé par Stockfish, idée expliquée après chaque coup, annonce du plan. |
| **Compte** | À l'arrivée, le joueur donne son pseudo Chess.com ou Lichess (jamais de mot de passe). Ses 20 dernières parties classées sont analysées en arrière-plan, et la synchro reprend à chaque visite. |
| **Plan** | Les 3 compétences qui reviennent le plus dans les erreurs récentes, avec un exemple tiré des parties. L'Élo ouvre les niveaux adaptés (2 dès 1000, 3 dès 1500) et le plan ouvre ce qu'il recommande. Ouvrir n'est pas valider : seuls les exercices et les boss valident. |
| **Parties** | Analyse par Stockfish, erreurs reliées aux compétences, badges gagnés en conditions réelles. Un PGN peut aussi être collé. |
| **Progrès** | Bilan mensuel, courbe de classement et règle de contrôle (les récompenses se retrouvent-elles dans les parties ?). |
| **Aujourd'hui** | Arbre lumineux qui reflète le niveau, quêtes quotidiennes et série (un jour manqué toléré par semaine). |
| **Élo estimé** | Affiché en haut de chaque page. Combine le classement de la cadence la plus jouée (70 %) et les exercices classés (30 %). Le bullet n'est utilisé qu'à défaut d'autre chose. |

## Réseau

Une fois la page chargée une première fois, tout fonctionne hors ligne sauf :

- **les boss**, qui interrogent `tablebase.lichess.ovh` à chaque coup ;
- **la synchro du compte** Lichess ou Chess.com ;
- la vérification par table des finales à 5 pièces ou moins pendant l'analyse (sans réseau, le
  jugement de Stockfish est conservé).

## Limites connues

- **La détection privilégie la fiabilité** : sur 12 parties annotées par Lichess, les 40 coups signalés
  sont tous de vraies erreurs, mais un tiers des gaffes et la plupart des erreurs moyennes échappent à
  la détection. L'échantillon est petit, et un sacrifice très profond peut encore être mal jugé.
- **Près de la moitié des erreurs n'ont pas de compétence associée** (21 sur 47 sur les parties
  contrôlées) : elles sont listées dans l'onglet Parties, mais n'alimentent pas le plan. Le clouage
  n'est reconnu que dans 40 % des cas.
- **Pas de comparaison avec d'autres joueurs** en fin de partie du mode histoire : il faudrait un
  serveur. Le score est comparé à votre record.
- **La stratégie n'est pas reliée aux parties réelles** : seules les erreurs de tactique, de finale
  et d'ouverture sont détectées automatiquement.
- **La détection des motifs est heuristique** : environ 1 motif sur 5 est mal étiqueté. C'est pourquoi
  il faut voir l'erreur dans deux parties avant qu'une compétence passe en orange.
- **L'Élo est une estimation** : le classement des exercices n'est pas celui d'une partie. Tant
  qu'aucune partie n'est importée, il est précédé de « ≈ » jusqu'à 20 exercices classés.
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
python tests/e2e_sync.py       # écran de bienvenue, synchro, reprise, changement de compte
python tests/e2e_pwa.py        # installation et fonctionnement hors ligne
python tests/eval_motifs.py    # motifs tactiques mesurés sur des puzzles étiquetés
python tests/eval_errors.py    # erreurs comparées aux annotations de l'analyse serveur Lichess
```

Les tests utilisent Edge installé sur la machine, et les deux derniers ont besoin du réseau.
Lichess refuse les navigateurs headless : l'import Lichess n'est donc pas couvert par les parcours
automatisés. Les parties de `e2e_sync.py` sont simulées, avec une vérification finale sur la vraie
API Chess.com.
Pour une exécution manuelle des tests de règles : ouvrir `/tests/` sur le serveur local.

## Régénérer les données

```
python tools/build_puzzles.py     # Python 3.14+ ; lit la base de puzzles en flux
python tools/build_endgames.py    # pip install chess ; valide chaque position par la table
python tools/build_icons.py       # pip install playwright ; icônes PNG depuis assets/logo.svg
python tools/build_sw.py          # liste hors ligne et version de sw.js
```

## Structure

```
src/core/      règles pures : maîtrise, quêtes, dates, sauvegarde
src/chess/     échiquier, moteur, tables de finales, détecteurs
src/data/      compétences, boss, parties, questions
src/views/     écrans (skillmap.js : la carte de l'accueil)
src/analysis.js    analyse des parties réelles
src/sync.js        compte lié et synchro en arrière-plan
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
| Logo | créé pour le projet | — |
| Puzzles | base Lichess | CC0 |
| Coups des parties | archives PGN Mentor | faits de jeu |
| Tables de finales | API publique Lichess | service tiers |

Stockfish et les pièces étant sous GPL, toute redistribution de l'application doit respecter cette
licence. Le dépôt n'a pas encore de licence propre.
