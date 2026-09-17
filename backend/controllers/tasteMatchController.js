const { getPool } = require('../db');

// GET /api/users/:id/taste-match/:otherId  (public)
//
// Algorithm: find every movie BOTH users have rated (a self-join on Review
// via MovieID), then measure how close their ratings are. Ratings are 1-10,
// so the largest possible disagreement on one movie is 9 points. We average
// that disagreement across all shared movies, then convert it to a 0-100%
// "match" score (closer ratings = higher %).
async function getTasteMatch(req, res) {
  const userIdA = Number(req.params.id);
  const userIdB = Number(req.params.otherId);

  if (!Number.isInteger(userIdA) || !Number.isInteger(userIdB) || userIdA < 1 || userIdB < 1) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  if (userIdA === userIdB) {
    return res.status(400).json({ error: 'Provide two different user IDs' });
  }

  let connection;
  try {
    connection = await getPool().getConnection();

    const bothUsers = await connection.execute(
      `SELECT UserID, Username, DisplayName, ProfilePictureURL
       FROM AppUser WHERE UserID IN (:userIdA, :userIdB)`,
      { userIdA, userIdB }
    );
    if (bothUsers.rows.length < 2) {
      return res.status(404).json({ error: 'One of these users does not exist' });
    }

    const result = await connection.execute(
      `SELECT m.MovieID, m.Title, m.PosterURL, m.ReleaseYear,
              r1.RatingValue AS RatingA, r2.RatingValue AS RatingB
       FROM Review r1
       JOIN Review r2 ON r2.MovieID = r1.MovieID
       JOIN Movie m ON m.MovieID = r1.MovieID
       WHERE r1.UserID = :userIdA AND r2.UserID = :userIdB`,
      { userIdA, userIdB }
    );

    const sharedMovies = result.rows;

    // Movies B rated 8+ that A has never rated at all -- "films they think
    // you should see". An anti-join, and the most useful half of the feature.
    const recommendations = await connection.execute(
      `SELECT m.MovieID, m.Title, m.PosterURL, m.ReleaseYear, r.RatingValue
       FROM Review r
       JOIN Movie m ON m.MovieID = r.MovieID
       WHERE r.UserID = :userIdB
         AND r.RatingValue >= 8
         AND NOT EXISTS (
           SELECT 1 FROM Review mine
           WHERE mine.UserID = :userIdA AND mine.MovieID = r.MovieID
         )
       ORDER BY r.RatingValue DESC, m.Title
       FETCH FIRST 12 ROWS ONLY`,
      { userIdA, userIdB }
    );

    const shape = (row) => ({
      movieId: row.MOVIEID,
      title: row.TITLE,
      posterUrl: row.POSTERURL,
      releaseYear: row.RELEASEYEAR,
      ratingA: row.RATINGA,
      ratingB: row.RATINGB,
    });

    const theyRecommend = recommendations.rows.map((row) => ({
      movieId: row.MOVIEID,
      title: row.TITLE,
      posterUrl: row.POSTERURL,
      releaseYear: row.RELEASEYEAR,
      theirRating: row.RATINGVALUE,
    }));

    if (sharedMovies.length === 0) {
      return res.json({
        userIdA,
        userIdB,
        sharedMovieCount: 0,
        tasteMatchPercent: null,
        averageDifference: null,
        message: 'No movies rated by both users yet -- rate some of the same movies to see a match.',
        commonlyLoved: [],
        biggestDisagreements: [],
        theyRecommend,
      });
    }

    const totalDifference = sharedMovies.reduce(
      (sum, row) => sum + Math.abs(row.RATINGA - row.RATINGB),
      0
    );
    const avgDifference = totalDifference / sharedMovies.length;
    const MAX_POSSIBLE_DIFFERENCE = 9; // ratings run 1-10
    const tasteMatchPercent = Math.round((1 - avgDifference / MAX_POSSIBLE_DIFFERENCE) * 100);

    // Movies both users rated highly (8+) -- a human-readable explanation of
    // why the match score came out the way it did.
    const commonlyLoved = sharedMovies
      .filter((row) => row.RATINGA >= 8 && row.RATINGB >= 8)
      .sort((a, b) => (b.RATINGA + b.RATINGB) - (a.RATINGA + a.RATINGB))
      .slice(0, 12)
      .map(shape);

    // The opposite: where they most strongly diverge. Only counts as a real
    // disagreement once the gap is 3 points or more.
    const biggestDisagreements = sharedMovies
      .filter((row) => Math.abs(row.RATINGA - row.RATINGB) >= 3)
      .sort((a, b) => Math.abs(b.RATINGA - b.RATINGB) - Math.abs(a.RATINGA - a.RATINGB))
      .slice(0, 8)
      .map(shape);

    res.json({
      userIdA,
      userIdB,
      sharedMovieCount: sharedMovies.length,
      tasteMatchPercent,
      averageDifference: Math.round(avgDifference * 10) / 10,
      commonlyLoved,
      biggestDisagreements,
      theyRecommend,
    });
  } catch (err) {
    console.error('Get taste match error:', err);
    res.status(500).json({ error: 'Failed to compute taste match' });
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = { getTasteMatch };
