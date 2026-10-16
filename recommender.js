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
  genre: 0.6,   // personnalisation : genres favoris
  quality: 0.4, // qualité générale du film (note moyenne)
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

  // TODO 1 : exclure les films déjà visionnés (Set = recherche instantanée).
  const watched = new Set(user.watchedMovieIds || []);

  // TODO 2 : genres préférés, eux aussi dans un Set.
  const favoriteGenres = new Set(user.favoriteGenres || []);

  // TODO 3 : un score de pertinence par film.
  const scored = [];
  for (const movie of movies) {
    if (watched.has(movie.id)) continue; // film déjà vu : on passe

    const genre = genreMatchScore(movie, favoriteGenres);
    const quality = qualityScore(movie);
    const score = 100 * (WEIGHTS.genre * genre + WEIGHTS.quality * quality);

    scored.push({ movie, score, genre });
  }

  // Tri par score décroissant ; en cas d'égalité, le plus petit id d'abord (résultat déterministe).
  scored.sort((a, b) => b.score - a.score || a.movie.id - b.movie.id);

  // TODO 4 : analyser les notes individuelles de l'utilisateur (user.ratings).
  // TODO 5 : mesurer la similarité entre utilisateurs (paramètre `users`).
  // TODO 6 : intégrer un score collaboratif (ce qu'aiment les utilisateurs proches).
  // TODO 7 : gérer les cas limites (aucun historique, catalogue vide, peu de films...).
  // TODO 8 : optimiser les performances (éviter les recherches répétées dans les tableaux).

  return scored.slice(0, MAX_RECOMMENDATIONS).map(({ movie, score, genre }) => ({
    movieId: movie.id,
    score: Math.round(score * 10) / 10, // arrondi à 1 décimale
    reason: genre > 0 ? 'Correspond à vos genres préférés' : 'Film bien noté',
  }));
}

module.exports = { recommendMovies };