const { getPool } = require('../db');
const { logAdminAction } = require('../utils/adminAudit');
const {
  parsePagination, resolveSort, likeTerm, paginated, parseId, parseDate,
  PAGE_CLAUSE, describeOracleError,
} = require('../utils/adminQuery');

// ============================================================
// Catalogue side of the admin dashboard: movies, genres, people, credits.
//
// Creating/updating/deleting a movie already exists (movieController.createMovie,
// adminController.updateMovie / deleteMovie) and is reused as-is -- those
// handlers are simply mounted under /api/admin/movies as well. What is added
// here is everything the admin screens need that the public API deliberately
// does not expose: pagination, moderator-grade filters, dependency counts
// before a delete, and the per-movie statistics panel.
// ============================================================

// MovieCredit.RoleType is guarded by ck_moviecredit_roletype, which allows
// exactly these three. The brief mentions Producer, Cinematographer and
// Composer as well -- adding them is a one-line schema change
// (ALTER TABLE MovieCredit DROP CONSTRAINT ck_moviecredit_roletype, then
// re-add with the wider list), not something to fake by writing values the
// database will reject. Until that change is made, the dropdown shows three.
const ROLE_TYPES = ['Actor', 'Director', 'Writer'];


// ---------- Movies ----------

// GET /api/admin/movies
// ?page= &limit= &search= &genre= &year= &language= &country= &minRating= &sort= &order=
async function listMovies(req, res) {
  const { page, limit, offset } = parsePagination(req.query);

  // Sorting is a lookup into this map, never string-concatenated from the
  // query. See utils/adminQuery.js -- an ORDER BY target cannot be a bind.
  const sort = resolveSort(
    req.query,
    {
      title: 'm.Title',
      year: 'm.ReleaseYear',
      runtime: 'm.Runtime',
      rating: 'AvgRating',
      reviews: 'ReviewCount',
      added: 'm.MovieID',
    },
    'added',
    'm.MovieID DESC'
  );

  let connection;
  try {
    connection = await getPool().getConnection();

    const conditions = [];
    const filterBinds = {};

    const search = likeTerm(req.query.search);
    if (search) {
      conditions.push(`(UPPER(m.Title) LIKE UPPER(:search) ESCAPE '\\'
                        OR UPPER(m.Language) LIKE UPPER(:search) ESCAPE '\\'
                        OR UPPER(m.Country) LIKE UPPER(:search) ESCAPE '\\')`);
      filterBinds.search = search;
    }
    if (req.query.language) {
      conditions.push('m.Language = :language');
      filterBinds.language = req.query.language;
    }
    if (req.query.country) {
      conditions.push('m.Country = :country');
      filterBinds.country = req.query.country;
    }
    const year = Number.parseInt(req.query.year, 10);
    if (Number.isInteger(year)) {
      conditions.push('m.ReleaseYear = :year');
      filterBinds.year = year;
    }
    if (req.query.genre) {
      // EXISTS rather than a join: a movie in three genres must still come
      // back once, and joining MovieGenre would otherwise triple it and
      // wreck both the count and the paging.
      conditions.push(`EXISTS (
        SELECT 1 FROM MovieGenre mg
        JOIN Genre g ON g.GenreID = mg.GenreID
        WHERE mg.MovieID = m.MovieID AND g.GenreName = :genre)`);
      filterBinds.genre = req.query.genre;
    }
    const minRating = Number.parseFloat(req.query.minRating);
    if (Number.isFinite(minRating)) {
      conditions.push(`(SELECT AVG(r2.RatingValue) FROM Review r2 WHERE r2.MovieID = m.MovieID) >= :minRating`);
      filterBinds.minRating = minRating;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await connection.execute(
      `SELECT COUNT(*) AS Total FROM Movie m ${where}`,
      filterBinds
    );

    // Average rating is DERIVED here, every time, rather than stored on Movie.
    // The schema has no AvgRating column and adding one would mean keeping a
    // denormalised value in step with every insert, update and delete on
    // Review -- the brief explicitly says not to.
    const result = await connection.execute(
      `SELECT m.MovieID, m.Title, m.ReleaseYear, m.Runtime, m.Language, m.Country,
              m.PosterURL, m.TrailerURL, m.BOX_OFFICE_COLLECTION,
              ROUND(AVG(r.RatingValue), 1) AS AvgRating,
              COUNT(r.UserID) AS RatingCount,
              -- COUNT(r.ReviewText) would be ORA-00932: Oracle refuses to
              -- aggregate a CLOB. Testing for NULL is allowed, so the CASE
              -- counts written reviews without ever touching the LOB value.
              COUNT(CASE WHEN r.ReviewText IS NOT NULL THEN 1 END) AS ReviewCount,
              (SELECT COUNT(*) FROM MovieGenre mg WHERE mg.MovieID = m.MovieID) AS GenreCount
       FROM Movie m
       LEFT JOIN Review r ON r.MovieID = m.MovieID
       ${where}
       GROUP BY m.MovieID, m.Title, m.ReleaseYear, m.Runtime, m.Language, m.Country,
                m.PosterURL, m.TrailerURL, m.BOX_OFFICE_COLLECTION
       ORDER BY ${sort.clause}
       ${PAGE_CLAUSE}`,
      { ...filterBinds, offset, limit }
    );

    res.json(paginated(
      result.rows.map((row) => ({
        movieId: row.MOVIEID,
        title: row.TITLE,
        releaseYear: row.RELEASEYEAR,
        runtime: row.RUNTIME,
        language: row.LANGUAGE,
        country: row.COUNTRY,
        posterUrl: row.POSTERURL,
        trailerUrl: row.TRAILERURL,
        boxOffice: row.BOX_OFFICE_COLLECTION,
        avgRating: row.AVGRATING,
        ratingCount: row.RATINGCOUNT,
        reviewCount: row.REVIEWCOUNT,
        genreCount: row.GENRECOUNT,
      })),
      countResult.rows[0].TOTAL,
      { page, limit }
    ));
  } catch (err) {
    console.error('Admin list movies error:', err);
    res.status(500).json({ error: 'Failed to load movies' });
  } finally {
    if (connection) await connection.close();
  }
}


// GET /api/admin/movies/filters
// Distinct values for the filter dropdowns, so the UI offers only what the
// catalogue actually contains instead of a hard-coded country list.
async function getMovieFilters(req, res) {
  let connection;
  try {
    connection = await getPool().getConnection();

    const [languages, countries, years, genres] = await Promise.all([
      connection.execute(`SELECT DISTINCT Language FROM Movie WHERE Language IS NOT NULL ORDER BY Language`),
      connection.execute(`SELECT DISTINCT Country FROM Movie WHERE Country IS NOT NULL ORDER BY Country`),
      connection.execute(`SELECT DISTINCT ReleaseYear FROM Movie WHERE ReleaseYear IS NOT NULL ORDER BY ReleaseYear DESC`),
      connection.execute(`SELECT GenreID, GenreName FROM Genre ORDER BY GenreName`),
    ]);

    res.json({
      languages: languages.rows.map((row) => row.LANGUAGE),
      countries: countries.rows.map((row) => row.COUNTRY),
      years: years.rows.map((row) => row.RELEASEYEAR),
      genres: genres.rows.map((row) => ({ genreId: row.GENREID, genreName: row.GENRENAME })),
      roleTypes: ROLE_TYPES,
    });
  } catch (err) {
    console.error('Get movie filters error:', err);
    res.status(500).json({ error: 'Failed to load filter options' });
  } finally {
    if (connection) await connection.close();
  }
}


// GET /api/admin/movies/:id
// The admin movie page: header, genres, cast & crew, statistics, recent reviews.
async function getMovieDetail(req, res) {
  const movieId = parseId(req.params.id);
  if (!movieId) return res.status(400).json({ error: 'Invalid movie id' });

  let connection;
  try {
    connection = await getPool().getConnection();

    const movie = await connection.execute(
      `SELECT MovieID, Title, ReleaseYear, Runtime, Language, Country,
              Synopsis, PosterURL, TrailerURL, BOX_OFFICE_COLLECTION
       FROM Movie WHERE MovieID = :movieId`,
      { movieId }
    );
    if (movie.rows.length === 0) {
      return res.status(404).json({ error: 'Movie not found' });
    }

    const [genres, credits, stats, recentReviews, ratingSpread] = await Promise.all([
      connection.execute(
        `SELECT g.GenreID, g.GenreName
         FROM MovieGenre mg JOIN Genre g ON g.GenreID = mg.GenreID
         WHERE mg.MovieID = :movieId ORDER BY g.GenreName`,
        { movieId }
      ),
      connection.execute(
        `SELECT mc.PersonID, mc.RoleType, mc.CharacterName, p.FullName, p.PhotoURL
         FROM MovieCredit mc JOIN Person p ON p.PersonID = mc.PersonID
         WHERE mc.MovieID = :movieId
         ORDER BY CASE mc.RoleType WHEN 'Director' THEN 1 WHEN 'Writer' THEN 2 ELSE 3 END,
                  p.FullName`,
        { movieId }
      ),
      // One round trip for every counter on the statistics panel. Each of
      // these is a different relationship in the schema, which is precisely
      // what makes them worth showing.
      connection.execute(
        `SELECT
           (SELECT COUNT(*) FROM Review WHERE MovieID = :movieId) AS RatingCount,
           (SELECT COUNT(*) FROM Review WHERE MovieID = :movieId AND ReviewText IS NOT NULL) AS ReviewCount,
           (SELECT ROUND(AVG(RatingValue), 2) FROM Review WHERE MovieID = :movieId) AS AvgRating,
           (SELECT COUNT(*) FROM BucketListItem WHERE MovieID = :movieId) AS BucketListCount,
           (SELECT COUNT(DISTINCT UserID) FROM JournalEntry WHERE MovieID = :movieId) AS WatchedByCount,
           (SELECT COUNT(*) FROM JournalEntry WHERE MovieID = :movieId) AS JournalCount,
           (SELECT COUNT(*) FROM Post WHERE MovieID = :movieId) AS PostCount
         FROM dual`,
        { movieId }
      ),
      connection.execute(
        `SELECT r.UserID, r.RatingValue, r.ReviewDate, u.Username, u.DisplayName,
                DBMS_LOB.SUBSTR(r.ReviewText, 400, 1) AS ReviewSnippet
         FROM Review r JOIN AppUser u ON u.UserID = r.UserID
         WHERE r.MovieID = :movieId
         ORDER BY r.ReviewDate DESC
         FETCH FIRST 8 ROWS ONLY`,
        { movieId }
      ),
      connection.execute(
        `SELECT s.Score, NVL(r.Total, 0) AS Total
         FROM (SELECT LEVEL AS Score FROM dual CONNECT BY LEVEL <= 10) s
         LEFT JOIN (SELECT RatingValue AS Score, COUNT(*) AS Total FROM Review
                    WHERE MovieID = :movieId GROUP BY RatingValue) r ON r.Score = s.Score
         ORDER BY s.Score`,
        { movieId }
      ),
    ]);

    const row = movie.rows[0];
    const statsRow = stats.rows[0];

    res.json({
      movie: {
        movieId: row.MOVIEID,
        title: row.TITLE,
        releaseYear: row.RELEASEYEAR,
        runtime: row.RUNTIME,
        language: row.LANGUAGE,
        country: row.COUNTRY,
        synopsis: row.SYNOPSIS,
        posterUrl: row.POSTERURL,
        trailerUrl: row.TRAILERURL,
        boxOffice: row.BOX_OFFICE_COLLECTION,
      },
      genres: genres.rows.map((genre) => ({ genreId: genre.GENREID, genreName: genre.GENRENAME })),
      credits: credits.rows.map((credit) => ({
        personId: credit.PERSONID,
        roleType: credit.ROLETYPE,
        characterName: credit.CHARACTERNAME,
        fullName: credit.FULLNAME,
        photoUrl: credit.PHOTOURL,
      })),
      stats: {
        ratingCount: statsRow.RATINGCOUNT,
        reviewCount: statsRow.REVIEWCOUNT,
        avgRating: statsRow.AVGRATING,
        bucketListCount: statsRow.BUCKETLISTCOUNT,
        watchedByCount: statsRow.WATCHEDBYCOUNT,
        journalCount: statsRow.JOURNALCOUNT,
        postCount: statsRow.POSTCOUNT,
      },
      ratingSpread: ratingSpread.rows.map((spread) => ({ score: spread.SCORE, count: spread.TOTAL })),
      recentReviews: recentReviews.rows.map((review) => ({
        userId: review.USERID,
        username: review.USERNAME,
        displayName: review.DISPLAYNAME,
        rating: review.RATINGVALUE,
        reviewDate: review.REVIEWDATE,
        snippet: review.REVIEWSNIPPET,
      })),
    });
  } catch (err) {
    console.error('Admin movie detail error:', err);
    res.status(500).json({ error: 'Failed to load movie' });
  } finally {
    if (connection) await connection.close();
  }
}


// GET /api/admin/movies/:id/dependencies
// Powers the delete confirmation modal. The admin sees exactly what the
// cascade will take with it BEFORE confirming, rather than a generic warning.
async function getMovieDependencies(req, res) {
  const movieId = parseId(req.params.id);
  if (!movieId) return res.status(400).json({ error: 'Invalid movie id' });

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `SELECT
         (SELECT COUNT(*) FROM Review WHERE MovieID = :movieId) AS Reviews,
         (SELECT COUNT(*) FROM JournalEntry WHERE MovieID = :movieId) AS JournalEntries,
         (SELECT COUNT(*) FROM BucketListItem WHERE MovieID = :movieId) AS BucketListItems,
         (SELECT COUNT(*) FROM MovieGenre WHERE MovieID = :movieId) AS Genres,
         (SELECT COUNT(*) FROM MovieCredit WHERE MovieID = :movieId) AS Credits,
         (SELECT COUNT(*) FROM Post WHERE MovieID = :movieId) AS Posts
       FROM dual`,
      { movieId }
    );

    const row = result.rows[0];
    res.json({
      // Everything except Post cascades (constraints.sql). Post.MovieID is
      // ON DELETE SET NULL, so those posts survive as untagged posts -- the
      // modal says so rather than implying they will vanish.
      cascades: [
        { label: 'Ratings & reviews', count: row.REVIEWS },
        { label: 'Journal entries', count: row.JOURNALENTRIES },
        { label: 'Bucket list entries', count: row.BUCKETLISTITEMS },
        { label: 'Genre links', count: row.GENRES },
        { label: 'Cast & crew credits', count: row.CREDITS },
      ],
      detaches: [
        { label: 'Community posts (kept, tag cleared)', count: row.POSTS },
      ],
    });
  } catch (err) {
    console.error('Movie dependency check error:', err);
    res.status(500).json({ error: 'Failed to check what depends on this movie' });
  } finally {
    if (connection) await connection.close();
  }
}


