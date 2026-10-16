'use strict';

/**
 * recommender.js — moteur de recommandation CinéMatch
 *
 * Cas général :
 *   score = 100 × (0.35 × genre + 0.25 × affinité + 0.25 × collaboratif + 0.15 × qualité)
 *
 *  - genre        (0 à 1)  : part des genres favoris déclarés présents dans le film
 *  - affinité     (-1 à 1) : goûts révélés par les notes personnelles, par genre
 *  - collaboratif (-1 à 1) : avis des utilisateurs aux goûts proches
 *  - qualité      (0 à 1)  : note moyenne du film
 *
 * Si un critère est indisponible pour l'utilisateur, son poids est redistribué
 * sur les autres (les poids restants sont ramenés à une somme de 1).
 *
 * Démarrage à froid (aucune info sur l'utilisateur) :
 *   score = 100 × (0.5 × qualité + 0.5 × popularité)
 */

const MAX_RECOMMENDATIONS = 5;

// Poids de chaque critère dans le cas général (leur somme fait 1).
const WEIGHTS = {
  genre: 0.35,         // ce que l'utilisateur dit aimer
  affinity: 0.25,      // ce que ses notes montrent qu'il aime
  collaborative: 0.25, // ce qu'aiment les profils qui lui ressemblent
  quality: 0.15,       // qualité générale, sert surtout à départager
};

// Poids utilisés quand on ne sait rien de l'utilisateur.
const COLD_START_WEIGHTS = {
  quality: 0.5,
  popularity: 0.5,
};

// Valeur utilisée quand une donnée d'un film manque (milieu de l'échelle 0-1).
const NEUTRAL = 0.5;

// Paramètres de la similarité entre utilisateurs.
const MIN_COMMON_FOR_FULL_CONFIDENCE = 3; // en dessous, la similarité est réduite
const MIN_SIMILARITY = 0.5;               // seuil pour être considéré comme « voisin »

// ------------------------------------------------------------
//  Lecture sécurisée des données
// ------------------------------------------------------------

/** Genres d'un film, ou tableau vide s'ils sont absents. */
function genresOf(movie) {
  return Array.isArray(movie.genres) ? movie.genres : [];
}

/** Une note utilisateur est valide si c'est un nombre entre 1 et 5. */
function isValidRating(rating) {
  return Boolean(rating) && Number.isFinite(rating.score) && rating.score >= 1 && rating.score <= 5;
}

// ------------------------------------------------------------
//  Critères individuels
// ------------------------------------------------------------

/**
 * Part des genres favoris de l'utilisateur présents dans le film (entre 0 et 1).
 * Ex : favoris = {SF, Aventure}, film = [SF, Aventure] → 2/2 = 1 ; film = [Aventure, Drame] → 1/2 = 0.5
 */
function genreMatchScore(movie, favoriteGenres) {
  if (favoriteGenres.size === 0) return 0;
  let matches = 0;
  for (const genre of genresOf(movie)) {
    if (favoriteGenres.has(genre)) matches++;
  }
  return matches / favoriteGenres.size;
}

/** Note moyenne du film ramenée entre 0 et 1 (rating va de 1 à 5). Absente = neutre. */
function qualityScore(movie) {
  return Number.isFinite(movie.rating) ? (movie.rating - 1) / 4 : NEUTRAL;
}

/** Popularité du film ramenée entre 0 et 1 (popularity va de 0 à 100). Absente = neutre. */
function popularityScore(movie) {
  return Number.isFinite(movie.popularity) ? movie.popularity / 100 : NEUTRAL;
}

/**
 * Transforme une note utilisateur (1 à 5) en valeur entre -1 et +1.
 * 5 → +1 (adoré), 3 → 0 (neutre), 1 → -1 (détesté)
 */
function ratingToValue(score) {
  return (score - 3) / 2;
}

/**
 * Affinité de l'utilisateur pour chaque genre, déduite de ses notes.
 * Retourne une Map : genre → affinité moyenne (entre -1 et +1).
 */
