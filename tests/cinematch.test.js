'use strict';

/**
 * Tests complémentaires exigés par le sujet (partie 5 « Contrôle qualité »).
 * Lancement : node --test
 */

const { describe, test } = require('node:test');
const assert = require('node:assert');
const { recommendMovies } = require('../recommender');
const movies = require('../data/movies.json');
const users = require('../data/users.json');

// Copies profondes : chaque test travaille sur ses propres données.
const clone = (x) => structuredClone(x);
const byName = (name) => clone(users.find((u) => u.name === name));
const movieById = new Map(movies.map((m) => [m.id, m]));
const run = (user, catalog = movies, allUsers = users) =>
  recommendMovies(user, clone(catalog), clone(allUsers));
const ids = (recs) => recs.map((r) => r.movieId);
const hasGenre = (recs, genres) =>
  recs.map((r) => movieById.get(r.movieId)).filter((m) => m.genres.some((g) => genres.includes(g)));

// ------------------------------------------------------------
//  Test 1 : exclusions
// ------------------------------------------------------------
describe('Test 1 : exclusions', () => {
  test('aucun film déjà vu, pour chacun des 12 profils', () => {
    for (const user of users) {
      const watched = new Set(user.watchedMovieIds);
      for (const rec of run(clone(user))) {
        assert.ok(!watched.has(rec.movieId), `${user.name} a déjà vu le film ${rec.movieId}`);
      }
    }
  });

  test('aucun identifiant inexistant ni dupliqué', () => {
    for (const user of users) {
      const recIds = ids(run(clone(user)));
      assert.strictEqual(new Set(recIds).size, recIds.length, `doublon pour ${user.name}`);
      for (const id of recIds) assert.ok(movieById.has(id), `film ${id} inexistant`);
    }
  });

  test('un utilisateur qui a tout vu ne reçoit aucune recommandation', () => {
    const alice = byName('Alice');
    alice.watchedMovieIds = movies.map((m) => m.id);
    assert.deepStrictEqual(run(alice), []);
  });
});

// ------------------------------------------------------------
//  Test 2 : personnalisation (profils opposés)
// ------------------------------------------------------------
describe('Test 2 : personnalisation', () => {
  const david = byName('David'); // horreur / thriller
  const chloe = byName('Chloé'); // romance / comédie
  const davidRecs = run(david);
  const chloeRecs = run(chloe);

  test('David (horreur) reçoit des films d’horreur ou de thriller', () => {
    assert.strictEqual(hasGenre(davidRecs, ['Horreur', 'Thriller']).length, davidRecs.length);
  });

  test('Chloé (romance) reçoit des films romantiques ou des comédies', () => {
    assert.strictEqual(hasGenre(chloeRecs, ['Romance', 'Comédie']).length, chloeRecs.length);
  });

  test('leurs recommandations n’ont aucun film en commun', () => {
    const common = ids(davidRecs).filter((id) => ids(chloeRecs).includes(id));
    assert.deepStrictEqual(common, []);
  });

  test('chacun évite le genre préféré de l’autre', () => {
    assert.strictEqual(hasGenre(davidRecs, ['Romance']).length, 0, 'David ne doit pas avoir de romance');
    assert.strictEqual(hasGenre(chloeRecs, ['Horreur']).length, 0, 'Chloé ne doit pas avoir d’horreur');
  });
});

// ------------------------------------------------------------
//  Test 3 : influence d'un seul critère
// ------------------------------------------------------------
describe('Test 3 : influence d’un critère', () => {
  test('changer la popularité d’UN film fait entrer ce film dans les recommandations (démarrage à froid)', () => {
    const nina = byName('Nina');
    const before = ids(run(nina));

    // Film le mieux noté parmi ceux qui ne sont pas recommandés à Nina.
    const target = movies
      .filter((m) => !before.includes(m.id))
      .sort((a, b) => b.rating - a.rating || a.id - b.id)[0];

    const modified = clone(movies);
    modified.find((m) => m.id === target.id).popularity = 100; // une seule donnée modifiée

    const after = ids(run(nina, modified));
    assert.ok(!before.includes(target.id));
    assert.ok(after.includes(target.id), `${target.title} devrait apparaître après modification`);
  });

  test('changer UN genre favori change les recommandations', () => {
    const hugo = byName('Hugo'); // Western / Guerre
    const before = ids(run(hugo));
    hugo.favoriteGenres = ['Western', 'Science-fiction']; // Guerre → Science-fiction
    const after = ids(run(hugo));
    assert.notDeepStrictEqual(after, before);
    assert.ok(hasGenre(run(hugo), ['Science-fiction']).length > 0);
  });

  test('à genres favoris identiques, les notes personnelles modifient le classement', () => {
    const alice = byName('Alice');
    const before = ids(run(alice));

    // Même profil, mêmes genres favoris, mais elle déteste désormais la science-fiction.
    const disappointed = byName('Alice');
    for (const r of disappointed.ratings) {
      if (movieById.get(r.movieId).genres.includes('Science-fiction')) r.score = 1;
    }
    assert.deepStrictEqual(disappointed.favoriteGenres, alice.favoriteGenres);
    assert.notDeepStrictEqual(ids(run(disappointed)), before);
  });
});