// PUT /api/admin/movies/:id/genres   body: { genreIds: [1, 4, 9] }
//
// Kept separate from updateMovie, which only touches Movie's own columns.
// Replacing the whole set is simpler and safer than diffing: MovieGenre is a
// pure bridge table with no payload, so there is nothing to lose by
// re-creating the rows, and it makes "unchecked in the UI" mean "gone" with
// no special case.
async function setMovieGenres(req, res) {
  const movieId = parseId(req.params.id);
  if (!movieId) return res.status(400).json({ error: 'Invalid movie id' });

  const { genreIds } = req.body;
  if (!Array.isArray(genreIds)) {
    return res.status(400).json({ error: 'genreIds must be an array' });
  }

  const cleanIds = [...new Set(genreIds.map(parseId).filter(Boolean))];

  let connection;
  try {
    connection = await getPool().getConnection();

    const movie = await connection.execute(
      `SELECT Title FROM Movie WHERE MovieID = :movieId`, { movieId }
    );
    if (movie.rows.length === 0) {
      return res.status(404).json({ error: 'Movie not found' });
    }

    await connection.execute(`DELETE FROM MovieGenre WHERE MovieID = :movieId`, { movieId });

    for (const genreId of cleanIds) {
      await connection.execute(
        `INSERT INTO MovieGenre (MovieID, GenreID) VALUES (:movieId, :genreId)`,
        { movieId, genreId }
      );
    }

    await logAdminAction(connection, {
      adminId: req.user.userId,
      action: 'movie.genres',
      targetType: 'Movie',
      targetId: movieId,
      targetLabel: movie.rows[0].TITLE,
      details: `${cleanIds.length} genre(s) assigned`,
    });

    // One commit for the delete, the inserts and the audit row together --
    // a failure halfway through must not leave the movie with no genres.
    await connection.commit();
    res.json({ message: 'Genres updated', genreIds: cleanIds });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
    const known = describeOracleError(err, { missingParent: 'One of those genres no longer exists.' });
    if (known) return res.status(known.status).json({ error: known.error });
    console.error('Set movie genres error:', err);
    res.status(500).json({ error: 'Failed to update genres' });
  } finally {
    if (connection) await connection.close();
  }
}


