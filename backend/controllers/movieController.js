const oracledb = require('oracledb');
const { getPool } = require('../db');

// GET /api/movies
// Optional query params: ?genre=Action&year=2010&search=title text
//                        &sort=popular|top_rated|recent|trending
async function listMovies(req, res) {
  const { genre, year, search, sort } = req.query;

  let connection;
  try {
    connection = await getPool().getConnection();

    let sql = `
      SELECT DISTINCT m.MovieID, m.Title, m.ReleaseYear, m.Runtime,
             m.Language, m.Country, m.PosterURL, m.BOX_OFFICE_COLLECTION,
             ROUND(AVG(r.RatingValue), 1) AS AvgRating,
             COUNT(r.RatingValue) AS RatingCount,
             (SELECT COUNT(*) FROM Review r3
              WHERE r3.MovieID = m.MovieID AND r3.ReviewDate >= SYSDATE - 30) AS RecentActivityCount
      FROM Movie m
      LEFT JOIN Review r ON r.MovieID = m.MovieID
    `;
    const binds = {};
    const conditions = [];

    if (genre) {
      sql += ` LEFT JOIN MovieGenre mg ON mg.MovieID = m.MovieID
                LEFT JOIN Genre g ON g.GenreID = mg.GenreID`;
      conditions.push('g.GenreName = :genre');
      binds.genre = genre;
    }
    if (year) {
      conditions.push('m.ReleaseYear = :year');
      binds.year = Number(year);
    }
    if (search) {
      conditions.push('UPPER(m.Title) LIKE UPPER(:search)');
      binds.search = `%${search}%`;
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += `
      GROUP BY m.MovieID, m.Title, m.ReleaseYear, m.Runtime,
               m.Language, m.Country, m.PosterURL, m.BOX_OFFICE_COLLECTION
    `;

    // Discovery sorts: popular = most-rated, top_rated = highest average
    // (community favorite), recent = newest releases, trending = most
    // review activity in the last 30 days. Default stays alphabetical
    // so existing behavior for anyone not passing ?sort= is unchanged.
    switch (sort) {
      case 'popular':
        sql += ' ORDER BY RatingCount DESC';
        break;
      case 'top_rated':
        sql += ' ORDER BY AvgRating DESC NULLS LAST';
        break;
      case 'recent':
        sql += ' ORDER BY m.ReleaseYear DESC';
        break;
      case 'trending':
        sql += ' ORDER BY RecentActivityCount DESC';
        break;
      default:
        sql += ' ORDER BY m.Title';
    }

    const result = await connection.execute(sql, binds);
    res.json(result.rows);
  } catch (err) {
    console.error('List movies error:', err);
    res.status(500).json({ error: 'Failed to fetch movies' });
  } finally {
    if (connection) await connection.close();
  }
}

// GET /api/movies/:id
// Returns movie details + genres + cast/crew + rating stats
async function getMovie(req, res) {
  const movieId = Number(req.params.id);

  let connection;
  try {
    connection = await getPool().getConnection();

    const movieResult = await connection.execute(
      `SELECT MovieID, Title, ReleaseYear, Runtime, Language, Country,
              Synopsis, PosterURL, TrailerURL, BOX_OFFICE_COLLECTION
       FROM Movie WHERE MovieID = :movieId`,
      { movieId }
    );

    if (movieResult.rows.length === 0) {
      return res.status(404).json({ error: 'Movie not found' });
    }

    const genresResult = await connection.execute(
      `SELECT g.GenreID, g.GenreName
       FROM Genre g
       JOIN MovieGenre mg ON mg.GenreID = g.GenreID
       WHERE mg.MovieID = :movieId`,
      { movieId }
    );

    // PhotoURL is what the cast rail draws; CreditOrder keeps top billing
    // first (TMDB order 0 = lead). Crew has no order, so it sorts by name.
    const creditsResult = await connection.execute(
      `SELECT p.PersonID, p.FullName, p.PhotoURL,
              mc.RoleType, mc.CharacterName, mc.CreditOrder
       FROM Person p
       JOIN MovieCredit mc ON mc.PersonID = p.PersonID
       WHERE mc.MovieID = :movieId
       ORDER BY CASE mc.RoleType
                  WHEN 'Director' THEN 1
                  WHEN 'Writer'   THEN 2
                  ELSE 3
                END,
                mc.CreditOrder NULLS LAST,
                p.FullName`,
      { movieId }
    );

    const ratingResult = await connection.execute(
      `SELECT ROUND(AVG(RatingValue), 1) AS AvgRating, COUNT(*) AS RatingCount
       FROM Review WHERE MovieID = :movieId`,
      { movieId }
    );

    res.json({
      ...movieResult.rows[0],
      genres: genresResult.rows,
      credits: creditsResult.rows,
      cast: creditsResult.rows.filter((row) => row.ROLETYPE === 'Actor'),
      crew: creditsResult.rows.filter((row) => row.ROLETYPE !== 'Actor'),
      avgRating: ratingResult.rows[0].AVGRATING,
      ratingCount: ratingResult.rows[0].RATINGCOUNT,
    });
  } catch (err) {
    console.error('Get movie error:', err);
    res.status(500).json({ error: 'Failed to fetch movie details' });
  } finally {
    if (connection) await connection.close();
  }
}

// POST /api/movies  (admin-style add, no auth wired yet — see note in routes)
// body: { title, releaseYear, runtime, language, country, synopsis, posterUrl, trailerUrl, boxOfficeCollection, genreIds: [1,2] }
async function createMovie(req, res) {
  const {
    title, releaseYear, runtime, language, country,
    synopsis, posterUrl, trailerUrl, boxOfficeCollection, genreIds,
  } = req.body;

  if (!title || !releaseYear) {
    return res.status(400).json({ error: 'title and releaseYear are required' });
  }

  let connection;
  try {
    connection = await getPool().getConnection();

    const existing = await connection.execute(
      `SELECT MovieID FROM Movie WHERE Title = :title AND ReleaseYear = :releaseYear`,
      { title, releaseYear }
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: 'A movie with this title and release year already exists',
        movieId: existing.rows[0].MOVIEID,
      });
    }

    const result = await connection.execute(
      `INSERT INTO Movie (MovieID, Title, ReleaseYear, Runtime, Language, Country, Synopsis, PosterURL, TrailerURL, BOX_OFFICE_COLLECTION)
       VALUES (seq_movie.NEXTVAL, :title, :releaseYear, :runtime, :language, :country, :synopsis, :posterUrl, :trailerUrl, :boxOfficeCollection)
       RETURNING MovieID INTO :newId`,
      {
        title,
        releaseYear,
        runtime: runtime || null,
        language: language || null,
        country: country || null,
        synopsis: synopsis || null,
        posterUrl: posterUrl || null,
        trailerUrl: trailerUrl || null,
        boxOfficeCollection: boxOfficeCollection || null,
        newId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
      { autoCommit: !genreIds || genreIds.length === 0 }
    );

    const newMovieId = result.outBinds.newId[0];

    if (genreIds && genreIds.length > 0) {
      for (const genreId of genreIds) {
        await connection.execute(
          `INSERT INTO MovieGenre (MovieID, GenreID) VALUES (:newMovieId, :genreId)`,
          { newMovieId, genreId }
        );
      }
      await connection.commit();
    }

    res.status(201).json({ message: 'Movie created', movieId: newMovieId });
  } catch (err) {
    console.error('Create movie error:', err);
    res.status(500).json({ error: 'Failed to create movie' });
  } finally {
    if (connection) await connection.close();
  }
}

// GET /api/genres
async function listGenres(req, res) {
  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `SELECT GenreID, GenreName FROM Genre ORDER BY GenreName`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('List genres error:', err);
    res.status(500).json({ error: 'Failed to fetch genres' });
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = { listMovies, getMovie, createMovie, listGenres };