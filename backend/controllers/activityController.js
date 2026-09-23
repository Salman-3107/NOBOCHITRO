const { getPool } = require('../db');

// GET /api/feed/activity  (auth)
// Automatic activity from people I follow: "X rated Y", "X watched Y",
// "X posted about Y" -- distinct from the manual Post feed, which only
// shows things people explicitly wrote.
async function getFollowingActivityFeed(req, res) {
  const userId = req.user.userId;

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `SELECT * FROM (
         SELECT 'Rated' AS ActivityType, r.ReviewDate AS ActivityDate,
                u.UserID, u.Username, u.DisplayName,
                m.MovieID, m.Title AS MovieTitle,
                TO_CHAR(r.RatingValue) AS ExtraInfo
         FROM Review r
         JOIN AppUser u ON u.UserID = r.UserID
         JOIN Movie m ON m.MovieID = r.MovieID
         WHERE r.UserID IN (SELECT FollowedID FROM UserFollow WHERE FollowerID = :userId)

         UNION ALL

         SELECT 'Watched' AS ActivityType, j.WatchDate AS ActivityDate,
                u.UserID, u.Username, u.DisplayName,
                m.MovieID, m.Title AS MovieTitle,
                CAST(NULL AS VARCHAR2(255)) AS ExtraInfo
         FROM JournalEntry j
         JOIN AppUser u ON u.UserID = j.UserID
         JOIN Movie m ON m.MovieID = j.MovieID
         WHERE j.UserID IN (SELECT FollowedID FROM UserFollow WHERE FollowerID = :userId)
           AND j.Privacy = 'Public'

         UNION ALL

         SELECT 'Posted' AS ActivityType, p.PostDate AS ActivityDate,
                u.UserID, u.Username, u.DisplayName,
                m.MovieID, m.Title AS MovieTitle,
                CAST(SUBSTR(p.PostText, 1, 100) AS VARCHAR2(255)) AS ExtraInfo
         FROM Post p
         JOIN AppUser u ON u.UserID = p.UserID
         JOIN Movie m ON m.MovieID = p.MovieID
         WHERE p.UserID IN (SELECT FollowedID FROM UserFollow WHERE FollowerID = :userId)
       )
       ORDER BY ActivityDate DESC
       FETCH FIRST 30 ROWS ONLY`,
      { userId }
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get activity feed error:', err);
    res.status(500).json({ error: 'Failed to fetch activity feed' });
  } finally {
    if (connection) await connection.close();
  }
}

// GET /api/users/:id/activity  (auth; the owner sees more than other users)
// A single user's own timeline -- same shape as above, but for one
// person instead of everyone they follow, and privacy-filtered the
// same way the journal endpoint is (owner sees everything).
async function getUserActivityHistory(req, res) {
  const profileUserId = Number(req.params.id);
  const viewerId = req.user ? req.user.userId : null;
  const isOwner = viewerId === profileUserId;
  const journalPrivacyFilter = isOwner ? '' : `AND Privacy = 'Public'`;

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `SELECT * FROM (
         SELECT 'Rated' AS ActivityType, r.ReviewDate AS ActivityDate,
                m.MovieID, m.Title AS MovieTitle, TO_CHAR(r.RatingValue) AS ExtraInfo
         FROM Review r
         JOIN Movie m ON m.MovieID = r.MovieID
         WHERE r.UserID = :profileUserId

         UNION ALL

         SELECT 'Watched' AS ActivityType, j.WatchDate AS ActivityDate,
                m.MovieID, m.Title AS MovieTitle, CAST(NULL AS VARCHAR2(255)) AS ExtraInfo
         FROM JournalEntry j
         JOIN Movie m ON m.MovieID = j.MovieID
         WHERE j.UserID = :profileUserId ${journalPrivacyFilter}

         UNION ALL

         SELECT 'Posted' AS ActivityType, p.PostDate AS ActivityDate,
                m.MovieID, m.Title AS MovieTitle, CAST(SUBSTR(p.PostText, 1, 100) AS VARCHAR2(255)) AS ExtraInfo
         FROM Post p
         JOIN Movie m ON m.MovieID = p.MovieID
         WHERE p.UserID = :profileUserId

         UNION ALL

         SELECT 'Added to Watchlist' AS ActivityType, bli.DateAdded AS ActivityDate,
                m.MovieID, m.Title AS MovieTitle, CAST(NULL AS VARCHAR2(255)) AS ExtraInfo
         FROM BucketListItem bli
         JOIN BucketList bl ON bl.ListID = bli.ListID
         JOIN Movie m ON m.MovieID = bli.MovieID
         WHERE bl.UserID = :profileUserId AND bl.ListType = 'System-Watchlist'
       )
       ORDER BY ActivityDate DESC
       FETCH FIRST 50 ROWS ONLY`,
      { profileUserId }
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get user activity history error:', err);
    res.status(500).json({ error: 'Failed to fetch activity history' });
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = { getFollowingActivityFeed, getUserActivityHistory };
