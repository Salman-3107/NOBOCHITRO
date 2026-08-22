const { getPool } = require('../db');

// POST /api/movies/:id/reviews   (requires auth)
// body: { rating, reviewText? }
// Because Review's PK is (UserID, MovieID), a user can only ever have
// ONE review row per movie -- so this is an "upsert": insert if it
// doesn't exist yet, update if it does (e.g. user changes their rating later).
async function upsertReview(req, res) {
  const movieId = Number(req.params.id);
  const userId = req.user.userId; // set by requireAuth middleware
  const { rating, reviewText } = req.body;

  if (!rating || rating < 1 || rating > 10) {
    return res.status(400).json({ error: 'rating must be a number between 1 and 10' });
  }

  let connection;
  try {
    connection = await getPool().getConnection();

    const existing = await connection.execute(
      `SELECT UserID FROM Review WHERE UserID = :userId AND MovieID = :movieId`,
      { userId, movieId }
    );

    if (existing.rows.length > 0) {
      await connection.execute(
        `UPDATE Review
         SET RatingValue = :rating, ReviewText = :reviewText, ReviewDate = SYSDATE
         WHERE UserID = :userId AND MovieID = :movieId`,
        { rating, reviewText: reviewText || null, userId, movieId },
        { autoCommit: true }
      );
      return res.json({ message: 'Review updated' });
    }

    await connection.execute(
      `INSERT INTO Review (UserID, MovieID, RatingValue, ReviewText, ReviewDate)
       VALUES (:userId, :movieId, :rating, :reviewText, SYSDATE)`,
      { userId, movieId, rating, reviewText: reviewText || null },
      { autoCommit: true }
    );
    res.status(201).json({ message: 'Review created' });
  } catch (err) {
    // ORA-02291: movie doesn't exist (FK violation)
    if (err.errorNum === 2291) {
      return res.status(404).json({ error: 'Movie not found' });
    }
    console.error('Upsert review error:', err);
    res.status(500).json({ error: 'Failed to save review' });
  } finally {
    if (connection) await connection.close();
  }
}

// GET /api/movies/:id/reviews
// Public: anyone can see reviews for a movie.
async function getMovieReviews(req, res) {
  const movieId = Number(req.params.id);

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `SELECT u.UserID, u.Username, u.DisplayName, r.RatingValue, r.ReviewText, r.ReviewDate
       FROM Review r
       JOIN AppUser u ON u.UserID = r.UserID
       WHERE r.MovieID = :movieId
       ORDER BY r.ReviewDate DESC`,
      { movieId }
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get movie reviews error:', err);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  } finally {
    if (connection) await connection.close();
  }
}

// DELETE /api/movies/:id/reviews   (requires auth -- deletes YOUR OWN review only)
async function deleteReview(req, res) {
  const movieId = Number(req.params.id);
  const userId = req.user.userId;

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `DELETE FROM Review WHERE UserID = :userId AND MovieID = :movieId`,
      { userId, movieId },
      { autoCommit: true }
    );

    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'No review found to delete' });
    }
    res.json({ message: 'Review deleted' });
  } catch (err) {
    console.error('Delete review error:', err);
    res.status(500).json({ error: 'Failed to delete review' });
  } finally {
    if (connection) await connection.close();
  }
}

// GET /api/users/:id/reviews  -- all reviews a given user has written
async function getUserReviews(req, res) {
  const userId = Number(req.params.id);

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `SELECT m.MovieID, m.Title, m.PosterURL, r.RatingValue, r.ReviewText, r.ReviewDate
       FROM Review r
       JOIN Movie m ON m.MovieID = r.MovieID
       WHERE r.UserID = :userId
       ORDER BY r.ReviewDate DESC`,
      { userId }
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get user reviews error:', err);
    res.status(500).json({ error: 'Failed to fetch user reviews' });
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = { upsertReview, getMovieReviews, deleteReview, getUserReviews };
