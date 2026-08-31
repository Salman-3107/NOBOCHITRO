/*
 * Fetch genuine poster paths from TMDB and store their CDN URLs in Movie.
 *
 * Usage: npm run sync-posters
 * Requires DB_* variables and TMDB_ACCESS_TOKEN in backend/.env.
 * Existing poster URLs are preserved; use --replace only when intentionally
 * refreshing them. TMDB requires attribution in the application's credits.
 */
const { initPool, closePool, getPool } = require('../db');

const TMDB_API = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const shouldReplace = process.argv.includes('--replace');

// A few database display titles differ from TMDB's canonical search titles.
// Keep these exceptions explicit so no loosely matched poster is ever saved.
const TMDB_TITLE_ALIASES = {
  Casablanca: { title: 'Casablanca', ignoreYear: true },
  Amelie: { title: 'Amélie' },
  'Dr. Strangelove': { title: 'Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb' },
  'Oppenheimer: The Story': { title: 'Oppenheimer', year: 2023 },
};

function pause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function findPoster(movie) {
  const alias = TMDB_TITLE_ALIASES[movie.TITLE] || {};
  const lookupTitle = alias.title || movie.TITLE;
  const lookupYear = alias.year || movie.RELEASEYEAR;
  const params = new URLSearchParams({
    query: lookupTitle,
    include_adult: 'false',
  });
  if (!alias.ignoreYear) params.set('year', String(lookupYear));
  const response = await fetch(`${TMDB_API}/search/movie?${params}`, {
    headers: {
      Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}`,
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`TMDB returned ${response.status}`);
  }

  const data = await response.json();
  const normalizedTitle = lookupTitle
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const exactMatch = data.results?.find((result) => (
    result.title?.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedTitle
    && (alias.ignoreYear || result.release_date?.startsWith(String(lookupYear)))
    && result.poster_path
  ));

  return exactMatch ? `${IMAGE_BASE}${exactMatch.poster_path}` : null;
}

async function syncPosters() {
  if (!process.env.TMDB_ACCESS_TOKEN || process.env.TMDB_ACCESS_TOKEN.includes('PASTE_')) {
    throw new Error('Set TMDB_ACCESS_TOKEN in backend/.env before syncing posters.');
  }

  await initPool();
  const connection = await getPool().getConnection();
  try {
    const result = await connection.execute(
      `SELECT MovieID, Title, ReleaseYear, PosterURL
       FROM Movie
       ${shouldReplace ? '' : 'WHERE PosterURL IS NULL'}
       ORDER BY MovieID`
    );
    const movies = result.rows;
    let updated = 0;
    let unmatched = 0;

    for (const movie of movies) {
      try {
        const posterUrl = await findPoster(movie);
        if (!posterUrl) {
          unmatched += 1;
          console.warn(`No exact TMDB poster match: ${movie.TITLE} (${movie.RELEASEYEAR})`);
        } else {
          await connection.execute(
            'UPDATE Movie SET PosterURL = :posterUrl WHERE MovieID = :movieId',
            { posterUrl, movieId: movie.MOVIEID },
            { autoCommit: false }
          );
          updated += 1;
          console.log(`✓ ${movie.TITLE}`);
        }
      } catch (error) {
        unmatched += 1;
        console.warn(`Skipped ${movie.TITLE}: ${error.message}`);
      }
      await pause(160);
    }

    await connection.commit();
    console.log(`Finished. ${updated} poster URLs saved; ${unmatched} need a manual match.`);
  } finally {
    await connection.close();
    await closePool();
  }
}

syncPosters().catch(async (error) => {
  console.error(`Poster sync failed: ${error.message}`);
  try { await closePool(); } catch { /* pool may not have opened */ }
  process.exit(1);
});
