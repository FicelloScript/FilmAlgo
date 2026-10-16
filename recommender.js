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

  // TODO 1 : exclure les films déjà visionnés.
  // Set = recherche instantanée (has) au lieu de parcourir le tableau à chaque film.
  const watched = new Set(user.watchedMovieIds || []);
  const candidates = movies.filter((movie) => !watched.has(movie.id));

  const sorted = candidates.sort((a, b) => b.rating - a.rating);

  // TODO 2 : prendre en compte les genres préférés (user.favoriteGenres).

  // TODO 3 : calculer un score de pertinence (et plus seulement la note moyenne).

  // TODO 4 : analyser les notes individuelles de l'utilisateur (user.ratings).

  // TODO 5 : mesurer la similarité entre utilisateurs (paramètre `users`).

  // TODO 6 : intégrer un score collaboratif (ce qu'aiment les utilisateurs proches).

  // TODO 7 : gérer les cas limites (aucun historique, catalogue vide, peu de films...).

  // TODO 8 : optimiser les performances (éviter les recherches répétées dans les tableaux).

  return sorted.slice(0, MAX_RECOMMENDATIONS).map((movie) => ({
    movieId: movie.id,
    score: movie.rating,
    reason: 'Film bien noté',
  }));
}

module.exports = { recommendMovies };
