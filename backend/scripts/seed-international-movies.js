/**
 * NOBOCHITRO - International Movie Catalogue Seeder
 *
 * Adds up to 1,000 UNIQUE movies from 100 countries using TMDB Discover API.
 *
 * Requirements:
 *   - backend/.env must contain TMDB_ACCESS_TOKEN
 *   - Oracle database must be running and the NOBOCHITRO schema must exist
 *
 * Run from backend:
 *   npm run seed:international
 *
 * Notes:
 *   - TMDB is used only as the metadata source.
 *   - Movies are deduplicated by TMDB id and also checked against NOBOCHITRO
 *     by title + release year + country.
 *   - Poster URLs use TMDB's image CDN.
 *   - Runtime is left NULL because Discover does not return runtime; this avoids
 *     making 1,000 extra API requests. You can enrich selected movies later.
 */

require('dotenv').config();
const oracledb = require('oracledb');
const { initPool, closePool, getPool } = require('../db');

const TARGET_MOVIES = 1000;
const MOVIES_PER_COUNTRY = 10;
const MAX_PAGES_PER_COUNTRY = 5;

const COUNTRIES = [
  ['US', 'United States'], ['GB', 'United Kingdom'], ['FR', 'France'],
  ['DE', 'Germany'], ['IT', 'Italy'], ['ES', 'Spain'], ['IN', 'India'],
  ['JP', 'Japan'], ['KR', 'South Korea'], ['CN', 'China'], ['HK', 'Hong Kong'],
  ['TW', 'Taiwan'], ['TH', 'Thailand'], ['ID', 'Indonesia'], ['MY', 'Malaysia'],
  ['PH', 'Philippines'], ['VN', 'Vietnam'], ['BD', 'Bangladesh'], ['PK', 'Pakistan'],
  ['NP', 'Nepal'], ['LK', 'Sri Lanka'], ['IR', 'Iran'], ['IL', 'Israel'],
  ['TR', 'Turkey'], ['RU', 'Russia'], ['UA', 'Ukraine'], ['PL', 'Poland'],
  ['CZ', 'Czech Republic'], ['SK', 'Slovakia'], ['HU', 'Hungary'],
  ['RO', 'Romania'], ['BG', 'Bulgaria'], ['RS', 'Serbia'], ['HR', 'Croatia'],
  ['SI', 'Slovenia'], ['BA', 'Bosnia and Herzegovina'], ['MK', 'North Macedonia'],
  ['AL', 'Albania'], ['GR', 'Greece'], ['SE', 'Sweden'], ['NO', 'Norway'],
  ['DK', 'Denmark'], ['FI', 'Finland'], ['IS', 'Iceland'], ['IE', 'Ireland'],
  ['NL', 'Netherlands'], ['BE', 'Belgium'], ['CH', 'Switzerland'],
  ['AT', 'Austria'], ['PT', 'Portugal'], ['AR', 'Argentina'], ['BR', 'Brazil'],
  ['CL', 'Chile'], ['CO', 'Colombia'], ['MX', 'Mexico'], ['PE', 'Peru'],
  ['UY', 'Uruguay'], ['VE', 'Venezuela'], ['BO', 'Bolivia'], ['EC', 'Ecuador'],
  ['PY', 'Paraguay'], ['DO', 'Dominican Republic'], ['CU', 'Cuba'],
  ['CR', 'Costa Rica'], ['PA', 'Panama'], ['GT', 'Guatemala'], ['HN', 'Honduras'],
  ['JM', 'Jamaica'], ['ZA', 'South Africa'], ['NG', 'Nigeria'], ['GH', 'Ghana'],
  ['KE', 'Kenya'], ['TZ', 'Tanzania'], ['UG', 'Uganda'], ['ET', 'Ethiopia'],
  ['MA', 'Morocco'], ['DZ', 'Algeria'], ['TN', 'Tunisia'], ['EG', 'Egypt'],
  ['SN', 'Senegal'], ['CI', 'Ivory Coast'], ['CM', 'Cameroon'], ['RW', 'Rwanda'],
  ['AO', 'Angola'], ['MZ', 'Mozambique'], ['ZM', 'Zambia'], ['ZW', 'Zimbabwe'],
  ['NA', 'Namibia'], ['AU', 'Australia'], ['NZ', 'New Zealand'], ['CA', 'Canada'],
  ['KZ', 'Kazakhstan'], ['AZ', 'Azerbaijan'], ['AM', 'Armenia'],
  ['GE', 'Georgia'], ['MN', 'Mongolia'], ['KH', 'Cambodia'], ['MM', 'Myanmar'],
  ['LA', 'Laos'], ['SG', 'Singapore']
];