function buildGenreAffinity(ratings, moviesById) {
  const totals = new Map(); // genre → { sum, count }

  for (const rating of ratings) {
    if (!isValidRating(rating)) continue; // note invalide : ignorée
    const movie = moviesById.get(rating.movieId);
    if (!movie) continue; // film noté mais absent du catalogue : ignoré

    const value = ratingToValue(rating.score);
    for (const genre of genresOf(movie)) {
      const total = totals.get(genre) || { sum: 0, count: 0 };
      total.sum += value;
      total.count++;
      totals.set(genre, total);
    }
  }

  const affinity = new Map();
  for (const [genre, { sum, count }] of totals) {
    affinity.set(genre, sum / count);
  }
  return affinity;
}

/**
 * Affinité de l'utilisateur pour un film : moyenne des affinités de ses genres connus.
 * Genre jamais noté = ignoré. Aucun genre connu = 0 (neutre).
 */
function affinityScore(movie, genreAffinity) {
  let sum = 0;
  let count = 0;
  for (const genre of genresOf(movie)) {
    if (genreAffinity.has(genre)) {
      sum += genreAffinity.get(genre);
      count++;
    }
  }
  return count === 0 ? 0 : sum / count;
}

// ------------------------------------------------------------
//  Recommandation collaborative
// ------------------------------------------------------------

/** Notes valides d'un utilisateur sous forme de Map : movieId → note. */
function toRatingsMap(user) {
  const map = new Map();
  for (const rating of user.ratings || []) {
    if (isValidRating(rating)) map.set(rating.movieId, rating.score);
  }
  return map;
}

/**
 * TODO 5 : similarité entre deux utilisateurs (entre -1 et +1).
 * Pour chaque film noté par les deux : accord = 1 - |noteA - noteB| / 2
 *   même note → +1 ; 2 points d'écart → 0 ; 4 points d'écart → -1
 * Similarité = moyenne des accords × confiance.
 * Confiance = min(1, nbCommuns / 3) : peu de films en commun = conclusion prudente.
 */
function userSimilarity(ratingsA, ratingsB) {
  let sum = 0;
  let common = 0;
  for (const [movieId, scoreA] of ratingsA) {
    if (ratingsB.has(movieId)) {
      sum += 1 - Math.abs(scoreA - ratingsB.get(movieId)) / 2;
      common++;
    }
  }
  if (common === 0) return 0; // aucun film en commun : on ne peut rien dire

  const confidence = Math.min(1, common / MIN_COMMON_FOR_FULL_CONFIDENCE);
  return (sum / common) * confidence;
}

/**
 * TODO 6 : score collaboratif de chaque film (entre -1 et +1).
 * On garde les voisins (similarité ≥ MIN_SIMILARITY), puis pour chaque film,
 * moyenne de leurs avis pondérée par leur similarité.
 * Retourne une Map : movieId → score collaboratif (vide si aucun voisin).
 */
function buildCollaborativeScores(user, users) {
  const myRatings = toRatingsMap(user);
  const scores = new Map();
  if (myRatings.size === 0) return scores; // aucune note : impossible de trouver des voisins

  const totals = new Map(); // movieId → { sum, weight }
  for (const other of users) {
    if (!other || other.id === user.id) continue; // on ne se compare pas à soi-même

    const otherRatings = toRatingsMap(other);
    const similarity = userSimilarity(myRatings, otherRatings);
    if (similarity < MIN_SIMILARITY) continue; // pas assez proche : ignoré

    for (const [movieId, score] of otherRatings) {
      const total = totals.get(movieId) || { sum: 0, weight: 0 };
      total.sum += similarity * ratingToValue(score);
      total.weight += similarity;
      totals.set(movieId, total);
    }
  }

  for (const [movieId, { sum, weight }] of totals) {
    scores.set(movieId, sum / weight);
  }
  return scores;
}

