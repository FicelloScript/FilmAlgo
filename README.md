# CinéMatch — Moteur de recommandation personnalisé

Ce projet remplace l'algorithme initial de CinéMatch, qui recommandait les 5 films les mieux notés à tout le monde, par un moteur qui tient compte des goûts de chaque utilisateur.

Tout le code de l'algorithme se trouve dans `recommender.js`.

## Lancer le projet

```bash
node server.js       # application sur http://localhost:3000
node --test          # tous les tests (44)
node compare.js      # comparatif avant / après (David et Chloé par défaut)
```

---

## 1. Les critères utilisés

Le score de chaque film non vu repose sur **quatre critères personnels** et **un critère de secours**. Tous sont ramenés sur une échelle commune pour pouvoir être additionnés.

| Critère | Ce qu'il mesure | Échelle | Calcul |
|---|---|---|---|
| **Genre** | Ce que l'utilisateur **dit** aimer | 0 à 1 | genres favoris présents dans le film ÷ nombre de genres favoris |
| **Affinité** | Ce que ses **notes** montrent qu'il aime | −1 à +1 | moyenne, par genre, de ses notes transformées en `(note − 3) / 2` |
| **Collaboratif** | Ce qu'aiment les profils **qui lui ressemblent** | −1 à +1 | moyenne des avis des voisins, pondérée par leur similarité |
| **Qualité** | La note moyenne du film | 0 à 1 | `(rating − 1) / 4` |
| **Popularité** | La popularité du film (**démarrage à froid uniquement**) | 0 à 1 | `popularity / 100` |

### Détail des critères

**Genre.** Si Alice aime *Science-fiction* et *Aventure*, alors *Avatar* (SF, Aventure) vaut 2/2 = **1**, *Gladiator* (Action, Drame, Aventure) vaut 1/2 = **0,5**, et une comédie vaut **0**. Un film qui cumule plusieurs genres favoris est donc valorisé.

**Affinité.** Chaque note de 1 à 5 est convertie entre −1 et +1 : 5 donne +1 (adoré), 3 donne 0 (neutre), 1 donne −1 (détesté). On calcule ensuite la moyenne par genre. Par exemple, David a noté deux romances 2 et 1, donc son affinité *Romance* vaut (−0,5 − 1) / 2 = **−0,75**. L'affinité d'un film candidat est la moyenne des affinités de ses genres déjà notés. Ce critère fonctionne comme un **bonus/malus** : il peut faire baisser un film d'un genre que l'utilisateur n'aime pas, même s'il ne l'a jamais déclaré.

**Collaboratif.** Deux étapes :

1. **Similarité entre deux utilisateurs.** On compare leurs notes sur les films qu'ils ont **tous les deux notés**. Pour chaque film commun, l'accord vaut `1 − |noteA − noteB| / 2` : +1 pour la même note, 0 pour 2 points d'écart, −1 pour 4 points d'écart. La similarité est la moyenne de ces accords, multipliée par un **coefficient de confiance** `min(1, nbFilmsCommuns / 3)`.
2. **Score d'un film.** On garde les **voisins** dont la similarité vaut au moins **0,5**. Le score collaboratif d'un film est la moyenne de leurs avis sur ce film, pondérée par leur similarité.

Cette mesure retrouve les paires de goûts proches indiquées dans les données : Alice ↔ Gaëlle (1,00), Bob ↔ Jules (1,00), Chloé ↔ Inès (0,75).

---

## 2. La formule de score

### Cas général

```
score = 100 × (0,35 × genre + 0,25 × affinité + 0,25 × collaboratif + 0,15 × qualité)
```

Le résultat est un score de pertinence d'environ 0 à 100, propre à chaque utilisateur.

### Critère indisponible : redistribution des poids

Si un critère n'est pas disponible pour un utilisateur (pas de genres favoris, pas de notes, ou aucun voisin), il est retiré et **les poids restants sont ramenés à une somme de 1**.

