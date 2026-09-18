const { getPool } = require('../db');

// GET /api/users/:id/passport  (optional auth)
// Based entirely on Review, not JournalEntry: you can only stamp a
// country/genre/director if you actually reviewed a film from it. Review
// has no Privacy column (a review is always public), so there's no
// owner-vs-visitor split here — everyone sees the same stats for a user.
async function getMoviePassport(req, res) {
  const profileUserId = Number(req.params.id);

  let connection;
  try {
    connection = await getPool().getConnection();

    // 1. Headline counts: total distinct movies reviewed, reviewed this
    //    year, and how many different countries/languages that spans.
    const overview = await connection.execute(
      `SELECT
         COUNT(DISTINCT r.MovieID) AS TotalWatched,
         COUNT(DISTINCT CASE
                 WHEN EXTRACT(YEAR FROM r.ReviewDate) = EXTRACT(YEAR FROM SYSDATE)
                 THEN r.MovieID
               END) AS WatchedThisYear,
         COUNT(DISTINCT m.Country) AS CountriesExplored,
         COUNT(DISTINCT m.Language) AS LanguagesExplored
       FROM Review r
       JOIN Movie m ON m.MovieID = r.MovieID
       WHERE r.UserID = :profileUserId`,
      { profileUserId }
    );

    // 2. Favorite genre: the genre appearing most often among reviewed movies.
    const favoriteGenre = await connection.execute(
      `SELECT g.GenreName, COUNT(*) AS Occurrences
       FROM Review r
       JOIN MovieGenre mg ON mg.MovieID = r.MovieID
       JOIN Genre g ON g.GenreID = mg.GenreID
       WHERE r.UserID = :profileUserId
       GROUP BY g.GenreName
       ORDER BY Occurrences DESC
       FETCH FIRST 1 ROWS ONLY`,
      { profileUserId }
    );

    // 3. Favorite director: same idea, filtered to Director credits.
    const favoriteDirector = await connection.execute(
      `SELECT p.FullName, COUNT(*) AS Occurrences
       FROM Review r
       JOIN MovieCredit mc ON mc.MovieID = r.MovieID AND mc.RoleType = 'Director'
       JOIN Person p ON p.PersonID = mc.PersonID
       WHERE r.UserID = :profileUserId
       GROUP BY p.FullName
       ORDER BY Occurrences DESC
       FETCH FIRST 1 ROWS ONLY`,
      { profileUserId }
    );

    // 4. Highest rated: Review has one row per user+movie (PK is
    //    userid+movieid), so there's no rewatch count to lean on anymore —
    //    this is the review-based stand-in for the old "most rewatched" stat.
    const highestRated = await connection.execute(
      `SELECT m.Title, r.RatingValue
       FROM Review r
       JOIN Movie m ON m.MovieID = r.MovieID
       WHERE r.UserID = :profileUserId
       ORDER BY r.RatingValue DESC, r.ReviewDate DESC
       FETCH FIRST 1 ROWS ONLY`,
      { profileUserId }
    );

    // 5. Average personal rating.
    const ratingStats = await connection.execute(
      `SELECT ROUND(AVG(RatingValue), 1) AS AvgRating, COUNT(*) AS TotalRated
       FROM Review WHERE UserID = :profileUserId`,
      { profileUserId }
    );

    const countries = await connection.execute(
      `SELECT m.Country, COUNT(DISTINCT r.MovieID) AS WatchCount
       FROM Review r JOIN Movie m ON m.MovieID = r.MovieID
       WHERE r.UserID = :profileUserId AND m.Country IS NOT NULL
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
      highestRatedMovie: highestRated.rows[0]
        ? { title: highestRated.rows[0].TITLE, rating: highestRated.rows[0].RATINGVALUE }
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
// Also Review-based now: one card per reviewed movie from that country,
// each with your rating and when you posted the review.
async function getPassportCountryMovies(req, res) {
  const profileUserId = Number(req.params.id);
  const country = decodeURIComponent(req.params.country || '').trim();

  if (!Number.isInteger(profileUserId) || profileUserId < 1) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  if (!country || country.length > 50) {
    return res.status(400).json({ error: 'Invalid country' });
  }

  let connection;
  try {
    connection = await getPool().getConnection();

    const result = await connection.execute(
      `SELECT m.MovieID, m.Title, m.ReleaseYear, m.PosterURL, m.Language,
              r.RatingValue AS MyRating, r.ReviewDate AS ReviewedOn
       FROM Review r
       JOIN Movie m ON m.MovieID = r.MovieID
       WHERE r.UserID = :profileUserId
         AND UPPER(m.Country) = UPPER(:country)
       ORDER BY r.ReviewDate DESC NULLS LAST, m.Title`,
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
        myRating: row.MYRATING,
        reviewedOn: row.REVIEWEDON,
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