// ---------- Genres ----------

// GET /api/admin/genres
// Every genre with the number of movies attached, which is what the delete
// guard and the "Movies using this genre: 47" line both need.
async function listGenres(req, res) {
  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `SELECT g.GenreID, g.GenreName,
              (SELECT COUNT(*) FROM MovieGenre mg WHERE mg.GenreID = g.GenreID) AS MovieCount
       FROM Genre g
       ORDER BY g.GenreName`
    );
    res.json({
      available: true,
      items: result.rows.map((row) => ({
        genreId: row.GENREID,
        genreName: row.GENRENAME,
        movieCount: row.MOVIECOUNT,
      })),
    });
  } catch (err) {
    console.error('Admin list genres error:', err);
    res.status(500).json({ error: 'Failed to load genres' });
  } finally {
    if (connection) await connection.close();
  }
}

// PUT /api/admin/genres/:id   body: { genreName }
async function updateGenre(req, res) {
  const genreId = parseId(req.params.id);
  const genreName = (req.body.genreName || '').trim();

  if (!genreId) return res.status(400).json({ error: 'Invalid genre id' });
  if (!genreName) return res.status(400).json({ error: 'Genre name is required' });

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `UPDATE Genre SET GenreName = :genreName WHERE GenreID = :genreId`,
      { genreName, genreId }
    );
    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Genre not found' });
    }

    await logAdminAction(connection, {
      adminId: req.user.userId,
      action: 'genre.update',
      targetType: 'Genre',
      targetId: genreId,
      targetLabel: genreName,
    });
    await connection.commit();

    res.json({ message: 'Genre updated' });
  } catch (err) {
    const known = describeOracleError(err, { duplicate: 'A genre with that name already exists.' });
    if (known) return res.status(known.status).json({ error: known.error });
    console.error('Update genre error:', err);
    res.status(500).json({ error: 'Failed to update genre' });
  } finally {
    if (connection) await connection.close();
  }
}

