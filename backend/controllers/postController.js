const oracledb = require('oracledb');
const { getPool } = require('../db');

// Merges two already newest-first lists into one feed where roughly `ratio`
// of every stretch comes from `primary` and the rest from `secondary` --
// e.g. ratio 0.8 reads out as "about 4 taste-matched posts, then 1 other,
// repeat". It never stalls waiting on one side: once a side runs out, the
// other simply fills the rest, so the feed is never shorter than it could be
// just to protect the ratio.
function interleaveByRatio(primary, secondary, ratio) {
  const merged = [];
  let p = 0;
  let s = 0;
  while (p < primary.length || s < secondary.length) {
    const primaryShareSoFar = merged.length === 0 ? 0 : p / merged.length;
    const takePrimary = p < primary.length && (primaryShareSoFar < ratio || s >= secondary.length);
    if (takePrimary) {
      merged.push(primary[p]);
      p += 1;
    } else {
      merged.push(secondary[s]);
      s += 1;
    }
  }
  return merged;
}

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
// Optional query params:
//   ?movieId=        -- only posts about one movie
//   ?userId=         -- only one author's posts (e.g. a profile page)
//   ?personalized=true -- rebuild the feed around the viewer's taste (see
//                         below). Ignored whenever movieId or userId is set:
//                         a single movie's wall or one person's post history
//                         is supposed to be exactly what it says, not
//                         re-sorted around a third thing.
//
// Returns like count + comment count per post via subqueries, which is
// far cheaper than joining and grouping across three tables at once.
// Also returns IsLiked for the authenticated user (global requireAuth in
// server.js guarantees req.user is set here), via an EXISTS subquery, so
// the frontend never has to guess -- or issue one request per post -- to
// know whether the viewer already liked something.
async function listPosts(req, res) {
  const { movieId, userId, personalized } = req.query;
  const currentUserId = req.user.userId;
  const wantsTasteFeed = personalized === 'true' && !movieId && !userId;

  let connection;
  try {
    connection = await getPool().getConnection();

    // "Favorite genre" is defined the same way /api/recommendations defines
    // it -- genres of movies this viewer rated 8 or higher -- so the two
    // features agree on what "your taste" means instead of drifting apart.
    let favoriteGenreIds = [];
    if (wantsTasteFeed) {
      const favoriteGenres = await connection.execute(
        `SELECT DISTINCT g.GenreID
         FROM Review r
         JOIN MovieGenre mg ON mg.MovieID = r.MovieID
         JOIN Genre g ON g.GenreID = mg.GenreID
         WHERE r.UserID = :currentUserId AND r.RatingValue >= 8`,
        { currentUserId }
      );
      favoriteGenreIds = favoriteGenres.rows.map((row) => row.GENREID);
    }

    // oracledb can't bind a JS array straight into IN (...), so build
    // ":g0, :g1, ..." placeholders the same way recommendationController does.
    const genrePlaceholders = favoriteGenreIds.map((_, i) => `:g${i}`).join(', ');
    const genreBinds = {};
    favoriteGenreIds.forEach((id, i) => { genreBinds[`g${i}`] = id; });
    const hasFavoriteGenres = favoriteGenreIds.length > 0;

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
             END AS IsLiked${hasFavoriteGenres ? `,
             CASE
                 WHEN EXISTS (
                     SELECT 1 FROM MovieGenre mgm
                     WHERE mgm.MovieID = p.MovieID AND mgm.GenreID IN (${genrePlaceholders})
                 )
                 THEN 1 ELSE 0
             END AS IsTasteMatch,
             (SELECT LISTAGG(g2.GenreName, ', ') WITHIN GROUP (ORDER BY g2.GenreName)
              FROM MovieGenre mg2 JOIN Genre g2 ON g2.GenreID = mg2.GenreID
              WHERE mg2.MovieID = p.MovieID AND mg2.GenreID IN (${genrePlaceholders})
             ) AS MatchedGenres` : ''}
      FROM Post p
      JOIN AppUser u ON u.UserID = p.UserID
      JOIN Movie m ON m.MovieID = p.MovieID
    `;
    const binds = { currentUserId, ...genreBinds };

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
    let posts = result.rows;

    // Reshuffle into ~80% taste-matched / ~20% everything-else, each half
    // staying newest-first internally. If the viewer hasn't rated anything
    // 8+ yet there's nothing to weight toward, so it falls back to plain
    // chronological -- same honest fallback /api/recommendations uses.
    if (wantsTasteFeed && hasFavoriteGenres) {
      const matching = posts.filter((post) => post.ISTASTEMATCH === 1);
      const other = posts.filter((post) => post.ISTASTEMATCH !== 1);
      posts = interleaveByRatio(matching, other, 0.8);
    }

    res.json(posts);
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