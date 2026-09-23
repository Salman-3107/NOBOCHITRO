const { getPool } = require('../db');

// POST /api/users/:id/follow  (auth)
async function followUser(req, res) {
  const followedId = Number(req.params.id);
  const followerId = req.user.userId;

  if (followedId === followerId) {
    return res.status(400).json({ error: 'You cannot follow yourself' });
  }

  let connection;
  try {
    connection = await getPool().getConnection();
    await connection.execute(
      `INSERT INTO UserFollow (FollowerID, FollowedID, FollowDate) VALUES (:followerId, :followedId, SYSDATE)`,
      { followerId, followedId }
    );

    // The "X started following you" notification is written by the database
    // itself: trigger TRG_NOTIFY_ON_FOLLOW fires on this INSERT, inside this
    // same transaction, so the follow and its notification commit (or roll
    // back) together.
    await connection.commit();

    res.status(201).json({ message: 'Now following user' });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
    // ORA-00001: composite PK (FollowerID, FollowedID) already exists -- already following
    if (err.errorNum === 1) {
      return res.status(409).json({ error: 'You already follow this user' });
    }
    // ORA-02291: FollowedID doesn't reference a real user
    if (err.errorNum === 2291) {
      return res.status(404).json({ error: 'User not found' });
    }
    console.error('Follow user error:', err);
    res.status(500).json({ error: 'Failed to follow user' });
  } finally {
    if (connection) await connection.close();
  }
}

// DELETE /api/users/:id/follow  (auth)
async function unfollowUser(req, res) {
  const followedId = Number(req.params.id);
  const followerId = req.user.userId;

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `DELETE FROM UserFollow WHERE FollowerID = :followerId AND FollowedID = :followedId`,
      { followerId, followedId }
    );
    if (result.rowsAffected === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'You do not follow this user' });
    }
    await connection.commit();
    res.json({ message: 'Unfollowed user' });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
    console.error('Unfollow user error:', err);
    res.status(500).json({ error: 'Failed to unfollow user' });
  } finally {
    if (connection) await connection.close();
  }
}

// GET /api/users/:id/followers  (auth) -- who follows this user
async function getFollowers(req, res) {
  const userId = Number(req.params.id);

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `SELECT u.UserID, u.Username, u.DisplayName, u.ProfilePictureURL, uf.FollowDate
       FROM UserFollow uf
       JOIN AppUser u ON u.UserID = uf.FollowerID
       WHERE uf.FollowedID = :userId
       ORDER BY uf.FollowDate DESC`,
      { userId }
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get followers error:', err);
    res.status(500).json({ error: 'Failed to fetch followers' });
  } finally {
    if (connection) await connection.close();
  }
}

// GET /api/users/:id/following  (auth) -- who this user follows
async function getFollowing(req, res) {
  const userId = Number(req.params.id);

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `SELECT u.UserID, u.Username, u.DisplayName, u.ProfilePictureURL, uf.FollowDate
       FROM UserFollow uf
       JOIN AppUser u ON u.UserID = uf.FollowedID
       WHERE uf.FollowerID = :userId
       ORDER BY uf.FollowDate DESC`,
      { userId }
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get following error:', err);
    res.status(500).json({ error: 'Failed to fetch following list' });
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = { followUser, unfollowUser, getFollowers, getFollowing };
