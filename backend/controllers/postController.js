const oracledb = require('oracledb');
const { getPool } = require('../db');
const { createNotification } = require('./notificationController');

// POST /api/posts  (auth)
// body: { movieId, postText }
// Per the schema, every post is about a specific movie.
async function createPost(req, res) {
  const userId = req.user.userId;
  const { movieId, postText } = req.body;

  if (!movieId || !postText) {
    return res.status(400).json({ error: 'movieId and postText are required' });
  }

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `INSERT INTO Post (PostID, UserID, MovieID, PostText, PostDate)
       VALUES (seq_post.NEXTVAL, :userId, :movieId, :postText, SYSDATE)
       RETURNING PostID INTO :newId`,
      {
        userId,
        movieId,
        postText,
        newId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
      { autoCommit: true }
    );
    res.status(201).json({ message: 'Post created', postId: result.outBinds.newId[0] });
  } catch (err) {
    if (err.errorNum === 2291) {
      return res.status(404).json({ error: 'Movie not found' });
    }
    console.error('Create post error:', err);
    res.status(500).json({ error: 'Failed to create post' });
  } finally {
    if (connection) await connection.close();
  }
}

// GET /api/posts  (public)
// Optional query param: ?movieId= to see posts about one movie.
// Returns like count + comment count per post via subqueries, which is
// far cheaper than joining and grouping across three tables at once.
async function listPosts(req, res) {
  const { movieId, userId } = req.query;

  let connection;
  try {
    connection = await getPool().getConnection();

    let sql = `
      SELECT p.PostID, p.PostText, p.PostDate,
             u.UserID, u.Username, u.DisplayName, u.ProfilePictureURL,
             m.MovieID, m.Title AS MovieTitle, m.PosterURL,
             (SELECT COUNT(*) FROM PostLike pl WHERE pl.PostID = p.PostID) AS LikeCount,
             (SELECT COUNT(*) FROM PostComment pc WHERE pc.PostID = p.PostID) AS CommentCount
      FROM Post p
      JOIN AppUser u ON u.UserID = p.UserID
      JOIN Movie m ON m.MovieID = p.MovieID
    `;
    const binds = {};

    const filters = [];
    if (movieId) {
      filters.push('p.MovieID = :movieId');
      binds.movieId = Number(movieId);
    }
    if (userId) {
      filters.push('p.UserID = :userId');
      binds.userId = Number(userId);
    }
    if (filters.length) sql += ` WHERE ${filters.join(' AND ')}`;

    sql += ' ORDER BY p.PostDate DESC';

    const result = await connection.execute(sql, binds);
    res.json(result.rows);
  } catch (err) {
    console.error('List posts error:', err);
    res.status(500).json({ error: 'Failed to fetch posts' });
  } finally {
    if (connection) await connection.close();
  }
}

// GET /api/posts/:id  (public) -- single post with its comments
async function getPost(req, res) {
  const postId = Number(req.params.id);

  let connection;
  try {
    connection = await getPool().getConnection();

    const postResult = await connection.execute(
      `SELECT p.PostID, p.PostText, p.PostDate,
              u.UserID, u.Username, u.DisplayName, u.ProfilePictureURL,
              m.MovieID, m.Title AS MovieTitle, m.PosterURL,
              (SELECT COUNT(*) FROM PostLike pl WHERE pl.PostID = p.PostID) AS LikeCount
       FROM Post p
       JOIN AppUser u ON u.UserID = p.UserID
       JOIN Movie m ON m.MovieID = p.MovieID
       WHERE p.PostID = :postId`,
      { postId }
    );

    if (postResult.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const commentsResult = await connection.execute(
      `SELECT c.CommentID, c.CommentText, c.CommentDate, u.UserID, u.Username, u.DisplayName, u.ProfilePictureURL
       FROM PostComment c
       JOIN AppUser u ON u.UserID = c.UserID
       WHERE c.PostID = :postId
       ORDER BY c.CommentDate ASC`,
      { postId }
    );

    res.json({ ...postResult.rows[0], comments: commentsResult.rows });
  } catch (err) {
    console.error('Get post error:', err);
    res.status(500).json({ error: 'Failed to fetch post' });
  } finally {
    if (connection) await connection.close();
  }
}

// DELETE /api/posts/:id  (auth, owner only)
async function deletePost(req, res) {
  const postId = Number(req.params.id);
  const userId = req.user.userId;

  let connection;
  try {
    connection = await getPool().getConnection();

    const ownerCheck = await connection.execute(
      `SELECT UserID FROM Post WHERE PostID = :postId`,
      { postId }
    );
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }
    if (ownerCheck.rows[0].USERID !== userId) {
      return res.status(403).json({ error: 'You can only delete your own posts' });
    }

    // PostLike and PostComment both have ON DELETE CASCADE to Post,
    // so we don't need to manually clean those up.
    await connection.execute(
      `DELETE FROM Post WHERE PostID = :postId`,
      { postId },
      { autoCommit: true }
    );
    res.json({ message: 'Post deleted' });
  } catch (err) {
    console.error('Delete post error:', err);
    res.status(500).json({ error: 'Failed to delete post' });
  } finally {
    if (connection) await connection.close();
  }
}

