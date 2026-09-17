const { getPool } = require('../db');

// GET /api/users/:id/passport  (optional auth)
// Same privacy pattern as the journal: the owner sees stats built from
// ALL their journal entries; anyone else only sees stats built from
// their Public entries, so a private-entry count never leaks.
async function getMoviePassport(req, res) {
  const profileUserId = Number(req.params.id);
  const viewerId = req.user ? req.user.userId : null;
  const isOwner = viewerId === profileUserId;
  const privacyFilter = isOwner ? '' : `AND j.Privacy = 'Public'`;

  let connection;
  try {
    connection = await getPool().getConnection();

    // 1. Headline counts: total distinct movies watched, watched this
    //    year, and how many different countries/languages that spans.
    const overview = await connection.execute(
      `SELECT
         COUNT(DISTINCT j.MovieID) AS TotalWatched,
         COUNT(DISTINCT CASE
                 WHEN EXTRACT(YEAR FROM j.WatchDate) = EXTRACT(YEAR FROM SYSDATE)
                 THEN j.MovieID
               END) AS WatchedThisYear,
         COUNT(DISTINCT m.Country) AS CountriesExplored,
         COUNT(DISTINCT m.Language) AS LanguagesExplored
       FROM JournalEntry j
       JOIN Movie m ON m.MovieID = j.MovieID
       WHERE j.UserID = :profileUserId ${privacyFilter}`,
      { profileUserId }
    );

    // 2. Favorite genre: the genre appearing most often among watched movies.
    const favoriteGenre = await connection.execute(
      `SELECT g.GenreName, COUNT(*) AS Occurrences
       FROM JournalEntry j
       JOIN MovieGenre mg ON mg.MovieID = j.MovieID
       JOIN Genre g ON g.GenreID = mg.GenreID
       WHERE j.UserID = :profileUserId ${privacyFilter}
       GROUP BY g.GenreName
       ORDER BY Occurrences DESC
       FETCH FIRST 1 ROWS ONLY`,
      { profileUserId }
    );

    // 3. Favorite director: same idea, filtered to Director credits.
    const favoriteDirector = await connection.execute(
      `SELECT p.FullName, COUNT(*) AS Occurrences
       FROM JournalEntry j
       JOIN MovieCredit mc ON mc.MovieID = j.MovieID AND mc.RoleType = 'Director'
       JOIN Person p ON p.PersonID = mc.PersonID
       WHERE j.UserID = :profileUserId ${privacyFilter}
       GROUP BY p.FullName
       ORDER BY Occurrences DESC
       FETCH FIRST 1 ROWS ONLY`,
      { profileUserId }
    );

    // 4. Most-watched movie: the one with the most journal entries
    //    (each rewatch is its own JournalEntry row for that MovieID).
    const mostWatched = await connection.execute(
      `SELECT m.Title, COUNT(*) AS WatchCount
       FROM JournalEntry j
       JOIN Movie m ON m.MovieID = j.MovieID
       WHERE j.UserID = :profileUserId ${privacyFilter}
       GROUP BY m.Title
       ORDER BY WatchCount DESC
       FETCH FIRST 1 ROWS ONLY`,
      { profileUserId }
    );

    // 5. Average personal rating, from Review (ratings aren't
    //    privacy-gated in the schema, so no filter needed here).
    const ratingStats = await connection.execute(
      `SELECT ROUND(AVG(RatingValue), 1) AS AvgRating, COUNT(*) AS TotalRated
       FROM Review WHERE UserID = :profileUserId`,
      { profileUserId }
    );

    const countries = await connection.execute(
      `SELECT m.Country, COUNT(DISTINCT j.MovieID) AS WatchCount
       FROM JournalEntry j JOIN Movie m ON m.MovieID = j.MovieID
       WHERE j.UserID = :profileUserId ${privacyFilter} AND m.Country IS NOT NULL
       GROUP BY m.Country ORDER BY WatchCount DESC FETCH FIRST 12 ROWS ONLY`,
      { profileUserId }
    );

    res.json({
      userId: profileUserId,
      totalWatched: overview.rows[0].TOTALWATCHED,
      watchedThisYear: overview.rows[0].WATCHEDTHISYEAR,
      countriesExplored: overview.rows[0].COUNTRIESEXPLORED,
      languagesExplored: overview.rows[0].LANGUAGESEXPLORED,
      favoriteGenre: favoriteGenre.rows[0]?.GENRENAME || null,
      favoriteDirector: favoriteDirector.rows[0]?.FULLNAME || null,
      mostWatchedMovie: mostWatched.rows[0]
        ? { title: mostWatched.rows[0].TITLE, watchCount: mostWatched.rows[0].WATCHCOUNT }
        : null,
      averageRating: ratingStats.rows[0].AVGRATING,
      totalRated: ratingStats.rows[0].TOTALRATED,
      countries: countries.rows,
    });
  } catch (err) {
    console.error('Get movie passport error:', err);
    res.status(500).json({ error: 'Failed to build movie passport' });
  } finally {
    if (connection) await connection.close();
  }
}

// GET /api/users/:id/passport/countries/:country/movies  (optional auth)
// Backs the "which films stamped this country?" drawer on the passport page.
// Same privacy rule as getMoviePassport: the owner sees every entry, a
// visitor only sees the Public ones, so the counts on the stamp and the
// films listed under it always agree with each other.
async function getPassportCountryMovies(req, res) {
  const profileUserId = Number(req.params.id);
  const country = decodeURIComponent(req.params.country || '').trim();

  if (!Number.isInteger(profileUserId) || profileUserId < 1) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  if (!country || country.length > 50) {
    return res.status(400).json({ error: 'Invalid country' });
  }

  const viewerId = req.user ? req.user.userId : null;
  const isOwner = viewerId === profileUserId;
  const privacyFilter = isOwner ? '' : `AND j.Privacy = 'Public'`;

  let connection;
  try {
    connection = await getPool().getConnection();

    // Grouped by movie, not by journal entry: a film watched three times is
    // one card with WatchCount 3, not three identical cards.
    const result = await connection.execute(
      `SELECT m.MovieID, m.Title, m.ReleaseYear, m.PosterURL, m.Language,
              COUNT(j.JournalID) AS WatchCount,
              MAX(j.WatchDate) AS LastWatched,
              MAX(r.RatingValue) AS MyRating
       FROM JournalEntry j
       JOIN Movie m ON m.MovieID = j.MovieID
       LEFT JOIN Review r ON r.MovieID = j.MovieID AND r.UserID = j.UserID
       WHERE j.UserID = :profileUserId
         AND UPPER(m.Country) = UPPER(:country) ${privacyFilter}
       GROUP BY m.MovieID, m.Title, m.ReleaseYear, m.PosterURL, m.Language
       ORDER BY MAX(j.WatchDate) DESC NULLS LAST, m.Title`,
      { profileUserId, country }
    );

    res.json({
      userId: profileUserId,
      country,
      movies: result.rows.map((row) => ({
        movieId: row.MOVIEID,
        title: row.TITLE,
        releaseYear: row.RELEASEYEAR,
        posterUrl: row.POSTERURL,
        language: row.LANGUAGE,
        watchCount: row.WATCHCOUNT,
        lastWatched: row.LASTWATCHED,
        myRating: row.MYRATING,
      })),
    });
  } catch (err) {
    console.error('Get passport country movies error:', err);
    res.status(500).json({ error: 'Failed to load films for this country' });
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = { getMoviePassport, getPassportCountryMovies };
