const { getPool } = require('../db');

async function getUserProfile(req, res) {
  const userId = Number(req.params.id);
  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `SELECT u.UserID, u.Username, u.DisplayName, u.Bio, u.ProfilePictureURL, u.CoverPictureURL, u.JoinDate,
        (SELECT COUNT(*) FROM UserFollow WHERE FollowedID = u.UserID) AS Followers,
        (SELECT COUNT(*) FROM UserFollow WHERE FollowerID = u.UserID) AS Following,
        (SELECT COUNT(*) FROM JournalEntry WHERE UserID = u.UserID) AS MoviesWatched,
        (SELECT COUNT(*) FROM Review WHERE UserID = u.UserID) AS ReviewCount,
        (SELECT ROUND(AVG(RatingValue), 1) FROM Review WHERE UserID = u.UserID) AS AverageRating,
        (SELECT COUNT(*) FROM Post WHERE UserID = u.UserID) AS PostCount
       FROM AppUser u WHERE u.UserID = :userId`, { userId }
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    const favorites = await connection.execute(
      `SELECT * FROM (SELECT m.MovieID, m.Title, m.ReleaseYear, m.PosterURL, r.RatingValue
       FROM Review r JOIN Movie m ON m.MovieID = r.MovieID
       WHERE r.UserID = :userId ORDER BY r.RatingValue DESC, r.ReviewDate DESC) WHERE ROWNUM <= 4`,
      { userId }
    );
    res.json({ ...result.rows[0], favoriteMovies: favorites.rows });
  } catch (error) { console.error('Get user profile error:', error); res.status(500).json({ error: 'Failed to fetch user profile' }); }
  finally { if (connection) await connection.close(); }
}
module.exports = { getUserProfile };
