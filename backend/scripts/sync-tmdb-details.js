/*
 * Fill in the parts of the catalogue that are tedious to type by hand:
 * synopsis, trailer link, runtime, box office, and the full cast/crew list,
 * all pulled from TMDB.
 *
 * Usage:
 *   npm run sync-details                 fill only what is still empty
 *   npm run sync-details -- --replace    overwrite existing synopsis/trailer/credits
 *   npm run sync-details -- --only=42    one movie, by MovieID (handy while testing)
 *   npm run sync-details -- --cast=8     how many billed actors to keep (default 12)
 *   npm run sync-details -- --no-bio     skip the extra /person call for dob + bio
 *
 * Requires DB_* variables and TMDB_ACCESS_TOKEN in backend/.env, and the
 * columns added by database/add_tmdb_details.sql.
 * TMDB requires attribution somewhere in the app's credits.
 */
const oracledb = require('oracledb');
const { initPool, closePool, getPool } = require('../db');

const TMDB_API = 'https://api.themoviedb.org/3';
const PROFILE_BASE = 'https://image.tmdb.org/t/p/w185';
const YOUTUBE_WATCH = 'https://www.youtube.com/watch?v=';

const args = process.argv.slice(2);
const shouldReplace = args.includes('--replace');
const skipPersonBio = args.includes('--no-bio');
const onlyMovieId = readNumberFlag('--only', null);
const castLimit = readNumberFlag('--cast', 12);

// Same exception list the poster sync uses: a few display titles do not
// match TMDB's canonical title, so spell those out rather than accepting a
// loose match.
const TMDB_TITLE_ALIASES = {
  Casablanca: { title: 'Casablanca', ignoreYear: true },
  Amelie: { title: 'Amélie' },
  'Dr. Strangelove': { title: 'Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb' },
  
};

function readNumberFlag(name, fallback) {
  const match = args.find((arg) => arg.startsWith(`${name}=`));
  if (!match) return fallback;
  const value = Number(match.split('=')[1]);
  return Number.isFinite(value) ? value : fallback;
}

