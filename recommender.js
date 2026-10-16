'use strict';

/**
 * recommender.js — moteur de recommandation CinéMatch
 *
 * score = 100 × (0.35 × genre + 0.25 × affinité + 0.25 × collaboratif + 0.15 × qualité)
 *
 *  - genre        (0 à 1)  : part des genres favoris déclarés présents dans le film
 *  - affinité     (-1 à 1) : goûts révélés par les notes personnelles, par genre
 *  - collaboratif (-1 à 1) : avis des utilisateurs aux goûts proches
 *  - qualité      (0 à 1)  : note moyenne du film
 */

const MAX_RECOMMENDATIONS = 5;

// Poids de chaque critère dans le score final (leur somme fait 1).
const WEIGHTS = {
  genre: 0.35,         // ce que l'utilisateur dit aimer
  affinity: 0.25,      // ce que ses notes montrent qu'il aime
  collaborative: 0.25, // ce qu'aiment les profils qui lui ressemblent
  quality: 0.15,       // qualité générale, sert surtout à départager
};

// Paramètres de la similarité entre utilisateurs.
const MIN_COMMON_FOR_FULL_CONFIDENCE = 3; // en dessous, la similarité est réduite
const MIN_SIMILARITY = 0.5;               // seuil pour être considéré comme « voisin »

// ------------------------------------------------------------
//  Critères individuels
// ------------------------------------------------------------

/**
 * Part des genres favoris de l'utilisateur présents dans le film (entre 0 et 1).
 * Ex : favoris = {SF, Aventure}, film = [SF, Aventure] → 2/2 = 1 ; film = [Aventure, Drame] → 1/2 = 0.5
 */
function genreMatchScore(movie, favoriteGenres) {
  if (favoriteGenres.size === 0) return 0; // pas de genres favoris : critère neutre
  let matches = 0;
  for (const genre of movie.genres) {
    if (favoriteGenres.has(genre)) matches++;
  }
  return matches / favoriteGenres.size;
}

/**
 * Note moyenne du film ramenée entre 0 et 1 (rating va de 1 à 5).
 */
function qualityScore(movie) {
  return (movie.rating - 1) / 4;
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

  for (const { movieId, score } of ratings) {
    const movie = moviesById.get(movieId);
    if (!movie) continue; // film noté mais absent du catalogue : on l'ignore

    const value = ratingToValue(score);
    for (const genre of movie.genres) {
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
  for (const genre of movie.genres) {
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

/**
 * Notes d'un utilisateur sous forme de Map : movieId → note.
 */
function toRatingsMap(user) {
  return new Map((user.ratings || []).map((r) => [r.movieId, r.score]));
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
 * Retourne une Map : movieId → score collaboratif.
 */
function buildCollaborativeScores(user, users) {
  const myRatings = toRatingsMap(user);
  const totals = new Map(); // movieId → { sum, weight }

  for (const other of users) {
    if (other.id === user.id) continue; // on ne se compare pas à soi-même

    const similarity = userSimilarity(myRatings, toRatingsMap(other));
    if (similarity < MIN_SIMILARITY) continue; // pas assez proche : ignoré

    for (const { movieId, score } of other.ratings || []) {
      const total = totals.get(movieId) || { sum: 0, weight: 0 };
      total.sum += similarity * ratingToValue(score);
      total.weight += similarity;
      totals.set(movieId, total);
    }
  }

  const scores = new Map();
  for (const [movieId, { sum, weight }] of totals) {
    scores.set(movieId, sum / weight);
  }
  return scores;
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
  const moviesById = new Map(movies.map((movie) => [movie.id, movie]));
  const genreAffinity = buildGenreAffinity(user.ratings || [], moviesById);
  const collaborativeScores = buildCollaborativeScores(user, users);

  // Score de pertinence de chaque film non vu.
  const scored = [];
  for (const movie of movies) {
    if (watched.has(movie.id)) continue;

    const genre = genreMatchScore(movie, favoriteGenres);
    const affinity = affinityScore(movie, genreAffinity);
    const collaborative = collaborativeScores.get(movie.id) || 0;
    const quality = qualityScore(movie);

    const score =
      100 *
      (WEIGHTS.genre * genre +
        WEIGHTS.affinity * affinity +
        WEIGHTS.collaborative * collaborative +
        WEIGHTS.quality * quality);

    scored.push({ movie, score, genre, affinity, collaborative });
  }

  // Tri par score décroissant ; en cas d'égalité, le plus petit id d'abord (déterministe).
  scored.sort((a, b) => b.score - a.score || a.movie.id - b.movie.id);

  // TODO 7 : gérer les cas limites (aucun historique, catalogue vide, peu de films...).
  // TODO 8 : optimiser les performances.

  return scored.slice(0, MAX_RECOMMENDATIONS).map((entry) => ({
    movieId: entry.movie.id,
    score: Math.round(entry.score * 10) / 10,
    reason: buildReason(entry),
  }));
}

/**
 * Justification affichée à l'utilisateur, selon le critère qui a le plus joué.
 */
function buildReason({ genre, affinity, collaborative }) {
  if (collaborative >= 0.5) return 'Apprécié par des profils qui vous ressemblent';
  if (affinity >= 0.5) return 'Proche des films que vous avez adorés';
  if (genre > 0) return 'Correspond à vos genres préférés';
  return 'Film bien noté par le public';
}

module.exports = { recommendMovies };