// DELETE /api/admin/genres/:id
//
// fk_moviegenre_genre is ON DELETE CASCADE, so Oracle would happily wipe the
// bridge rows and silently strip the genre off every film that used it. That
// is almost never what someone clicking a delete icon means, so the count is
// checked first and the request is refused unless ?force=true is passed --
// which the UI only sends after showing how many movies are affected.
async function deleteGenre(req, res) {
  const genreId = parseId(req.params.id);
  if (!genreId) return res.status(400).json({ error: 'Invalid genre id' });

  const force = req.query.force === 'true';

  let connection;
  try {
    connection = await getPool().getConnection();

    const existing = await connection.execute(
      `SELECT g.GenreName,
              (SELECT COUNT(*) FROM MovieGenre mg WHERE mg.GenreID = g.GenreID) AS MovieCount
       FROM Genre g WHERE g.GenreID = :genreId`,
      { genreId }
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Genre not found' });
    }

    const { GENRENAME: genreName, MOVIECOUNT: movieCount } = existing.rows[0];

    if (movieCount > 0 && !force) {
      return res.status(409).json({
        error: `"${genreName}" is still used by ${movieCount} movie${movieCount === 1 ? '' : 's'}. Removing it will strip the genre from all of them.`,
        movieCount,
        requiresForce: true,
      });
    }

    await connection.execute(`DELETE FROM Genre WHERE GenreID = :genreId`, { genreId });

    await logAdminAction(connection, {
      adminId: req.user.userId,
      action: 'genre.delete',
      targetType: 'Genre',
      targetId: genreId,
      targetLabel: genreName,
      details: movieCount > 0 ? `Removed from ${movieCount} movie(s)` : null,
    });
    await connection.commit();

    res.json({ message: 'Genre deleted' });
  } catch (err) {
    const known = describeOracleError(err, {
      hasChildren: 'This genre is still referenced elsewhere and cannot be removed.',
    });
    if (known) return res.status(known.status).json({ error: known.error });
    console.error('Delete genre error:', err);
    res.status(500).json({ error: 'Failed to delete genre' });
  } finally {
    if (connection) await connection.close();
  }
}


