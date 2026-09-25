const oracledb = require('oracledb');
const { getPool } = require('../db');

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
      }
    );
    await connection.commit();
    res.status(201).json({ message: 'Post created', postId: result.outBinds.newId[0] });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
    if (err.errorNum === 2291) {
      return res.status(404).json({ error: 'Movie not found' });
    }
    console.error('Create post error:', err);
    res.status(500).json({ error: 'Failed to create post' });
  } finally {
    if (connection) await connection.close();
  }
}

// GET /api/posts  (auth)
// Optional query param: ?movieId= to see posts about one movie.
// Returns like count + comment count per post via subqueries, which is
// far cheaper than joining and grouping across three tables at once.
// Also returns IsLiked for the authenticated user (global requireAuth in
// server.js guarantees req.user is set here), via an EXISTS subquery, so
// the frontend never has to guess -- or issue one request per post -- to
// know whether the viewer already liked something.
async function listPosts(req, res) {
  const { movieId, userId } = req.query;
  const currentUserId = req.user.userId;

  let connection;
  try {
    connection = await getPool().getConnection();

    let sql = `
      SELECT p.PostID, p.PostText, p.PostDate,
             u.UserID, u.Username, u.DisplayName, u.ProfilePictureURL,
             m.MovieID, m.Title AS MovieTitle, m.PosterURL,
             (SELECT COUNT(*) FROM PostLike pl WHERE pl.PostID = p.PostID) AS LikeCount,
             (SELECT COUNT(*) FROM PostComment pc WHERE pc.PostID = p.PostID) AS CommentCount,
             CASE
                 WHEN EXISTS (
                     SELECT 1 FROM PostLike pl2
                     WHERE pl2.PostID = p.PostID AND pl2.UserID = :currentUserId
                 )
                 THEN 1 ELSE 0
             END AS IsLiked
      FROM Post p
      JOIN AppUser u ON u.UserID = p.UserID
      JOIN Movie m ON m.MovieID = p.MovieID
    `;
    const binds = { currentUserId };

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

// GET /api/posts/:id  (auth) -- single post with its comments
// Returns LikeCount, CommentCount and IsLiked alongside the post itself, the
// same social-state fields listPosts() returns, so a post opened this way
// (e.g. from a notification) never appears in a different state than it
// would have in the feed.
async function getPost(req, res) {
  const postId = Number(req.params.id);
  const currentUserId = req.user.userId;

  let connection;
  try {
    connection = await getPool().getConnection();

    const postResult = await connection.execute(
      `SELECT p.PostID, p.PostText, p.PostDate,
              u.UserID, u.Username, u.DisplayName, u.ProfilePictureURL,
              m.MovieID, m.Title AS MovieTitle, m.PosterURL,
              (SELECT COUNT(*) FROM PostLike pl WHERE pl.PostID = p.PostID) AS LikeCount,
              (SELECT COUNT(*) FROM PostComment pc WHERE pc.PostID = p.PostID) AS CommentCount,
              CASE
                  WHEN EXISTS (
                      SELECT 1 FROM PostLike pl2
                      WHERE pl2.PostID = p.PostID AND pl2.UserID = :currentUserId
                  )
                  THEN 1 ELSE 0
              END AS IsLiked
       FROM Post p
       JOIN AppUser u ON u.UserID = p.UserID
       JOIN Movie m ON m.MovieID = p.MovieID
       WHERE p.PostID = :postId`,
      { postId, currentUserId }
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
      { postId }
    );
    await connection.commit();
    res.json({ message: 'Post deleted' });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
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
      { postId, userId }
    );

    // The "X liked your post" notification (skipped when you like your own
    // post) is written by trigger TRG_NOTIFY_ON_POST_LIKE inside this same
    // transaction -- like and notification commit or roll back together.
    await connection.commit();

    res.status(201).json({ message: 'Post liked' });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
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
      { postId, userId }
    );
    if (result.rowsAffected === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'You have not liked this post' });
    }
    await connection.commit();
    res.json({ message: 'Post unliked' });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
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
      }
    );

    // The "X commented on your post" notification is written by trigger
    // TRG_NOTIFY_ON_POST_COMMENT inside this same transaction.
    await connection.commit();

    res.status(201).json({ message: 'Comment added', commentId: result.outBinds.newId[0] });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
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
      { commentId }
    );
    await connection.commit();
    res.json({ message: 'Comment deleted' });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
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

// GET /api/posts/:id/likes  (auth) -- who liked this post, newest first.
// Returns the same person fields the rest of the app uses (UserID, Username,
// DisplayName, ProfilePictureURL) so the "Liked by" list can open each profile.
async function getPostLikes(req, res) {
  const postId = Number(req.params.id);

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `SELECT u.UserID, u.Username, u.DisplayName, u.ProfilePictureURL, pl.LikeDate
       FROM PostLike pl
       JOIN AppUser u ON u.UserID = pl.UserID
       WHERE pl.PostID = :postId
       ORDER BY pl.LikeDate DESC`,
      { postId }
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get post likes error:', err);
    res.status(500).json({ error: 'Failed to fetch likes' });
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
  getPostLikes,
  addComment,
  deleteComment,
  getFollowingFeed,
};