// POST /api/posts/:id/like  (auth)
// PostLike's primary key is (PostID, UserID), so the DB itself
// guarantees a user can only like a post once.
async function likePost(req, res) {
  const postId = Number(req.params.id);
  const userId = req.user.userId;

  let connection;
  try {
    connection = await getPool().getConnection();
    await connection.execute(
      `INSERT INTO PostLike (PostID, UserID, LikeDate) VALUES (:postId, :userId, SYSDATE)`,
      { postId, userId },
      { autoCommit: false }
    );

    const postResult = await connection.execute(
      `SELECT p.UserID AS OwnerID, u.Username FROM Post p JOIN AppUser u ON u.UserID = :userId WHERE p.PostID = :postId`,
      { userId, postId }
    );
    const ownerId = postResult.rows[0]?.OWNERID;
    const likerUsername = postResult.rows[0]?.USERNAME || 'Someone';

    // Don't notify yourself for liking your own post.
    if (ownerId && ownerId !== userId) {
      await createNotification(connection, ownerId, 'PostLike', `${likerUsername} liked your post`, postId);
    }
    await connection.commit();

    res.status(201).json({ message: 'Post liked' });
  } catch (err) {
    if (err.errorNum === 1) {
      return res.status(409).json({ error: 'You already liked this post' });
    }
    if (err.errorNum === 2291) {
      return res.status(404).json({ error: 'Post not found' });
    }
    console.error('Like post error:', err);
    res.status(500).json({ error: 'Failed to like post' });
  } finally {
    if (connection) await connection.close();
  }
}

// DELETE /api/posts/:id/like  (auth)
async function unlikePost(req, res) {
  const postId = Number(req.params.id);
  const userId = req.user.userId;

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `DELETE FROM PostLike WHERE PostID = :postId AND UserID = :userId`,
      { postId, userId },
      { autoCommit: true }
    );
    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'You have not liked this post' });
    }
    res.json({ message: 'Post unliked' });
  } catch (err) {
    console.error('Unlike post error:', err);
    res.status(500).json({ error: 'Failed to unlike post' });
  } finally {
    if (connection) await connection.close();
  }
}

// POST /api/posts/:id/comments  (auth)
// body: { commentText }
async function addComment(req, res) {
  const postId = Number(req.params.id);
  const userId = req.user.userId;
  const { commentText } = req.body;

  if (!commentText) {
    return res.status(400).json({ error: 'commentText is required' });
  }

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `INSERT INTO PostComment (CommentID, PostID, UserID, CommentText, CommentDate)
       VALUES (seq_postcomment.NEXTVAL, :postId, :userId, :commentText, SYSDATE)
       RETURNING CommentID INTO :newId`,
      {
        postId,
        userId,
        commentText,
        newId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
      { autoCommit: false }
    );

    const postResult = await connection.execute(
      `SELECT p.UserID AS OwnerID, u.Username FROM Post p JOIN AppUser u ON u.UserID = :userId WHERE p.PostID = :postId`,
      { userId, postId }
    );
    const ownerId = postResult.rows[0]?.OWNERID;
    const commenterUsername = postResult.rows[0]?.USERNAME || 'Someone';

    if (ownerId && ownerId !== userId) {
      await createNotification(connection, ownerId, 'PostComment', `${commenterUsername} commented on your post`, postId);
    }
    await connection.commit();

    res.status(201).json({ message: 'Comment added', commentId: result.outBinds.newId[0] });
  } catch (err) {
    if (err.errorNum === 2291) {
      return res.status(404).json({ error: 'Post not found' });
    }
    console.error('Add comment error:', err);
    res.status(500).json({ error: 'Failed to add comment' });
  } finally {
    if (connection) await connection.close();
  }
}

// DELETE /api/comments/:id  (auth, owner only)
async function deleteComment(req, res) {
  const commentId = Number(req.params.id);
  const userId = req.user.userId;

  let connection;
  try {
    connection = await getPool().getConnection();

    const ownerCheck = await connection.execute(
      `SELECT UserID FROM PostComment WHERE CommentID = :commentId`,
      { commentId }
    );
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    if (ownerCheck.rows[0].USERID !== userId) {
      return res.status(403).json({ error: 'You can only delete your own comments' });
    }

    await connection.execute(
      `DELETE FROM PostComment WHERE CommentID = :commentId`,
      { commentId },
      { autoCommit: true }
    );
    res.json({ message: 'Comment deleted' });
  } catch (err) {
    console.error('Delete comment error:', err);
    res.status(500).json({ error: 'Failed to delete comment' });
  } finally {
    if (connection) await connection.close();
  }
}

// GET /api/feed  (auth) -- posts from users I follow, newest first.
// This is what makes "follow" actually useful instead of just a number.
async function getFollowingFeed(req, res) {
  const userId = req.user.userId;

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `SELECT p.PostID, p.PostText, p.PostDate,
              u.UserID, u.Username, u.DisplayName, u.ProfilePictureURL,
              m.MovieID, m.Title AS MovieTitle, m.PosterURL,
              (SELECT COUNT(*) FROM PostLike pl WHERE pl.PostID = p.PostID) AS LikeCount,
              (SELECT COUNT(*) FROM PostComment pc WHERE pc.PostID = p.PostID) AS CommentCount
       FROM Post p
       JOIN AppUser u ON u.UserID = p.UserID
       JOIN Movie m ON m.MovieID = p.MovieID
       WHERE p.UserID IN (
         SELECT FollowedID FROM UserFollow WHERE FollowerID = :userId
       )
       ORDER BY p.PostDate DESC`,
      { userId }
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get following feed error:', err);
    res.status(500).json({ error: 'Failed to fetch feed' });
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = {
  createPost,
  listPosts,
  getPost,
  deletePost,
  likePost,
  unlikePost,
  addComment,
  deleteComment,
  getFollowingFeed,
};