const LANGUAGE_NAMES = {
  en: 'English', bn: 'Bengali', hi: 'Hindi', ur: 'Urdu', ta: 'Tamil',
  te: 'Telugu', ml: 'Malayalam', kn: 'Kannada', mr: 'Marathi', gu: 'Gujarati',
  pa: 'Punjabi', ne: 'Nepali', si: 'Sinhala', ja: 'Japanese', ko: 'Korean',
  zh: 'Chinese', yue: 'Cantonese', th: 'Thai', id: 'Indonesian', ms: 'Malay',
  vi: 'Vietnamese', fa: 'Persian', he: 'Hebrew', tr: 'Turkish', ru: 'Russian',
  uk: 'Ukrainian', pl: 'Polish', cs: 'Czech', sk: 'Slovak', hu: 'Hungarian',
  ro: 'Romanian', bg: 'Bulgarian', sr: 'Serbian', hr: 'Croatian',
  sl: 'Slovenian', bs: 'Bosnian', mk: 'Macedonian', sq: 'Albanian',
  el: 'Greek', sv: 'Swedish', no: 'Norwegian', da: 'Danish', fi: 'Finnish',
  is: 'Icelandic', ga: 'Irish', nl: 'Dutch', fr: 'French', de: 'German',
  it: 'Italian', es: 'Spanish', pt: 'Portuguese', ar: 'Arabic',
  am: 'Amharic', sw: 'Swahili', af: 'Afrikaans', zu: 'Zulu',
  kk: 'Kazakh', az: 'Azerbaijani', hy: 'Armenian', ka: 'Georgian',
  mn: 'Mongolian', km: 'Khmer', my: 'Burmese', lo: 'Lao'
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function tmdb(path, params = {}) {
  const token = process.env.TMDB_ACCESS_TOKEN;
  if (!token) {
    throw new Error('TMDB_ACCESS_TOKEN is missing from backend/.env');
  }

  const url = new URL(`https://api.themoviedb.org/3/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  }

  for (let attempt = 1; attempt <= 4; attempt++) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      }
    });

    if (response.ok) return response.json();

    if (response.status === 429 || response.status >= 500) {
      await sleep(1000 * attempt);
      continue;
    }

    const body = await response.text();
    throw new Error(`TMDB ${response.status}: ${body.slice(0, 300)}`);
  }

  throw new Error(`TMDB request failed after retries: ${url}`);
}

async function ensureGenres(connection) {
  const genreNames = [
    'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary',
    'Drama', 'Family', 'Fantasy', 'History', 'Horror', 'Music', 'Mystery',
    'Romance', 'Science Fiction', 'TV Movie', 'Thriller', 'War', 'Western'
  ];

  for (const genreName of genreNames) {
    await connection.execute(`
      MERGE INTO Genre g
      USING (SELECT :genreName AS GenreName FROM dual) s
      ON (UPPER(g.GenreName) = UPPER(s.GenreName))
      WHEN NOT MATCHED THEN
        INSERT (GenreID, GenreName)
        VALUES (seq_genre.NEXTVAL, s.GenreName)
    `, { genreName }, { autoCommit: false });
  }

  const result = await connection.execute(
    `SELECT GenreID, GenreName FROM Genre`,
    [],
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  const map = new Map();
  for (const row of result.rows) {
    map.set(String(row.GENRENAME).toLowerCase(), row.GENREID);
  }
  return map;
}

async function movieAlreadyExists(connection, title, year) {
  const result = await connection.execute(`
    SELECT MovieID
    FROM Movie
    WHERE UPPER(Title) = UPPER(:title)
      AND ReleaseYear = :year
    FETCH FIRST 1 ROWS ONLY
  `, { title, year });

  return result.rows.length > 0;
}

async function insertMovie(connection, movie, countryName, genreMap) {
  const title = (movie.title || movie.original_title || '').trim();
  const year = Number((movie.release_date || '').slice(0, 4));

  if (!title || !Number.isInteger(year) || year < 1880) return false;
  if (await movieAlreadyExists(connection, title, year)) return false;

  const language = LANGUAGE_NAMES[movie.original_language] || movie.original_language || null;
  const synopsis = movie.overview || null;
  const posterUrl = movie.poster_path
    ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
    : null;

  const result = await connection.execute(`
    INSERT INTO Movie (
      MovieID, Title, ReleaseYear, Runtime, Language, Country,
      Synopsis, PosterURL, TrailerURL, BOX_OFFICE_COLLECTION
    )
    VALUES (
      seq_movie.NEXTVAL, :title, :year, NULL, :language, :country,
      :synopsis, :posterUrl, NULL, NULL
    )
    RETURNING MovieID INTO :movieId
  `, {
    title,
    year,
    language,
    country: countryName,
    synopsis,
    posterUrl,
    movieId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
  });

  const movieId = result.outBinds.movieId[0];

  for (const tmdbGenre of (movie.genre_ids || [])) {
    const tmdbGenreName = {
      28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
      80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
      14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
      9648: 'Mystery', 10749: 'Romance', 878: 'Science Fiction',
      10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western'
    }[tmdbGenre];

    if (!tmdbGenreName) continue;

    const genreId = genreMap.get(tmdbGenreName.toLowerCase());
    if (!genreId) continue;

    await connection.execute(`
      INSERT INTO MovieGenre (MovieID, GenreID)
      SELECT :movieId, :genreId
      FROM dual
      WHERE NOT EXISTS (
        SELECT 1 FROM MovieGenre
        WHERE MovieID = :movieId AND GenreID = :genreId
      )
    `, { movieId, genreId }, { autoCommit: false });
  }

  return true;
}

async function main() {
  console.log('🌍 NOBOCHITRO international catalogue seeder');
  console.log(`Target: ${TARGET_MOVIES} unique movies from ${COUNTRIES.length} countries`);

  if (COUNTRIES.length < 100) {
    throw new Error('Country list must contain at least 100 countries.');
  }

  await initPool();
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    const genreMap = await ensureGenres(connection);
    await connection.commit();

    const seenTmdbIds = new Set();
    let inserted = 0;

    for (const [countryCode, countryName] of COUNTRIES) {
      if (inserted >= TARGET_MOVIES) break;

      let countryInserted = 0;

      for (let page = 1; page <= MAX_PAGES_PER_COUNTRY && countryInserted < MOVIES_PER_COUNTRY; page++) {
        const data = await tmdb('discover/movie', {
          include_adult: 'false',
          include_video: 'false',
          language: 'en-US',
          sort_by: 'popularity.desc',
          page,
          with_origin_country: countryCode
        });

        for (const movie of data.results || []) {
          if (inserted >= TARGET_MOVIES) break;
          if (countryInserted >= MOVIES_PER_COUNTRY) break;
          if (seenTmdbIds.has(movie.id)) continue;

          seenTmdbIds.add(movie.id);

          const added = await insertMovie(connection, movie, countryName, genreMap);
          if (!added) continue;

          inserted++;
          countryInserted++;

          if (inserted % 25 === 0) {
            await connection.commit();
            console.log(`✓ ${inserted}/${TARGET_MOVIES} movies inserted`);
          }
        }
      }

      console.log(`  ${countryCode} ${countryName}: +${countryInserted}`);
    }

    await connection.commit();

    console.log('');
    console.log(`🎬 Finished. Added ${inserted} unique movies.`);
    console.log(`🌍 Countries processed: ${COUNTRIES.length}`);
    if (inserted < TARGET_MOVIES) {
      console.log(`⚠️ Only ${inserted} could be added. Increase MAX_PAGES_PER_COUNTRY if needed.`);
    }
  } catch (error) {
    await connection.rollback();
    console.error('❌ Seeder failed:', error.message);
    process.exitCode = 1;
  } finally {
    await connection.close();
    await closePool();
  }
}

main();