*Exemple : David n'a aucun voisin assez proche. Sans le collaboratif, ses poids deviennent genre 0,35/0,75 = 0,47, affinité 0,33 et qualité 0,20.*

Le classement de David ne change pas, mais ses scores restent sur la même échelle que ceux des autres utilisateurs, au lieu d'être bloqués à 75 au maximum.

### Démarrage à froid

Quand on ne sait **rien** de l'utilisateur (aucun genre favori, aucune note, donc aucun voisin), comme Nina :

```
score = 100 × (0,5 × qualité + 0,5 × popularité)
```

On lui propose alors des films à la fois connus et bien notés, qui sont des valeurs sûres pour une première visite.

### Tri

Les films sont triés par **score décroissant**. En cas d'égalité, le film d'**identifiant le plus petit** passe en premier :

```js
scored.sort((a, b) => b.score - a.score || a.movie.id - b.movie.id);
```

Le résultat est donc **déterministe** : les mêmes données donnent toujours le même classement.

---

## 3. Le rôle de chaque pondération

| Poids | Valeur | Justification |
|---|---|---|
| Genre | **0,35** | C'est le critère le plus direct : l'utilisateur a dit lui-même ce qu'il aime. Il pèse le plus lourd pour garantir que les recommandations restent dans ses goûts. |
| Affinité | **0,25** | Les notes sont une information plus fine que les genres déclarés : elles révèlent aussi ce qu'il **n'aime pas**. Ce poids suffit à écarter un genre mal noté (David ne reçoit aucune romance). |
| Collaboratif | **0,25** | Permet de **découvrir** des films hors des genres habituels, grâce à des profils similaires (Alice reçoit *Akira* et *Le Seigneur des anneaux*, adorés par Gaëlle). Même poids que l'affinité pour équilibrer « mes goûts » et « les goûts de mes voisins ». |
| Qualité | **0,15** | Sert surtout à **départager** des films aussi pertinents les uns que les autres. Volontairement faible pour que la note moyenne ne soit pas le critère principal. |
| Popularité | **0** (0,5 à froid) | Absente du cas général pour ne pas favoriser systématiquement les blockbusters. Utilisée uniquement quand aucune information personnelle n'existe. |

Paramètres de la similarité :

| Paramètre | Valeur | Rôle |
|---|---|---|
| `MIN_COMMON_FOR_FULL_CONFIDENCE` | **3** | En dessous de 3 films en commun, la similarité est réduite proportionnellement. |
| `MIN_SIMILARITY` | **0,5** | Seuil pour être considéré comme voisin. Avec 1 seul film en commun, la similarité ne peut pas dépasser 0,33 : ce profil n'est donc jamais un voisin. |

---

## 4. Réponses aux questions du sujet

### 4.1 Quels critères utilisez-vous ?

Les genres favoris déclarés, l'affinité par genre calculée à partir des notes personnelles, le score collaboratif fourni par les profils similaires, la note moyenne du film et, uniquement au démarrage à froid, sa popularité (voir partie 1).

### 4.2 Pourquoi avez-vous choisi ces critères ?

Chaque critère apporte une information différente :

- **Genre** : ce que l'utilisateur affirme aimer.
- **Affinité** : ce qu'il aime vraiment, et surtout ce qu'il n'aime pas.
- **Collaboratif** : de la découverte au-delà de ses habitudes.
- **Qualité** : éviter de recommander un mauvais film, même s'il est dans le bon genre.

Ensemble, ils couvrent les exigences B, C et D, et le défi avancé du sujet.

### 4.3 Comment leur attribuez-vous un poids ?

Les critères sont d'abord **normalisés** sur des échelles comparables (0 à 1, ou −1 à +1), sinon une note sur 5 et une popularité sur 100 ne pèseraient pas pareil. Les poids ont ensuite été choisis selon la fiabilité et le rôle de chaque critère (voir partie 3), puis **vérifiés par les tests** : David ne reçoit pas de romance, Alice reçoit des films aimés par Gaëlle, Nina reçoit des films populaires.