// ---------- People ----------

// GET /api/admin/people?page=&limit=&search=&role=
async function listPeople(req, res) {
  const { page, limit, offset } = parsePagination(req.query);
  const sort = resolveSort(
    req.query,
    { name: 'p.FullName', movies: 'MovieCount', added: 'p.PersonID' },
    'name',
    'p.PersonID DESC'
  );

  let connection;
  try {
    connection = await getPool().getConnection();

    const conditions = [];
    const filterBinds = {};

    const search = likeTerm(req.query.search);
    if (search) {
      conditions.push(`UPPER(p.FullName) LIKE UPPER(:search) ESCAPE '\\'`);
      filterBinds.search = search;
    }
    if (ROLE_TYPES.includes(req.query.role)) {
      conditions.push(`EXISTS (SELECT 1 FROM MovieCredit mc
                               WHERE mc.PersonID = p.PersonID AND mc.RoleType = :role)`);
      filterBinds.role = req.query.role;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await connection.execute(
      `SELECT COUNT(*) AS Total FROM Person p ${where}`, filterBinds
    );

    // Person has no "profession" column. The roles shown in the table are
    // derived from the credits that actually exist, via LISTAGG -- which is
    // both truthful and self-maintaining.
    const result = await connection.execute(
      `SELECT p.PersonID, p.FullName, p.DateOfBirth, p.PhotoURL,
              (SELECT COUNT(DISTINCT mc.MovieID) FROM MovieCredit mc
               WHERE mc.PersonID = p.PersonID) AS MovieCount,
              (SELECT LISTAGG(RoleType, ', ') WITHIN GROUP (ORDER BY RoleType)
               FROM (SELECT DISTINCT mc2.RoleType FROM MovieCredit mc2
                     WHERE mc2.PersonID = p.PersonID)) AS Roles
       FROM Person p
       ${where}
       ORDER BY ${sort.clause}
       ${PAGE_CLAUSE}`,
      { ...filterBinds, offset, limit }
    );

    res.json(paginated(
      result.rows.map((row) => ({
        personId: row.PERSONID,
        fullName: row.FULLNAME,
        dateOfBirth: row.DATEOFBIRTH,
        photoUrl: row.PHOTOURL,
        movieCount: row.MOVIECOUNT,
        roles: row.ROLES,
      })),
      countResult.rows[0].TOTAL,
      { page, limit }
    ));
  } catch (err) {
    console.error('Admin list people error:', err);
    res.status(500).json({ error: 'Failed to load people' });
  } finally {
    if (connection) await connection.close();
  }
}

// GET /api/admin/people/:id -- profile plus their filmography
async function getPersonDetail(req, res) {
  const personId = parseId(req.params.id);
  if (!personId) return res.status(400).json({ error: 'Invalid person id' });

  let connection;
  try {
    connection = await getPool().getConnection();

    const person = await connection.execute(
      `SELECT PersonID, FullName, DateOfBirth, Bio, PhotoURL
       FROM Person WHERE PersonID = :personId`,
      { personId }
    );
    if (person.rows.length === 0) {
      return res.status(404).json({ error: 'Person not found' });
    }

    const credits = await connection.execute(
      `SELECT m.MovieID, m.Title, m.ReleaseYear, m.PosterURL,
              mc.RoleType, mc.CharacterName
       FROM MovieCredit mc JOIN Movie m ON m.MovieID = mc.MovieID
       WHERE mc.PersonID = :personId
       ORDER BY m.ReleaseYear DESC NULLS LAST, m.Title`,
      { personId }
    );

    const row = person.rows[0];
    res.json({
      person: {
        personId: row.PERSONID,
        fullName: row.FULLNAME,
        dateOfBirth: row.DATEOFBIRTH,
        bio: row.BIO,
        photoUrl: row.PHOTOURL,
      },
      credits: credits.rows.map((credit) => ({
        movieId: credit.MOVIEID,
        title: credit.TITLE,
        releaseYear: credit.RELEASEYEAR,
        posterUrl: credit.POSTERURL,
        roleType: credit.ROLETYPE,
        characterName: credit.CHARACTERNAME,
      })),
    });
  } catch (err) {
    console.error('Get person detail error:', err);
    res.status(500).json({ error: 'Failed to load person' });
  } finally {
    if (connection) await connection.close();
  }
}

// PUT /api/admin/people/:id   body: { fullName?, dateOfBirth?, bio?, photoUrl? }
async function updatePerson(req, res) {
  const personId = parseId(req.params.id);
  if (!personId) return res.status(400).json({ error: 'Invalid person id' });

  const { fullName, dateOfBirth, bio, photoUrl } = req.body;

  if (fullName !== undefined && !String(fullName).trim()) {
    return res.status(400).json({ error: 'Full name cannot be empty' });
  }

  let connection;
  try {
    connection = await getPool().getConnection();

    // NVL keeps "field not sent" distinct from "field cleared". Sending an
    // empty string deliberately blanks the column; omitting the key leaves it.
    const result = await connection.execute(
      `UPDATE Person SET
         FullName = NVL(:fullName, FullName),
         DateOfBirth = NVL(:dateOfBirth, DateOfBirth),
         Bio = NVL(:bio, Bio),
         PhotoURL = NVL(:photoUrl, PhotoURL)
       WHERE PersonID = :personId`,
      {
        fullName: fullName ? String(fullName).trim() : null,
        dateOfBirth: parseDate(dateOfBirth),
        bio: bio || null,
        photoUrl: photoUrl || null,
        personId,
      }
    );
    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Person not found' });
    }

    await logAdminAction(connection, {
      adminId: req.user.userId,
      action: 'person.update',
      targetType: 'Person',
      targetId: personId,
      targetLabel: fullName || null,
    });
    await connection.commit();

    res.json({ message: 'Person updated' });
  } catch (err) {
    const known = describeOracleError(err);
    if (known) return res.status(known.status).json({ error: known.error });
    console.error('Update person error:', err);
    res.status(500).json({ error: 'Failed to update person' });
  } finally {
    if (connection) await connection.close();
  }
}

