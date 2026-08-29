const { getPool } = require('../db');

// GET /api/recommendations  (auth)
//
// Algorithm (deliberately simple SQL, per the project spec -- "the
// recommendation engine does not need to be an advanced AI system"):
//   1. Find genres of movies this user rated 8 or higher.
//   2. Recommend OTHER movies in those genres that this user hasn't
//      rated yet, ordered by community average rating.
//   3. If the user hasn't rated anything 8+, fall back to simply
//      the highest-rated movies overall.
async function getRecommendations(req, res) {
  const userId = req.user.userId;

  let connection;
  try {
    connection = await getPool().getConnection();

    const favoriteGenres = await connection.execute(
      `SELECT DISTINCT g.GenreID
       FROM Review r
       JOIN MovieGenre mg ON mg.MovieID = r.MovieID
       JOIN Genre g ON g.GenreID = mg.GenreID
       WHERE r.UserID = :userId AND r.RatingValue >= 8`,
      { userId }
    );

    let result;
    if (favoriteGenres.rows.length > 0) {
      const genreIds = favoriteGenres.rows.map((r) => r.GENREID);
      // Build ":g0, :g1, ..." bind placeholders since oracledb doesn't
      // let you bind an array directly into an IN (...) clause.
      const placeholders = genreIds.map((_, i) => `:g${i}`).join(', ');
      const binds = { userId };
      genreIds.forEach((id, i) => { binds[`g${i}`] = id; });

      result = await connection.execute(
        `SELECT DISTINCT m.MovieID, m.Title, m.ReleaseYear, m.PosterURL,
                ROUND(AVG(r2.RatingValue) OVER (PARTITION BY m.MovieID), 1) AS AvgRating
         FROM Movie m
         JOIN MovieGenre mg ON mg.MovieID = m.MovieID
         LEFT JOIN Review r2 ON r2.MovieID = m.MovieID
         WHERE mg.GenreID IN (${placeholders})
           AND m.MovieID NOT IN (SELECT MovieID FROM Review WHERE UserID = :userId)
         ORDER BY AvgRating DESC NULLS LAST
         FETCH FIRST 10 ROWS ONLY`,
        binds
      );
    } else {
      // Fallback: no strong preferences yet, so just show what's popular.
      result = await connection.execute(
        `SELECT m.MovieID, m.Title, m.ReleaseYear, m.PosterURL,
                ROUND(AVG(r.RatingValue), 1) AS AvgRating
         FROM Movie m
         LEFT JOIN Review r ON r.MovieID = m.MovieID
         GROUP BY m.MovieID, m.Title, m.ReleaseYear, m.PosterURL
         ORDER BY AvgRating DESC NULLS LAST
         FETCH FIRST 10 ROWS ONLY`
      );
    }

    res.json(result.rows);
  } catch (err) {
    console.error('Get recommendations error:', err);
    res.status(500).json({ error: 'Failed to generate recommendations' });
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = { getRecommendations };