// ------------------------------------------------------------
//  Test 4 : robustesse (cas particuliers)
// ------------------------------------------------------------
describe('Test 4 : robustesse', () => {
  const assertValid = (recs) => {
    assert.ok(Array.isArray(recs));
    for (const r of recs) {
      assert.ok(Number.isFinite(r.score), `score invalide : ${r.score}`);
      assert.ok(typeof r.reason === 'string' && r.reason.length > 0);
    }
  };

  test('catalogue vide → tableau vide', () => {
    assert.deepStrictEqual(run(byName('Alice'), []), []);
  });

  test('utilisateur sans historique (Nina) → 5 recommandations valides et populaires', () => {
    const recs = run(byName('Nina'));
    assert.strictEqual(recs.length, 5);
    assertValid(recs);
    const avgPop = movies.reduce((s, m) => s + m.popularity, 0) / movies.length;
    for (const r of recs) assert.ok(movieById.get(r.movieId).popularity >= avgPop);
  });

  test('utilisateur sans genres favoris mais avec des notes → recommandations valides', () => {
    const alice = byName('Alice');
    alice.favoriteGenres = [];
    const recs = run(alice);
    assert.strictEqual(recs.length, 5);
    assertValid(recs);
  });

  test('utilisateur sans aucun champ renseigné → pas de plantage', () => {
    assertValid(run({ id: 999 }));
  });

  test('films avec données manquantes (pas de note, de genres ni de popularité) → scores valides', () => {
    const incomplete = [{ id: 1, title: 'A' }, { id: 2, title: 'B', genres: ['Horreur'] }, { id: 3 }];
    const recs = run(byName('David'), incomplete);
    assert.strictEqual(recs.length, 3);
    assertValid(recs);
  });

  test('notes invalides ignorées (hors 1-5, non numériques)', () => {
    const user = { id: 999, favoriteGenres: ['Drame'], watchedMovieIds: [], ratings: [
      { movieId: 1, score: 42 }, { movieId: 2, score: 'super' }, { movieId: 3, score: null },
    ] };
    assertValid(run(user));
  });

  test('film présent deux fois dans le catalogue → recommandé au plus une fois', () => {
    const duplicated = [...movies, ...movies];
    const recIds = ids(run(byName('Nina'), duplicated));
    assert.strictEqual(new Set(recIds).size, recIds.length);
  });
});

// ------------------------------------------------------------
//  Test 5 : classement
// ------------------------------------------------------------
describe('Test 5 : classement', () => {
  test('scores numériques, triés du meilleur au moins bon, sans doublon (tous les profils)', () => {
    for (const user of users) {
      const recs = run(clone(user));
      for (let i = 0; i < recs.length; i++) {
        assert.ok(Number.isFinite(recs[i].score));
        if (i > 0) assert.ok(recs[i - 1].score >= recs[i].score, `tri incorrect pour ${user.name}`);
      }
      assert.strictEqual(new Set(ids(recs)).size, recs.length);
    }
  });

  test('égalité de score → départage par identifiant croissant', () => {
    // 6 films strictement identiques sauf l'id, dans le désordre.
    const twins = [42, 7, 19, 3, 88, 11].map((id) => ({
      id, title: `Film ${id}`, genres: ['Drame'], year: 2000, rating: 4, popularity: 50,
    }));
    const recs = run(byName('Nina'), twins);
    assert.deepStrictEqual(ids(recs), [3, 7, 11, 19, 42]);
    assert.ok(recs.every((r) => r.score === recs[0].score));
  });

  test('déterministe : mêmes données → mêmes résultats', () => {
    for (const user of users) {
      assert.deepStrictEqual(run(clone(user)), run(clone(user)));
    }
  });
});

// ------------------------------------------------------------
//  Test 6 : performance
// ------------------------------------------------------------
describe('Test 6 : performance', () => {
  // Temps moyen d'un appel, mesuré sur plusieurs répétitions.
  const measure = (catalog, repeat = 20) => {
    const alice = byName('Alice');
    recommendMovies(alice, catalog, users); // échauffement
    const start = performance.now();
    for (let i = 0; i < repeat; i++) recommendMovies(alice, catalog, users);
    return (performance.now() - start) / repeat;
  };
  const bigCatalog = (size) =>
    Array.from({ length: size }, (_, i) => ({ ...movies[i % movies.length], id: i + 1 }));

  test('catalogue fourni (146 films) : moins de 10 ms par appel', (t) => {
    const ms = measure(movies);
    t.diagnostic(`146 films : ${ms.toFixed(3)} ms par appel`);
    assert.ok(ms < 10);
  });

  test('évolution avec la taille du catalogue', (t) => {
    for (const size of [1000, 5000, 20000, 50000]) {
      const ms = measure(bigCatalog(size), 5);
      t.diagnostic(`${size} films : ${ms.toFixed(2)} ms par appel`);
    }
    assert.ok(measure(bigCatalog(50000), 3) < 500, '50 000 films en moins de 500 ms');
  });
});