// DELETE /api/admin/people/:id
// fk_moviecredit_person cascades, so deleting a person quietly removes them
// from every film they worked on. Same treatment as genres: count first,
// require ?force=true once the admin has been shown the number.
async function deletePerson(req, res) {
  const personId = parseId(req.params.id);
  if (!personId) return res.status(400).json({ error: 'Invalid person id' });

  const force = req.query.force === 'true';

  let connection;
  try {
    connection = await getPool().getConnection();

    const existing = await connection.execute(
      `SELECT p.FullName,
              (SELECT COUNT(*) FROM MovieCredit mc WHERE mc.PersonID = p.PersonID) AS CreditCount
       FROM Person p WHERE p.PersonID = :personId`,
      { personId }
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Person not found' });
    }

    const { FULLNAME: fullName, CREDITCOUNT: creditCount } = existing.rows[0];

    if (creditCount > 0 && !force) {
      return res.status(409).json({
        error: `${fullName} is credited on ${creditCount} movie${creditCount === 1 ? '' : 's'}. Deleting them removes those credits too.`,
        creditCount,
        requiresForce: true,
      });
    }

    await connection.execute(`DELETE FROM Person WHERE PersonID = :personId`, { personId });

    await logAdminAction(connection, {
      adminId: req.user.userId,
      action: 'person.delete',
      targetType: 'Person',
      targetId: personId,
      targetLabel: fullName,
      details: creditCount > 0 ? `${creditCount} credit(s) removed with them` : null,
    });
    await connection.commit();

    res.json({ message: 'Person deleted' });
  } catch (err) {
    const known = describeOracleError(err);
    if (known) return res.status(known.status).json({ error: known.error });
    console.error('Delete person error:', err);
    res.status(500).json({ error: 'Failed to delete person' });
  } finally {
    if (connection) await connection.close();
  }
}


