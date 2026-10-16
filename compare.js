'use strict';

const { recommendMovies } = require('./recommender');
const movies = require('./data/movies.json');
const users = require('./data/users.json');

const movieById = new Map(movies.map((m) => [m.id, m]));

/** Algorithme initial : les 5 films les mieux notés, pour tout le monde. */
function initialRecommendMovies(user, allMovies) {
  return [...allMovies]
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 5)
    .map((movie) => ({ movieId: movie.id, score: movie.rating, reason: 'Film bien noté' }));
}

/** Affiche une liste de recommandations sous forme de tableau. */
function show(title, recs, user) {
  const watched = new Set(user.watchedMovieIds);
  const favorites = new Set(user.favoriteGenres);
  console.log(`\n  ${title}`);
  console.table(
    recs.map((r) => {
      const movie = movieById.get(r.movieId);
      return {
        Film: movie.title,
        Genres: movie.genres.join(', '),
        Score: r.score,
        'Déjà vu': watched.has(r.movieId) ? 'OUI' : '',
        'Genre favori': movie.genres.some((g) => favorites.has(g)) ? 'oui' : '',
        Raison: r.reason,
      };
    }),
  );
}

/** Petit bilan chiffré pour un profil. */
function summary(recs, user) {
  const watched = new Set(user.watchedMovieIds);
  const favorites = new Set(user.favoriteGenres);
  const seen = recs.filter((r) => watched.has(r.movieId)).length;
  const fav = recs.filter((r) => movieById.get(r.movieId).genres.some((g) => favorites.has(g))).length;
  return `${seen}/5 déjà vus, ${fav}/5 dans ses genres favoris`;
}

const names = process.argv.slice(2).length === 2 ? process.argv.slice(2) : ['David', 'Chloé'];

for (const name of names) {
  const user = users.find((u) => u.name === name);
  if (!user) {
    console.error(`Profil introuvable : ${name}`);
    process.exit(1);
  }

  console.log('\n' + '='.repeat(70));
  console.log(`  ${user.name} — genres favoris : ${user.favoriteGenres.join(', ') || 'aucun'}`);
  console.log('='.repeat(70));

  const before = initialRecommendMovies(structuredClone(user), structuredClone(movies));
  const after = recommendMovies(structuredClone(user), structuredClone(movies), structuredClone(users));

  show('AVANT (algorithme initial)', before, user);
  show('APRÈS (nouvel algorithme)', after, user);

  console.log(`  Bilan avant : ${summary(before, user)}`);
  console.log(`  Bilan après : ${summary(after, user)}`);
}

// Les deux profils reçoivent-ils les mêmes films ?
const [a, b] = names.map((n) => users.find((u) => u.name === n));
const idsOf = (recs) => recs.map((r) => r.movieId);
const commonBefore = idsOf(initialRecommendMovies(a, movies)).filter((id) =>
  idsOf(initialRecommendMovies(b, movies)).includes(id)).length;
const commonAfter = idsOf(recommendMovies(a, movies, users)).filter((id) =>
  idsOf(recommendMovies(b, movies, users)).includes(id)).length;

console.log('\n' + '='.repeat(70));
console.log(`  Films en commun entre ${a.name} et ${b.name} : avant ${commonBefore}/5, après ${commonAfter}/5`);
console.log('='.repeat(70) + '\n');