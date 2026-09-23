const { getPool } = require('../db');

const VALID_TYPES = ['most_watched', 'most_reviewed', 'most_challenges', 'most_xp'];

// GET /api/leaderboards?type=most_watched|most_reviewed|most_challenges|most_xp  (auth)
async function getLeaderboard(req, res) {
  const type = req.query.type || 'most_watched';

  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
  }

  let sql;
  switch (type) {
    case 'most_watched':
      sql = `
        SELECT u.UserID, u.Username, u.DisplayName, COUNT(DISTINCT j.MovieID) AS Score
        FROM JournalEntry j
        JOIN AppUser u ON u.UserID = j.UserID
        GROUP BY u.UserID, u.Username, u.DisplayName
        ORDER BY Score DESC
        FETCH FIRST 10 ROWS ONLY`;
      break;
    case 'most_reviewed':
      sql = `
        SELECT u.UserID, u.Username, u.DisplayName, COUNT(*) AS Score
        FROM Review r
        JOIN AppUser u ON u.UserID = r.UserID
        GROUP BY u.UserID, u.Username, u.DisplayName
        ORDER BY Score DESC
        FETCH FIRST 10 ROWS ONLY`;
      break;
    case 'most_challenges':
      sql = `
        SELECT u.UserID, u.Username, u.DisplayName, COUNT(*) AS Score
        FROM UserChallengeProgress ucp
        JOIN AppUser u ON u.UserID = ucp.UserID
        WHERE ucp.Completed = 1
        GROUP BY u.UserID, u.Username, u.DisplayName
        ORDER BY Score DESC
        FETCH FIRST 10 ROWS ONLY`;
      break;
    case 'most_xp':
      // Total XP from completed challenges, via the stored function
      // FN_USER_TOTAL_XP (joins UserChallengeProgress to Challenge).
      sql = `
        SELECT * FROM (
          SELECT u.UserID, u.Username, u.DisplayName, FN_USER_TOTAL_XP(u.UserID) AS Score
          FROM AppUser u
          ORDER BY Score DESC
        )
        WHERE Score > 0
        FETCH FIRST 10 ROWS ONLY`;
      break;
  }

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(sql);
    res.json({ type, leaderboard: result.rows });
  } catch (err) {
    console.error('Get leaderboard error:', err);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = { getLeaderboard };