### 4.4 Que faites-vous si une information manque ?

| Information manquante | Traitement |
|---|---|
| Pas de genres favoris, de notes ou de voisins | Le critère est retiré et son poids redistribué sur les autres |
| Aucune information sur l'utilisateur | Démarrage à froid : qualité + popularité |
| Film sans `rating` ou sans `popularity` | Valeur neutre de 0,5 |
| Film sans `genres` | Considéré comme n'ayant aucun genre |
| Note invalide (hors 1-5, non numérique) | Ignorée |
| Film présent deux fois dans le catalogue | Compté une seule fois |
| Catalogue vide, ou tous les films déjà vus | Tableau vide |

Aucun de ces cas ne provoque de plantage ni de score `NaN` (vérifié par le Test 4).

### 4.5 Comment évitez-vous de recommander uniquement les films les plus populaires ?

- La **popularité n'entre pas** dans le score du cas général.
- La **qualité ne pèse que 15 %** : un film moyennement noté mais parfaitement dans les goûts de l'utilisateur passe devant un chef-d'œuvre hors de ses goûts.
- 85 % du score dépend de **critères personnels**, donc deux profils différents reçoivent des films différents. David et Chloé avaient 5 films en commun avec l'algorithme initial, et **0** avec le nouveau.

### 4.6 Quelles sont les limites de votre système ?

