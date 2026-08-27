const { getPool } = require('../db');

// GET /api/users/:id/taste-match/:otherId  (public)
//
// Algorithm: find every movie BOTH users have rated (a self-join on
// Review via MovieID), then measure how close their ratings are.
// Ratings are 1-10, so the largest possible disagreement on one movie
// is 9 points. We average that disagreement across all shared movies,
// then convert it to a 0-100% "match" score (closer ratings = higher %).
async function getTasteMatch(req, res) {
  const userIdA = Number(req.params.id);
  const userIdB = Number(req.params.otherId);

  if (userIdA === userIdB) {
    return res.status(400).json({ error: 'Provide two different user IDs' });
  }

  let connection;
  try {
    connection = await getPool().getConnection();

    const result = await connection.execute(
      `SELECT m.MovieID, m.Title, r1.RatingValue AS RatingA, r2.RatingValue AS RatingB
       FROM Review r1
       JOIN Review r2 ON r2.MovieID = r1.MovieID
       JOIN Movie m ON m.MovieID = r1.MovieID
       WHERE r1.UserID = :userIdA AND r2.UserID = :userIdB`,
      { userIdA, userIdB }
    );

    const sharedMovies = result.rows;

    if (sharedMovies.length === 0) {
      return res.json({
        userIdA,
        userIdB,
        sharedMovieCount: 0,
        tasteMatchPercent: null,
        message: 'No movies rated by both users yet -- rate some of the same movies to see a match.',
        commonlyLoved: [],
      });
    }

    const totalDifference = sharedMovies.reduce(
      (sum, row) => sum + Math.abs(row.RATINGA - row.RATINGB),
      0
    );
    const avgDifference = totalDifference / sharedMovies.length;
    const MAX_POSSIBLE_DIFFERENCE = 9; // ratings run 1-10
    const tasteMatchPercent = Math.round((1 - avgDifference / MAX_POSSIBLE_DIFFERENCE) * 100);

    // Movies both users rated highly (8+) -- a nice human-readable
    // explanation of *why* the match score is what it is.
    const commonlyLoved = sharedMovies
      .filter((row) => row.RATINGA >= 8 && row.RATINGB >= 8)
      .map((row) => ({ movieId: row.MOVIEID, title: row.TITLE }));

    res.json({
      userIdA,
      userIdB,
      sharedMovieCount: sharedMovies.length,
      tasteMatchPercent,
      commonlyLoved,
    });
  } catch (err) {
    console.error('Get taste match error:', err);
    res.status(500).json({ error: 'Failed to compute taste match' });
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = { getTasteMatch };