function pause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function normalize(text) {
  return (text || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

async function tmdb(path, params = {}) {
  const query = new URLSearchParams({ language: 'en-US', ...params });
  const response = await fetch(`${TMDB_API}${path}?${query}`, {
    headers: {
      Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}`,
      accept: 'application/json',
    },
  });
  if (response.status === 429) {
    // TMDB asks us to back off; wait and retry once.
    await pause(2000);
    return tmdb(path, params);
  }
  if (!response.ok) throw new Error(`TMDB ${path} returned ${response.status}`);
  return response.json();
}

/* ---------- matching ---------- */

async function findTmdbId(movie) {
  if (movie.TMDBID) return movie.TMDBID;

  const alias = TMDB_TITLE_ALIASES[movie.TITLE] || {};
  const lookupTitle = alias.title || movie.TITLE;
  const lookupYear = alias.year || movie.RELEASEYEAR;

  const params = { query: lookupTitle, include_adult: 'false' };
  if (!alias.ignoreYear) params.year = String(lookupYear);

  const data = await tmdb('/search/movie', params);
  const wanted = normalize(lookupTitle);
  const match = data.results?.find((result) => (
    normalize(result.title) === wanted
    && (alias.ignoreYear || result.release_date?.startsWith(String(lookupYear)))
  ));
  return match ? match.id : null;
}

/* ---------- shaping TMDB payloads ---------- */

function pickTrailer(videos) {
  const clips = (videos?.results || []).filter((v) => v.site === 'YouTube');
  const score = (clip) => (
    (clip.type === 'Trailer' ? 4 : clip.type === 'Teaser' ? 2 : 0)
    + (clip.official ? 1 : 0)
  );
  const best = clips
    .filter((clip) => score(clip) > 0)
    .sort((a, b) => score(b) - score(a) || String(b.published_at).localeCompare(String(a.published_at)))[0];
  return best ? `${YOUTUBE_WATCH}${best.key}` : null;
}

// PK on MovieCredit is (MovieID, PersonID, RoleType), so one person can hold
// each role only once per film. Dual roles get their character names merged;
// a writer credited for both "Screenplay" and "Story" collapses to one row.
function buildCredits(details) {
  const cast = (details.credits?.cast || [])
    .slice()
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, castLimit)
    .map((person, index) => ({
      tmdbId: person.id,
      name: person.name,
      photoPath: person.profile_path,
      roleType: 'Actor',
      characterName: person.character || null,
      creditOrder: index,
    }));

  const crewJobs = {
    Director: 'Director',
    Writer: 'Writer',
    Screenplay: 'Writer',
    Story: 'Writer',
    'Original Story': 'Writer',
  };
  const crew = (details.credits?.crew || [])
    .filter((person) => crewJobs[person.job])
    .map((person) => ({
      tmdbId: person.id,
      name: person.name,
      photoPath: person.profile_path,
      roleType: crewJobs[person.job],
      characterName: null,
      creditOrder: null,
    }));

  const merged = new Map();
  for (const credit of [...cast, ...crew]) {
    const key = `${credit.tmdbId}-${credit.roleType}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, credit);
    } else if (credit.characterName && existing.characterName
               && !existing.characterName.includes(credit.characterName)) {
      existing.characterName = `${existing.characterName} / ${credit.characterName}`.slice(0, 150);
    }
  }
  return [...merged.values()];
}

/* ---------- database writes ---------- */

async function upsertPerson(connection, credit) {
  const byTmdb = await connection.execute(
    'SELECT PersonID FROM Person WHERE TMDBID = :tmdbId',
    { tmdbId: credit.tmdbId }
  );
  if (byTmdb.rows.length > 0) return byTmdb.rows[0].PERSONID;

  // Someone seeded by hand before the TMDB columns existed: adopt that row
  // instead of creating a second Person with the same name.
  const byName = await connection.execute(
    'SELECT PersonID FROM Person WHERE UPPER(FullName) = UPPER(:fullName) AND TMDBID IS NULL',
    { fullName: credit.name }
  );
  if (byName.rows.length > 0) {
    const personId = byName.rows[0].PERSONID;
    await connection.execute(
      `UPDATE Person
          SET TMDBID = :tmdbId,
              PhotoURL = NVL(PhotoURL, :photoUrl)
        WHERE PersonID = :personId`,
      {
        tmdbId: credit.tmdbId,
        photoUrl: credit.photoPath ? `${PROFILE_BASE}${credit.photoPath}` : null,
        personId,
      }
    );
    return personId;
  }

  let birthday = null;
  let biography = null;
  if (!skipPersonBio) {
    try {
      const person = await tmdb(`/person/${credit.tmdbId}`);
      birthday = person.birthday || null;
      biography = person.biography ? person.biography.slice(0, 4000) : null;
      await pause(80);
    } catch (error) {
      console.warn(`    (no bio for ${credit.name}: ${error.message})`);
    }
  }

  const inserted = await connection.execute(
    `INSERT INTO Person (PersonID, FullName, DateOfBirth, Bio, PhotoURL, TMDBID)
     VALUES (seq_person.NEXTVAL, :fullName, TO_DATE(:birthday, 'YYYY-MM-DD'), :biography, :photoUrl, :tmdbId)
     RETURNING PersonID INTO :newId`,
    {
      fullName: credit.name.slice(0, 150),
      birthday,
      biography,
      photoUrl: credit.photoPath ? `${PROFILE_BASE}${credit.photoPath}` : null,
      tmdbId: credit.tmdbId,
      newId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    }
  );
  return inserted.outBinds.newId[0];
}

async function upsertCredit(connection, movieId, personId, credit) {
  const existing = await connection.execute(
    `SELECT 1 FROM MovieCredit
      WHERE MovieID = :movieId AND PersonID = :personId AND RoleType = :roleType`,
    { movieId, personId, roleType: credit.roleType }
  );

  if (existing.rows.length > 0) {
    await connection.execute(
      `UPDATE MovieCredit
          SET CharacterName = ${shouldReplace ? ':characterName' : 'NVL(CharacterName, :characterName)'},
              CreditOrder   = ${shouldReplace ? ':creditOrder' : 'NVL(CreditOrder, :creditOrder)'}
        WHERE MovieID = :movieId AND PersonID = :personId AND RoleType = :roleType`,
      {
        characterName: credit.characterName ? credit.characterName.slice(0, 150) : null,
        creditOrder: credit.creditOrder,
        movieId,
        personId,
        roleType: credit.roleType,
      }
    );
    return false;
  }

  await connection.execute(
    `INSERT INTO MovieCredit (MovieID, PersonID, RoleType, CharacterName, CreditOrder)
     VALUES (:movieId, :personId, :roleType, :characterName, :creditOrder)`,
    {
      movieId,
      personId,
      roleType: credit.roleType,
      characterName: credit.characterName ? credit.characterName.slice(0, 150) : null,
      creditOrder: credit.creditOrder,
    }
  );
  return true;
}

// Only writes columns that are still empty, unless --replace was passed, so a
// synopsis someone wrote by hand is never silently clobbered.
async function updateMovieFields(connection, movie, details) {
  const trailerUrl = pickTrailer(details.videos);
  const candidates = {
    Synopsis: details.overview || null,
    TrailerURL: trailerUrl,
    Runtime: details.runtime || null,
    Language: details.spoken_languages?.[0]?.english_name?.slice(0, 50) || null,
    Country: details.production_countries?.[0]?.name?.slice(0, 50) || null,
    BOX_OFFICE_COLLECTION: details.revenue > 0 ? details.revenue : null,
  };

  const assignments = [];
  const binds = { movieId: movie.MOVIEID, tmdbId: details.id };
  for (const [column, value] of Object.entries(candidates)) {
    if (value === null) continue;
    const bindName = column.toLowerCase();
    assignments.push(shouldReplace
      ? `${column} = :${bindName}`
      : `${column} = NVL(${column}, :${bindName})`);
    binds[bindName] = value;
  }
  assignments.push('TMDBID = :tmdbId');

  await connection.execute(
    `UPDATE Movie SET ${assignments.join(', ')} WHERE MovieID = :movieId`,
    binds
  );
  return { trailerUrl, hasSynopsis: Boolean(details.overview) };
}

/* ---------- driver ---------- */

async function syncDetails() {
  if (!process.env.TMDB_ACCESS_TOKEN || process.env.TMDB_ACCESS_TOKEN.includes('PASTE_')) {
    throw new Error('Set TMDB_ACCESS_TOKEN in backend/.env before syncing.');
  }

  await initPool();
  const connection = await getPool().getConnection();
  const summary = { movies: 0, credits: 0, trailers: 0, skipped: 0 };

  try {
    const where = onlyMovieId
      ? 'WHERE MovieID = :onlyMovieId'
      : (shouldReplace ? '' : 'WHERE Synopsis IS NULL OR TrailerURL IS NULL OR TMDBID IS NULL');

    const result = await connection.execute(
      `SELECT MovieID, Title, ReleaseYear, TMDBID
         FROM Movie ${where}
        ORDER BY MovieID`,
      onlyMovieId ? { onlyMovieId } : {}
    );

    console.log(`${result.rows.length} movie(s) to process.\n`);

    for (const movie of result.rows) {
      const label = `${movie.TITLE} (${movie.RELEASEYEAR})`;
      try {
        const tmdbId = await findTmdbId(movie);
        if (!tmdbId) {
          summary.skipped += 1;
          console.warn(`✗ ${label} — no confident TMDB match`);
          continue;
        }

        const details = await tmdb(`/movie/${tmdbId}`, { append_to_response: 'credits,videos' });
        const { trailerUrl } = await updateMovieFields(connection, movie, details);
        if (trailerUrl) summary.trailers += 1;

        if (shouldReplace) {
          await connection.execute(
            'DELETE FROM MovieCredit WHERE MovieID = :movieId',
            { movieId: movie.MOVIEID }
          );
        }

        let added = 0;
        for (const credit of buildCredits(details)) {
          const personId = await upsertPerson(connection, credit);
          if (await upsertCredit(connection, movie.MOVIEID, personId, credit)) added += 1;
        }

        await connection.commit();
        summary.movies += 1;
        summary.credits += added;
        console.log(`✓ ${label} — ${added} new credit(s)${trailerUrl ? ', trailer' : ''}${details.overview ? ', synopsis' : ''}`);
      } catch (error) {
        await connection.rollback();
        summary.skipped += 1;
        console.warn(`✗ ${label} — ${error.message}`);
      }
      await pause(160);
    }

    console.log(`\nDone. ${summary.movies} movie(s) updated, ${summary.credits} credit(s) inserted, `
      + `${summary.trailers} trailer(s) found, ${summary.skipped} skipped.`);
  } finally {
    await connection.close();
    await closePool();
  }
}

syncDetails().catch(async (error) => {
  console.error(`Detail sync failed: ${error.message}`);
  try { await closePool(); } catch { /* pool may not have opened */ }
  process.exit(1);
});