- **Les genres sont la seule description d'un film.** Deux films du même genre sont considérés comme équivalents (pas de prise en compte de l'année, du réalisateur, des acteurs…).
- **L'affinité attribue une note à tous les genres d'un film.** Si David a adoré un film *Thriller + Comédie* pour son côté thriller, la *Comédie* profite aussi de cette bonne note.
- **Peu de données pour le collaboratif.** Avec 12 profils et 8 à 20 films vus chacun, plusieurs utilisateurs (David, Farid, Hugo) n'ont aucun voisin assez proche. Le collaboratif ne joue alors aucun rôle pour eux.
- **La similarité exige des films notés en commun.** Deux personnes aux goûts identiques mais qui n'ont jamais vu les mêmes films ne seront pas considérées comme proches.
- **Poids et seuils fixés à la main.** Ils ont été choisis et vérifiés sur ce jeu de données, mais ne sont pas optimisés automatiquement. Sur un autre catalogue, ils pourraient être à ajuster.
- **Pas de diversité forcée.** Les 5 recommandations peuvent être très proches (par exemple 5 films d'horreur pour David).
- **Démarrage à froid identique pour tous.** Tous les nouveaux utilisateurs reçoivent les mêmes films tant qu'ils n'ont rien noté.

### 4.7 Quelle est sa complexité algorithmique approximative ?

Notations : **M** = nombre de films, **U** = nombre d'utilisateurs, **R** = nombre de notes par utilisateur. Le nombre de genres par film (2 à 4) est considéré comme constant.

| Étape | Complexité |
|---|---|
| Construction des index (`Set` des films vus, `Map` id → film) | O(M + R) |
| Affinité par genre | O(R) |
| Similarité avec chaque utilisateur et score collaboratif | O(U × R) |
| Calcul du score de chaque film | O(M) |
| Tri des films | **O(M log M)** |
| **Total** | **O(M log M + U × R)** |

C'est le tri du catalogue qui domine quand le catalogue grandit.

**Optimisations mises en place :**

- `Set` et `Map` pour les recherches (films vus, genres favoris, films par id) : chaque recherche est immédiate, au lieu de parcourir un tableau avec `includes` ou `find`.
- L'affinité par genre et les scores collaboratifs sont calculés **une seule fois**, avant la boucle sur les films.

**Temps mesurés** (Test 6, `node --test`) :

| Catalogue | Temps par appel |
|---|---|
| 146 films (fourni) | 0,5 ms |
| 1 000 films | 1,7 ms |
| 5 000 films | 8,9 ms |
| 20 000 films | 29 ms |
| 50 000 films | 85 ms |

Le temps augmente à peu près proportionnellement à la taille du catalogue, ce qui correspond à la complexité annoncée.

**Amélioration possible :** ne conserver que les 5 meilleurs films au fur et à mesure du parcours, au lieu de trier tout le catalogue, ramènerait le tri à O(M). Le gain est négligeable à cette échelle, et `sort()` est explicitement autorisé par le sujet : ce choix a donc été écarté pour garder le code simple.

---

## 5. Tests

```bash
node --test
```

**44 tests, tous au vert.**

- `tests/recommender.test.js` (fourni) : contrat de sortie, cohérence des données et les 8 exercices.
- `tests/cinematch.test.js` (ajouté) : les 6 tests exigés par le sujet.

| Test | Ce qui est vérifié |
|---|---|
| **1. Exclusions** | Aucun film vu chez les 12 profils ; aucun id inexistant ou dupliqué ; un utilisateur qui a tout vu reçoit `[]` |
| **2. Personnalisation** | David (horreur) reçoit 100 % d'horreur/thriller, Chloé (romance) 100 % de romance/comédie ; aucun film en commun |
| **3. Influence d'un critère** | Une seule donnée modifiée change le classement : la popularité d'un film (Nina), un genre favori (Hugo), les notes à genres favoris identiques (Alice) |
| **4. Robustesse** | Catalogue vide, utilisateur sans historique, sans genres favoris, sans aucun champ ; films incomplets ; notes invalides ; doublons dans le catalogue |
| **5. Classement** | Scores numériques et triés ; départage par id en cas d'égalité ; résultats identiques sur deux appels |
| **6. Performance** | Temps mesuré sur le catalogue fourni et sur des catalogues de 1 000 à 50 000 films |

---

## 6. Comparatif avant / après

```bash
node compare.js            # David et Chloé
node compare.js Alice Hugo # ou deux autres profils
```

### David (Horreur, Thriller) et Chloé (Romance, Comédie)

| | Algorithme initial | Nouvel algorithme |
|---|---|---|
| **David** | *La Grande Vadrouille*, *Le Château ambulant*, *Les Évadés*, *L'Empire contre-attaque*, *Kill Bill* | *Conjuring*, *Ça*, *Fenêtre sur cour*, *L'Exorciste*, *Memento* |
| Dans ses genres favoris | 1/5 | **5/5** |
| **Chloé** | *La Grande Vadrouille*, *Le Château ambulant*, *Les Évadés*, *L'Empire contre-attaque*, *Kill Bill* | *Le Monde de Nemo*, *Là-haut*, *Ratatouille*, *Autant en emporte le vent*, *Casablanca* |
| Dans ses genres favoris | 2/5 | **5/5** |
| Films en commun entre les deux | **5/5** | **0/5** |

### Principales différences

1. **Personnalisation réelle.** L'algorithme initial donnait exactement les mêmes 5 films à tout le monde : les mieux notés du catalogue. Le nouveau donne à chacun des films de ses genres, et deux profils opposés n'ont plus rien en commun.
2. **Films déjà vus exclus.** L'algorithme initial pouvait recommander un film déjà vu (c'était le cas pour Alice). Le nouveau ne le fait jamais.
3. **Goûts révélés par les notes.** David n'a jamais déclaré ne pas aimer la romance, mais il a mal noté deux romances : il n'en reçoit plus.
4. **Découverte grâce aux profils proches.** Les recommandations de Chloé sont portées par ses voisins Inès et Karim, qui ont des goûts proches des siens (« Apprécié par des profils qui vous ressemblent »).
5. **Un score qui a du sens.** Le score n'est plus la note moyenne du film (4,8), mais un score de pertinence sur 100, propre à chaque utilisateur et accompagné d'une raison compréhensible.