// ------------------------------------------------------------
//  Pondération
// ------------------------------------------------------------

/**
 * TODO 7 : choisit les poids selon les critères disponibles pour cet utilisateur.
 *  - aucun critère personnel → démarrage à froid (qualité + popularité) ;
 *  - sinon → poids des critères disponibles, ramenés à une somme de 1.
 */
function chooseWeights(available) {
  const hasPersonalData = available.genre || available.affinity || available.collaborative;
  if (!hasPersonalData) return { ...COLD_START_WEIGHTS };

  const weights = {};
  let total = 0;
  for (const [criterion, weight] of Object.entries(WEIGHTS)) {
    if (available[criterion]) {
      weights[criterion] = weight;
      total += weight;
    }
  }
  for (const criterion of Object.keys(weights)) {
    weights[criterion] /= total;
  }
  return weights;
}

// ------------------------------------------------------------
//  Fonction principale
// ------------------------------------------------------------

function recommendMovies(user, movies, users) {
  if (!user || typeof user !== 'object') {
    throw new TypeError('recommendMovies : `user` doit être un objet');
  }
  if (!Array.isArray(movies)) {
    throw new TypeError('recommendMovies : `movies` doit être un tableau');
  }
  if (!Array.isArray(users)) {
    throw new TypeError('recommendMovies : `users` doit être un tableau');
  }

  // Index pour des recherches instantanées (calculés une seule fois).
  const watched = new Set(user.watchedMovieIds || []);
  const favoriteGenres = new Set(user.favoriteGenres || []);
  const moviesById = new Map(movies.filter(Boolean).map((movie) => [movie.id, movie]));
  const genreAffinity = buildGenreAffinity(user.ratings || [], moviesById);
  const collaborativeScores = buildCollaborativeScores(user, users);

  // Poids adaptés aux informations disponibles sur l'utilisateur.
  const weights = chooseWeights({
    genre: favoriteGenres.size > 0,
    affinity: genreAffinity.size > 0,
    collaborative: collaborativeScores.size > 0,
    quality: true,
  });
  const coldStart = 'popularity' in weights;

  // Score de pertinence de chaque film non vu.
  const alreadyScored = new Set(); // protège contre un film présent deux fois dans le catalogue
  const scored = [];
  for (const movie of movies) {
    if (!movie || watched.has(movie.id) || alreadyScored.has(movie.id)) continue;
    alreadyScored.add(movie.id);

    const criteria = {
      genre: genreMatchScore(movie, favoriteGenres),
      affinity: affinityScore(movie, genreAffinity),
      collaborative: collaborativeScores.get(movie.id) || 0,
      quality: qualityScore(movie),
      popularity: popularityScore(movie),
    };

    let score = 0;
    for (const [criterion, weight] of Object.entries(weights)) {
      score += weight * criteria[criterion];
    }

    scored.push({ movie, score: 100 * score, criteria });
  }

  // Tri par score décroissant ; en cas d'égalité, le plus petit id d'abord (déterministe).
  scored.sort((a, b) => b.score - a.score || a.movie.id - b.movie.id);

  // TODO 8 : optimiser les performances.

  return scored.slice(0, MAX_RECOMMENDATIONS).map((entry) => ({
    movieId: entry.movie.id,
    score: Math.round(entry.score * 10) / 10,
    reason: buildReason(entry.criteria, coldStart),
  }));
}

/**
 * Justification affichée à l'utilisateur, selon le critère qui a le plus joué.
 */
function buildReason({ genre, affinity, collaborative }, coldStart) {
  if (coldStart) return 'Incontournable : populaire et bien noté';
  if (collaborative >= 0.5) return 'Apprécié par des profils qui vous ressemblent';
  if (affinity >= 0.5) return 'Proche des films que vous avez adorés';
  if (genre > 0) return 'Correspond à vos genres préférés';
  return 'Film bien noté par le public';
}

module.exports = { recommendMovies };