'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert');
const { recommendMovies } = require('../recommender');
const { defineContractTests } = require('./contract');
const movies = require('../data/movies.json');
const users = require('../data/users.json');

const clone = (x) => structuredClone(x);
const movieIds = new Set(movies.map((m) => m.id));
const run = (user) => recommendMovies(clone(user), clone(movies), clone(users));
const coldUser = users.find((u) => u.watchedMovieIds.length === 0);

// ============================================================
//  1. Contrat de sortie — doit TOUJOURS passer, quelle que soit la stratégie
//     (défini dans tests/contract.js)
// ============================================================
defineContractTests('Contrat de recommendMovies()', recommendMovies);

// ============================================================
//  2. Cohérence du jeu de données
// ============================================================
describe('Cohérence des données', () => {
  test('identifiants de films uniques, notes dans [1,5], popularités dans [0,100]', () => {
    assert.ok(movies.length >= 100 && movies.length <= 150);
    assert.strictEqual(movieIds.size, movies.length);
    for (const m of movies) {
      assert.ok(m.rating >= 1 && m.rating <= 5);
      assert.ok(m.popularity >= 0 && m.popularity <= 100);
      assert.ok(m.genres.length > 0);
    }
  });

  test('12 utilisateurs, dont un seul sans historique', () => {
    assert.strictEqual(users.length, 12);
    assert.strictEqual(new Set(users.map((u) => u.id)).size, 12);
    assert.strictEqual(users.filter((u) => u.watchedMovieIds.length === 0).length, 1);
  });

  test('historiques cohérents : 8 à 20 films, notes 1-5, notes ⊆ films vus', () => {
    for (const u of users.filter((x) => x.watchedMovieIds.length > 0)) {
      assert.ok(u.watchedMovieIds.length >= 8 && u.watchedMovieIds.length <= 20, u.name);
      assert.strictEqual(new Set(u.watchedMovieIds).size, u.watchedMovieIds.length);
      for (const id of u.watchedMovieIds) assert.ok(movieIds.has(id));
      for (const r of u.ratings) {
        assert.ok(u.watchedMovieIds.includes(r.movieId), `${u.name} note un film non vu`);
        assert.ok(Number.isInteger(r.score) && r.score >= 1 && r.score <= 5);
      }
    }
  });
});

// ============================================================
//  3. Tests pédagogiques — marqués `todo` : ils ÉCHOUENT au départ (c'est normal)
//     et n'invalident pas `node --test`. Retirez l'option `todo` quand
//     l'exercice correspondant est terminé.
// ============================================================
describe('Exercices (à débloquer)', () => {
  const alice = users.find((u) => u.name === 'Alice');
  const hugo = users.find((u) => u.name === 'Hugo');

  test('Exercice 1 : ne recommande aucun film déjà vu', () => {
    for (const u of users) {
      for (const r of run(u)) assert.ok(!u.watchedMovieIds.includes(r.movieId), `${u.name} a déjà vu ${r.movieId}`);
    }
  });

  test('Exercice 2 : tient compte des genres préférés', () => {
    const favs = new Set(alice.favoriteGenres);
    const hits = run(alice).filter((r) => movies.find((m) => m.id === r.movieId).genres.some((g) => favs.has(g)));
    assert.ok(hits.length >= 3, 'au moins 3 recommandations dans les genres favoris');
  });

  test('Exercice 3 : des profils différents reçoivent des recommandations différentes', () => {
    const a = run(alice).map((r) => r.movieId).sort();
    const h = run(hugo).map((r) => r.movieId).sort();
    assert.notDeepStrictEqual(a, h);
  });

  test('Exercice 4 : ne recommande pas les genres que l’utilisateur a mal notés', () => {
    const david = users.find((u) => u.name === 'David');
    const recs = run(david).map((r) => movies.find((m) => m.id === r.movieId));
    assert.ok(recs.every((m) => !m.genres.includes('Romance')));
  });

  test('Exercice 5-6 : recommande un film bien noté (≥ 4) par un profil proche et pas encore vu', () => {
    // Alice et Gaëlle ont des goûts proches.
    const gaelle = users.find((u) => u.name === 'Gaëlle');
    const loved = new Set(gaelle.ratings.filter((r) => r.score >= 4).map((r) => r.movieId));
    assert.ok(run(alice).some((r) => loved.has(r.movieId) && !alice.watchedMovieIds.includes(r.movieId)));
  });

  test('Exercice 7 : le démarrage à froid reste pertinent (films populaires)', () => {
    const avgPop = movies.reduce((s, m) => s + m.popularity, 0) / movies.length;
    const recs = run(coldUser).map((r) => movies.find((m) => m.id === r.movieId));
    assert.ok(recs.every((m) => m.popularity >= avgPop));
  });

  test('Exercice 8 : reste rapide sur un grand catalogue (5000 films)', { todo: 'TODO 8' }, () => {
    const big = Array.from({ length: 5000 }, (_, i) => ({ ...movies[i % movies.length], id: i + 1 }));
    const start = performance.now();
    recommendMovies(clone(alice), big, clone(users));
    assert.ok(performance.now() - start < 200, 'doit s’exécuter en moins de 200 ms');
  });
});
