'use strict';

/**
 * ============================================================
 *  recommender.js — LE fichier à modifier pendant la formation
 * ============================================================
 *
 * recommendMovies(user, movies, users) doit retourner AU PLUS 5 recommandations :
 *
 *   [ { movieId: 1, score: 4.7, reason: "Film bien noté" }, ... ]
 *
 * Contrat (voir README.md) :
 *  - fonction synchrone et SANS effet de bord : ne jamais modifier user, movies, users ;
 *  - movieId : identifiant d'un film existant, sans doublon ;
 *  - score   : nombre fini, résultats triés du meilleur au moins bon ;
 *  - reason  : courte phrase en français affichée à l'utilisateur ;
 *  - `user`, `movies` et `users` doivent rester les trois paramètres (même ordre).
 *
 * Données disponibles :
 *  - user  : { id, name, favoriteGenres, ratings: [{ movieId, score }], watchedMovieIds }
 *  - movies: [{ id, title, genres, year, rating, popularity }]
 *            (`rating` = note moyenne FICTIVE du film, pas la note de l'utilisateur !)
 *  - users : tous les profils (dont `user` lui-même).
 *
 * Après modification : relancer `node server.js` (Ctrl+C puis à nouveau) et
 * cliquer sur « Recalculer » dans l'application.
 */

const MAX_RECOMMENDATIONS = 5;

// Poids de chaque critère dans le score final (leur somme fait 1).
const WEIGHTS = {
  genre: 0.4,     // genres favoris déclarés (0 à 1)
  affinity: 0.35, // goûts révélés par les notes personnelles (-1 à +1)
  quality: 0.25,  // note moyenne du film (0 à 1)
};

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
 * Affinité de l'utilisateur pour chaque genre, déduite de ses notes.
 * Chaque note (1-5) devient une valeur entre -1 et +1 : (note - 3) / 2
 *   5 → +1 (adoré), 3 → 0 (neutre), 1 → -1 (détesté)
 * Puis on fait la moyenne par genre.
 * Retourne une Map : genre → affinité (entre -1 et +1).
 */
function buildGenreAffinity(ratings, moviesById) {
  const totals = new Map(); // genre → { sum, count }

  for (const { movieId, score } of ratings) {
    const movie = moviesById.get(movieId);
    if (!movie) continue; // film noté mais absent du catalogue : on l'ignore

    const value = (score - 3) / 2;
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

  // Index pour des recherches instantanées.
  const watched = new Set(user.watchedMovieIds || []);
  const favoriteGenres = new Set(user.favoriteGenres || []);
  const moviesById = new Map(movies.map((movie) => [movie.id, movie]));

  // TODO 4 : goûts révélés par les notes personnelles.
  const genreAffinity = buildGenreAffinity(user.ratings || [], moviesById);

  // Score de pertinence de chaque film non vu.
  const scored = [];
  for (const movie of movies) {
    if (watched.has(movie.id)) continue;

    const genre = genreMatchScore(movie, favoriteGenres);
    const affinity = affinityScore(movie, genreAffinity);
    const quality = qualityScore(movie);
    const score =
      100 * (WEIGHTS.genre * genre + WEIGHTS.affinity * affinity + WEIGHTS.quality * quality);

    scored.push({ movie, score, genre, affinity });
  }

  // Tri par score décroissant ; en cas d'égalité, le plus petit id d'abord (déterministe).
  scored.sort((a, b) => b.score - a.score || a.movie.id - b.movie.id);

  // TODO 5 : mesurer la similarité entre utilisateurs (paramètre `users`).
  // TODO 6 : intégrer un score collaboratif (ce qu'aiment les utilisateurs proches).
  // TODO 7 : gérer les cas limites (aucun historique, catalogue vide, peu de films...).
  // TODO 8 : optimiser les performances.

  return scored.slice(0, MAX_RECOMMENDATIONS).map(({ movie, score, genre, affinity }) => ({
    movieId: movie.id,
    score: Math.round(score * 10) / 10,
    reason: buildReason(genre, affinity),
  }));
}

/**
 * Justification affichée à l'utilisateur, selon le critère qui a le plus joué.
 */
function buildReason(genre, affinity) {
  if (affinity >= 0.5) return 'Proche des films que vous avez adorés';
  if (genre > 0) return 'Correspond à vos genres préférés';
  return 'Film bien noté par le public';
}

module.exports = { recommendMovies };