// ---------- Credits (Movie <-> Person <-> Role) ----------

// GET /api/admin/credits?page=&limit=&movieId=&personId=&role=&search=
async function listCredits(req, res) {
  const { page, limit, offset } = parsePagination(req.query);
  const sort = resolveSort(
    req.query,
    { movie: 'm.Title', person: 'p.FullName', role: 'mc.RoleType', year: 'm.ReleaseYear' },
    'movie',
    'p.FullName ASC'
  );

  let connection;
  try {
    connection = await getPool().getConnection();

    const conditions = [];
    const filterBinds = {};

    const movieId = parseId(req.query.movieId);
    if (movieId) {
      conditions.push('mc.MovieID = :movieId');
      filterBinds.movieId = movieId;
    }
    const personId = parseId(req.query.personId);
    if (personId) {
      conditions.push('mc.PersonID = :personId');
      filterBinds.personId = personId;
    }
    if (ROLE_TYPES.includes(req.query.role)) {
      conditions.push('mc.RoleType = :role');
      filterBinds.role = req.query.role;
    }
    const search = likeTerm(req.query.search);
    if (search) {
      conditions.push(`(UPPER(m.Title) LIKE UPPER(:search) ESCAPE '\\'
                        OR UPPER(p.FullName) LIKE UPPER(:search) ESCAPE '\\')`);
      filterBinds.search = search;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await connection.execute(
      `SELECT COUNT(*) AS Total
       FROM MovieCredit mc
       JOIN Movie m ON m.MovieID = mc.MovieID
       JOIN Person p ON p.PersonID = mc.PersonID
       ${where}`,
      filterBinds
    );

    const result = await connection.execute(
      `SELECT mc.MovieID, mc.PersonID, mc.RoleType, mc.CharacterName,
              m.Title, m.ReleaseYear, m.PosterURL,
              p.FullName, p.PhotoURL
       FROM MovieCredit mc
       JOIN Movie m ON m.MovieID = mc.MovieID
       JOIN Person p ON p.PersonID = mc.PersonID
       ${where}
       ORDER BY ${sort.clause}
       ${PAGE_CLAUSE}`,
      { ...filterBinds, offset, limit }
    );

    res.json(paginated(
      result.rows.map((row) => ({
        movieId: row.MOVIEID,
        personId: row.PERSONID,
        roleType: row.ROLETYPE,
        characterName: row.CHARACTERNAME,
        title: row.TITLE,
        releaseYear: row.RELEASEYEAR,
        posterUrl: row.POSTERURL,
        fullName: row.FULLNAME,
        photoUrl: row.PHOTOURL,
      })),
      countResult.rows[0].TOTAL,
      { page, limit }
    ));
  } catch (err) {
    console.error('Admin list credits error:', err);
    res.status(500).json({ error: 'Failed to load credits' });
  } finally {
    if (connection) await connection.close();
  }
}

// POST /api/admin/credits   body: { movieId, personId, roleType, characterName? }
//
// The movie-scoped POST /api/movies/:id/credits already exists and still
// works; this is the flat version the Credits screen needs, where the admin
// picks the movie inside the form rather than from the URL.
async function createCredit(req, res) {
  const movieId = parseId(req.body.movieId);
  const personId = parseId(req.body.personId);
  const { roleType, characterName } = req.body;

  if (!movieId || !personId) {
    return res.status(400).json({ error: 'Pick both a movie and a person' });
  }
  if (!ROLE_TYPES.includes(roleType)) {
    return res.status(400).json({ error: `Role must be one of: ${ROLE_TYPES.join(', ')}` });
  }

  let connection;
  try {
    connection = await getPool().getConnection();

    // pk_moviecredit is (MovieID, PersonID, RoleType), so a duplicate would
    // raise ORA-00001 anyway -- but catching it here means the admin gets
    // "already credited" instead of a constraint name.
    const clash = await connection.execute(
      `SELECT 1 FROM MovieCredit
       WHERE MovieID = :movieId AND PersonID = :personId AND RoleType = :roleType`,
      { movieId, personId, roleType }
    );
    if (clash.rows.length > 0) {
      return res.status(409).json({ error: 'That person is already credited on this movie in that role.' });
    }

    await connection.execute(
      `INSERT INTO MovieCredit (MovieID, PersonID, RoleType, CharacterName)
       VALUES (:movieId, :personId, :roleType, :characterName)`,
      { movieId, personId, roleType, characterName: characterName || null }
    );

    const label = await connection.execute(
      `SELECT m.Title, p.FullName
       FROM Movie m, Person p
       WHERE m.MovieID = :movieId AND p.PersonID = :personId`,
      { movieId, personId }
    );

    await logAdminAction(connection, {
      adminId: req.user.userId,
      action: 'credit.create',
      targetType: 'Movie',
      targetId: movieId,
      targetLabel: label.rows[0]?.TITLE,
      details: `${label.rows[0]?.FULLNAME} as ${roleType}`,
    });
    await connection.commit();

    res.status(201).json({ message: 'Credit added' });
  } catch (err) {
    const known = describeOracleError(err, {
      duplicate: 'That person is already credited on this movie in that role.',
      missingParent: 'That movie or person no longer exists.',
      checkFailed: `Role must be one of: ${ROLE_TYPES.join(', ')}`,
    });
    if (known) return res.status(known.status).json({ error: known.error });
    console.error('Create credit error:', err);
    res.status(500).json({ error: 'Failed to add credit' });
  } finally {
    if (connection) await connection.close();
  }
}

// DELETE /api/admin/credits?movieId=&personId=&roleType=
// MovieCredit has a composite key, so all three parts travel as query params
// rather than pretending there is a single :id.
async function deleteCredit(req, res) {
  const movieId = parseId(req.query.movieId);
  const personId = parseId(req.query.personId);
  const { roleType } = req.query;

  if (!movieId || !personId || !ROLE_TYPES.includes(roleType)) {
    return res.status(400).json({ error: 'movieId, personId and roleType are all required' });
  }

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `DELETE FROM MovieCredit
       WHERE MovieID = :movieId AND PersonID = :personId AND RoleType = :roleType`,
      { movieId, personId, roleType }
    );
    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Credit not found' });
    }

    await logAdminAction(connection, {
      adminId: req.user.userId,
      action: 'credit.delete',
      targetType: 'Movie',
      targetId: movieId,
      details: `PersonID ${personId} removed as ${roleType}`,
    });
    await connection.commit();

    res.json({ message: 'Credit removed' });
  } catch (err) {
    console.error('Delete credit error:', err);
    res.status(500).json({ error: 'Failed to remove credit' });
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = {
  ROLE_TYPES,
  listMovies, getMovieFilters, getMovieDetail, getMovieDependencies, setMovieGenres,
  listGenres, updateGenre, deleteGenre,
  listPeople, getPersonDetail, updatePerson, deletePerson,
  listCredits, createCredit, deleteCredit,
};
