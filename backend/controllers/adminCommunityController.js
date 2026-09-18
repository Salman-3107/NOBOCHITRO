const { getPool } = require('../db');
const { logAdminAction } = require('../utils/adminAudit');
const { hasReports, featureUnavailable } = require('../utils/adminSchema');
const {
  parsePagination, resolveSort, likeTerm, paginated, parseId,
  PAGE_CLAUSE, describeOracleError,
} = require('../utils/adminQuery');

// ============================================================
// Community side of the admin dashboard: accounts, moderation queues for
// reviews/posts/comments, and the report queue.
//
// PasswordHash is never selected anywhere in this file. Not in the list, not
// in the detail view, not "just for debugging" -- the column does not leave
// the database, so there is no route by which the UI could leak it even by
// accident. (Section 14 of the brief.)
// ============================================================

const REPORT_STATUSES = ['Pending', 'Reviewed', 'Resolved', 'Rejected'];


// ---------- Users ----------

// GET /api/admin/users?page=&limit=&search=&filter=all|admins|users|recent&sort=&order=
//
// Replaces the old unpaginated listUsers, which returned every account in one
// response. The old shape (a bare array of UPPERCASE Oracle keys) is preserved
// at GET /api/admin/users/legacy for anything still depending on it.
async function listUsers(req, res) {
  const { page, limit, offset } = parsePagination(req.query);
  const sort = resolveSort(
    req.query,
    {
      username: 'u.Username',
      joined: 'u.JoinDate',
      reviews: 'ReviewCount',
      posts: 'PostCount',
      id: 'u.UserID',
    },
    'joined',
    'u.UserID DESC'
  );

  let connection;
  try {
    connection = await getPool().getConnection();

    const conditions = [];
    const filterBinds = {};

    const search = likeTerm(req.query.search);
    if (search) {
      conditions.push(`(UPPER(u.Username) LIKE UPPER(:search) ESCAPE '\\'
                        OR UPPER(u.Email) LIKE UPPER(:search) ESCAPE '\\'
                        OR UPPER(u.DisplayName) LIKE UPPER(:search) ESCAPE '\\')`);
      filterBinds.search = search;
    }

    switch (req.query.filter) {
      case 'admins': conditions.push('u.IsAdmin = 1'); break;
      case 'users': conditions.push('u.IsAdmin = 0'); break;
      case 'recent': conditions.push('u.JoinDate >= SYSDATE - 30'); break;
      default: break;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await connection.execute(
      `SELECT COUNT(*) AS Total FROM AppUser u ${where}`, filterBinds
    );

    const result = await connection.execute(
      `SELECT u.UserID, u.Username, u.DisplayName, u.Email, u.JoinDate,
              u.ProfilePictureURL, u.IsAdmin,
              (SELECT COUNT(*) FROM Review r WHERE r.UserID = u.UserID) AS ReviewCount,
              (SELECT COUNT(*) FROM Post p WHERE p.UserID = u.UserID) AS PostCount,
              (SELECT COUNT(*) FROM JournalEntry j WHERE j.UserID = u.UserID) AS JournalCount,
              (SELECT COUNT(*) FROM UserFollow f WHERE f.FollowedID = u.UserID) AS FollowerCount
       FROM AppUser u
       ${where}
       ORDER BY ${sort.clause}
       ${PAGE_CLAUSE}`,
      { ...filterBinds, offset, limit }
    );

    res.json(paginated(
      result.rows.map((row) => ({
        userId: row.USERID,
        username: row.USERNAME,
        displayName: row.DISPLAYNAME,
        email: row.EMAIL,
        joinDate: row.JOINDATE,
        profilePictureUrl: row.PROFILEPICTUREURL,
        isAdmin: row.ISADMIN === 1,
        reviewCount: row.REVIEWCOUNT,
        postCount: row.POSTCOUNT,
        journalCount: row.JOURNALCOUNT,
        followerCount: row.FOLLOWERCOUNT,
      })),
      countResult.rows[0].TOTAL,
      { page, limit }
    ));
  } catch (err) {
    console.error('Admin list users error:', err);
    res.status(500).json({ error: 'Failed to load users' });
  } finally {
    if (connection) await connection.close();
  }
}


// GET /api/admin/users/:id -- profile, full statistics, recent activity
async function getUserDetail(req, res) {
  const userId = parseId(req.params.id);
  if (!userId) return res.status(400).json({ error: 'Invalid user id' });

  let connection;
  try {
    connection = await getPool().getConnection();

    const user = await connection.execute(
      `SELECT UserID, Username, DisplayName, Email, JoinDate, Bio,
              ProfilePictureURL, CoverPictureURL, IsAdmin
       FROM AppUser WHERE UserID = :userId`,
      { userId }
    );
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const [stats, recentActivity] = await Promise.all([
      connection.execute(
        `SELECT
           (SELECT COUNT(*) FROM Review WHERE UserID = :userId) AS Ratings,
           (SELECT COUNT(*) FROM Review WHERE UserID = :userId AND ReviewText IS NOT NULL) AS Reviews,
           (SELECT COUNT(*) FROM Post WHERE UserID = :userId) AS Posts,
           (SELECT COUNT(*) FROM PostComment WHERE UserID = :userId) AS Comments,
           (SELECT COUNT(*) FROM UserFollow WHERE FollowedID = :userId) AS Followers,
           (SELECT COUNT(*) FROM UserFollow WHERE FollowerID = :userId) AS Following,
           (SELECT COUNT(DISTINCT MovieID) FROM JournalEntry WHERE UserID = :userId) AS MoviesWatched,
           (SELECT COUNT(*) FROM JournalEntry WHERE UserID = :userId) AS JournalEntries,
           (SELECT COUNT(*) FROM BucketListItem bli
             JOIN BucketList bl ON bl.ListID = bli.ListID
            WHERE bl.UserID = :userId) AS BucketListItems,
           (SELECT COUNT(*) FROM UserChallengeProgress WHERE UserID = :userId) AS ChallengesJoined,
           (SELECT COUNT(*) FROM UserChallengeProgress WHERE UserID = :userId AND Completed = 1) AS ChallengesCompleted,
           (SELECT ROUND(AVG(RatingValue), 2) FROM Review WHERE UserID = :userId) AS AvgRating
         FROM dual`,
        { userId }
      ),
      connection.execute(
        `SELECT * FROM (
           SELECT 'review' AS Kind, r.ReviewDate AS Occurred, m.Title AS Label,
                  TO_CHAR(r.RatingValue) AS Detail, m.MovieID AS TargetID
           FROM Review r JOIN Movie m ON m.MovieID = r.MovieID
           WHERE r.UserID = :userId
           ORDER BY r.ReviewDate DESC FETCH FIRST 10 ROWS ONLY
         )
         UNION ALL
         SELECT * FROM (
           SELECT 'post', p.PostDate, NVL(m.Title, 'Untagged post'),
                  CAST(NULL AS VARCHAR2(20)), p.PostID
           FROM Post p LEFT JOIN Movie m ON m.MovieID = p.MovieID
           WHERE p.UserID = :userId
           ORDER BY p.PostDate DESC FETCH FIRST 10 ROWS ONLY
         )
         UNION ALL
         SELECT * FROM (
           SELECT 'journal', j.WatchDate, m.Title,
                  CAST(NULL AS VARCHAR2(20)), m.MovieID
           FROM JournalEntry j JOIN Movie m ON m.MovieID = j.MovieID
           WHERE j.UserID = :userId AND j.WatchDate IS NOT NULL
           ORDER BY j.WatchDate DESC FETCH FIRST 10 ROWS ONLY
         )
         ORDER BY Occurred DESC
         FETCH FIRST 15 ROWS ONLY`,
        { userId }
      ),
    ]);

    const row = user.rows[0];
    const statsRow = stats.rows[0];

    res.json({
      user: {
        userId: row.USERID,
        username: row.USERNAME,
        displayName: row.DISPLAYNAME,
        email: row.EMAIL,
        joinDate: row.JOINDATE,
        bio: row.BIO,
        profilePictureUrl: row.PROFILEPICTUREURL,
        coverPictureUrl: row.COVERPICTUREURL,
        isAdmin: row.ISADMIN === 1,
      },
      stats: {
        ratings: statsRow.RATINGS,
        reviews: statsRow.REVIEWS,
        posts: statsRow.POSTS,
        comments: statsRow.COMMENTS,
        followers: statsRow.FOLLOWERS,
        following: statsRow.FOLLOWING,
        moviesWatched: statsRow.MOVIESWATCHED,
        journalEntries: statsRow.JOURNALENTRIES,
        bucketListItems: statsRow.BUCKETLISTITEMS,
        challengesJoined: statsRow.CHALLENGESJOINED,
        challengesCompleted: statsRow.CHALLENGESCOMPLETED,
        avgRating: statsRow.AVGRATING,
      },
      recentActivity: recentActivity.rows.map((activity) => ({
        kind: activity.KIND,
        occurred: activity.OCCURRED,
        label: activity.LABEL,
        detail: activity.DETAIL,
        targetId: activity.TARGETID,
      })),
    });
  } catch (err) {
    console.error('Get user detail error:', err);
    res.status(500).json({ error: 'Failed to load user' });
  } finally {
    if (connection) await connection.close();
  }
}


// PUT /api/admin/users/:id   body: { displayName?, email?, bio? }
//
// Username is deliberately not editable: it is the account's public handle,
// it is carried in uq_appuser_username, and other users refer to people by it.
// Passwords are not touched here at all -- an admin resetting someone's
// password is a separate flow with its own confirmation, not a field on an
// edit form.
async function updateUser(req, res) {
  const userId = parseId(req.params.id);
  if (!userId) return res.status(400).json({ error: 'Invalid user id' });

  const { displayName, email, bio } = req.body;

  if (email !== undefined) {
    const looksLikeEmail = typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    if (!looksLikeEmail) {
      return res.status(400).json({ error: 'Enter a valid email address', field: 'email' });
    }
  }

  let connection;
  try {
    connection = await getPool().getConnection();

    const result = await connection.execute(
      `UPDATE AppUser SET
         DisplayName = NVL(:displayName, DisplayName),
         Email = NVL(:email, Email),
         Bio = NVL(:bio, Bio)
       WHERE UserID = :userId`,
      {
        displayName: displayName ? String(displayName).trim() : null,
        email: email ? String(email).trim() : null,
        bio: bio || null,
        userId,
      }
    );
    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    await logAdminAction(connection, {
      adminId: req.user.userId,
      action: 'user.update',
      targetType: 'User',
      targetId: userId,
      targetLabel: displayName || email || `User ${userId}`,
    });
    await connection.commit();

    res.json({ message: 'User updated' });
  } catch (err) {
    const known = describeOracleError(err, { duplicate: 'That email is already in use by another account.' });
    // `field` tells the form which input to highlight -- the only thing that
    // can collide here is the email, which carries uq_appuser_email.
    if (known) return res.status(known.status).json({ error: known.error, field: 'email' });
    console.error('Admin update user error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  } finally {
    if (connection) await connection.close();
  }
}


// GET /api/admin/users/:id/dependencies -- what a delete would take with it
async function getUserDependencies(req, res) {
  const userId = parseId(req.params.id);
  if (!userId) return res.status(400).json({ error: 'Invalid user id' });

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `SELECT
         (SELECT COUNT(*) FROM Review WHERE UserID = :userId) AS Reviews,
         (SELECT COUNT(*) FROM Post WHERE UserID = :userId) AS Posts,
         (SELECT COUNT(*) FROM PostComment WHERE UserID = :userId) AS Comments,
         (SELECT COUNT(*) FROM JournalEntry WHERE UserID = :userId) AS JournalEntries,
         (SELECT COUNT(*) FROM BucketList WHERE UserID = :userId) AS BucketLists,
         (SELECT COUNT(*) FROM UserChallengeProgress WHERE UserID = :userId) AS ChallengeProgress,
         (SELECT COUNT(*) FROM UserFollow WHERE FollowerID = :userId OR FollowedID = :userId) AS FollowLinks,
         (SELECT COUNT(*) FROM Notification WHERE UserID = :userId) AS Notifications
       FROM dual`,
      { userId }
    );

    const row = result.rows[0];
    res.json({
      // Every one of these FKs is ON DELETE CASCADE in constraints.sql /
      // add_userfollow.sql / add_notifications.sql, so all of it really does
      // go. The modal lists the numbers so the decision is informed.
      cascades: [
        { label: 'Ratings & reviews', count: row.REVIEWS },
        { label: 'Posts', count: row.POSTS },
        { label: 'Comments', count: row.COMMENTS },
        { label: 'Journal entries', count: row.JOURNALENTRIES },
        { label: 'Bucket lists', count: row.BUCKETLISTS },
        { label: 'Challenge progress', count: row.CHALLENGEPROGRESS },
        { label: 'Follow relationships', count: row.FOLLOWLINKS },
        { label: 'Notifications', count: row.NOTIFICATIONS },
      ],
      detaches: [],
    });
  } catch (err) {
    console.error('User dependency check error:', err);
    res.status(500).json({ error: 'Failed to check what depends on this account' });
  } finally {
    if (connection) await connection.close();
  }
}


// DELETE /api/admin/users/:id
async function deleteUser(req, res) {
  const userId = parseId(req.params.id);
  if (!userId) return res.status(400).json({ error: 'Invalid user id' });

  // Two guards, both about not locking anyone out of their own system:
  // deleting yourself ends your session mid-request, and deleting the last
  // admin leaves the platform with no way back in short of editing the
  // database by hand. These mirror the guards already in setUserRole.
  if (userId === req.user.userId) {
    return res.status(400).json({ error: 'You cannot delete your own account from the admin panel.' });
  }

  let connection;
  try {
    connection = await getPool().getConnection();

    const target = await connection.execute(
      `SELECT Username, IsAdmin FROM AppUser WHERE UserID = :userId`, { userId }
    );
    if (target.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (target.rows[0].ISADMIN === 1) {
      const adminCount = await connection.execute(
        `SELECT COUNT(*) AS Total FROM AppUser WHERE IsAdmin = 1`
      );
      if (adminCount.rows[0].TOTAL <= 1) {
        return res.status(409).json({ error: 'Cannot delete the only remaining admin account.' });
      }
    }

    const username = target.rows[0].USERNAME;

    await connection.execute(`DELETE FROM AppUser WHERE UserID = :userId`, { userId });

    // Logged before the commit, on the same connection, so the record of the
    // deletion is part of the same transaction as the deletion itself.
    await logAdminAction(connection, {
      adminId: req.user.userId,
      action: 'user.delete',
      targetType: 'User',
      targetId: userId,
      targetLabel: username,
    });
    await connection.commit();

    res.json({ message: `Account "${username}" deleted` });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
    const known = describeOracleError(err, {
      hasChildren: 'This account still has records that block deletion.',
    });
    if (known) return res.status(known.status).json({ error: known.error });
    console.error('Admin delete user error:', err);
    res.status(500).json({ error: 'Failed to delete account' });
  } finally {
    if (connection) await connection.close();
  }
}


// ---------- Review moderation ----------

// GET /api/admin/reviews?page=&limit=&movieId=&userId=&rating=&hasText=&search=
async function listReviews(req, res) {
  const { page, limit, offset } = parsePagination(req.query);
  const sort = resolveSort(
    req.query,
    { date: 'r.ReviewDate', rating: 'r.RatingValue', movie: 'm.Title', user: 'u.Username' },
    'date',
    'r.UserID DESC'
  );

  let connection;
  try {
    connection = await getPool().getConnection();

    const conditions = [];
    const filterBinds = {};

    const movieId = parseId(req.query.movieId);
    if (movieId) { conditions.push('r.MovieID = :movieId'); filterBinds.movieId = movieId; }

    const userId = parseId(req.query.userId);
    if (userId) { conditions.push('r.UserID = :userId'); filterBinds.userId = userId; }

    const rating = Number.parseInt(req.query.rating, 10);
    if (Number.isInteger(rating) && rating >= 1 && rating <= 10) {
      conditions.push('r.RatingValue = :rating');
      filterBinds.rating = rating;
    }
    if (req.query.hasText === 'true') conditions.push('r.ReviewText IS NOT NULL');
    if (req.query.hasText === 'false') conditions.push('r.ReviewText IS NULL');

    const search = likeTerm(req.query.search);
    if (search) {
      conditions.push(`(UPPER(m.Title) LIKE UPPER(:search) ESCAPE '\\'
                        OR UPPER(u.Username) LIKE UPPER(:search) ESCAPE '\\'
                        OR UPPER(DBMS_LOB.SUBSTR(r.ReviewText, 3000, 1)) LIKE UPPER(:search) ESCAPE '\\')`);
      filterBinds.search = search;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await connection.execute(
      `SELECT COUNT(*) AS Total
       FROM Review r JOIN AppUser u ON u.UserID = r.UserID JOIN Movie m ON m.MovieID = r.MovieID
       ${where}`,
      filterBinds
    );

    // The full ReviewText is a CLOB and this is a list view -- DBMS_LOB.SUBSTR
    // caps what crosses the wire at a readable preview instead of shipping
    // 200 full essays to render 200 table rows.
    const result = await connection.execute(
      `SELECT r.UserID, r.MovieID, r.RatingValue, r.ReviewDate,
              DBMS_LOB.SUBSTR(r.ReviewText, 500, 1) AS ReviewSnippet,
              u.Username, u.DisplayName, u.ProfilePictureURL,
              m.Title, m.ReleaseYear, m.PosterURL
       FROM Review r
       JOIN AppUser u ON u.UserID = r.UserID
       JOIN Movie m ON m.MovieID = r.MovieID
       ${where}
       ORDER BY ${sort.clause}
       ${PAGE_CLAUSE}`,
      { ...filterBinds, offset, limit }
    );

    res.json(paginated(
      result.rows.map((row) => ({
        userId: row.USERID,
        movieId: row.MOVIEID,
        rating: row.RATINGVALUE,
        reviewDate: row.REVIEWDATE,
        snippet: row.REVIEWSNIPPET,
        username: row.USERNAME,
        displayName: row.DISPLAYNAME,
        profilePictureUrl: row.PROFILEPICTUREURL,
        title: row.TITLE,
        releaseYear: row.RELEASEYEAR,
        posterUrl: row.POSTERURL,
      })),
      countResult.rows[0].TOTAL,
      { page, limit }
    ));
  } catch (err) {
    console.error('Admin list reviews error:', err);
    res.status(500).json({ error: 'Failed to load reviews' });
  } finally {
    if (connection) await connection.close();
  }
}


// ---------- Post & comment moderation ----------

// GET /api/admin/posts?page=&limit=&userId=&movieId=&search=
async function listPosts(req, res) {
  const { page, limit, offset } = parsePagination(req.query);
  const sort = resolveSort(
    req.query,
    { date: 'p.PostDate', likes: 'LikeCount', comments: 'CommentCount', user: 'u.Username' },
    'date',
    'p.PostID DESC'
  );

  let connection;
  try {
    connection = await getPool().getConnection();

    const conditions = [];
    const filterBinds = {};

    const userId = parseId(req.query.userId);
    if (userId) { conditions.push('p.UserID = :userId'); filterBinds.userId = userId; }

    const movieId = parseId(req.query.movieId);
    if (movieId) { conditions.push('p.MovieID = :movieId'); filterBinds.movieId = movieId; }

    const search = likeTerm(req.query.search);
    if (search) {
      conditions.push(`(UPPER(u.Username) LIKE UPPER(:search) ESCAPE '\\'
                        OR UPPER(DBMS_LOB.SUBSTR(p.PostText, 3000, 1)) LIKE UPPER(:search) ESCAPE '\\')`);
      filterBinds.search = search;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await connection.execute(
      `SELECT COUNT(*) AS Total FROM Post p JOIN AppUser u ON u.UserID = p.UserID ${where}`,
      filterBinds
    );

    const result = await connection.execute(
      `SELECT p.PostID, p.PostDate, p.MovieID,
              DBMS_LOB.SUBSTR(p.PostText, 400, 1) AS Preview,
              u.UserID, u.Username, u.DisplayName, u.ProfilePictureURL,
              m.Title, m.PosterURL,
              (SELECT COUNT(*) FROM PostLike pl WHERE pl.PostID = p.PostID) AS LikeCount,
              (SELECT COUNT(*) FROM PostComment pc WHERE pc.PostID = p.PostID) AS CommentCount
       FROM Post p
       JOIN AppUser u ON u.UserID = p.UserID
       LEFT JOIN Movie m ON m.MovieID = p.MovieID
       ${where}
       ORDER BY ${sort.clause}
       ${PAGE_CLAUSE}`,
      { ...filterBinds, offset, limit }
    );

    res.json(paginated(
      result.rows.map((row) => ({
        postId: row.POSTID,
        postDate: row.POSTDATE,
        movieId: row.MOVIEID,
        preview: row.PREVIEW,
        userId: row.USERID,
        username: row.USERNAME,
        displayName: row.DISPLAYNAME,
        profilePictureUrl: row.PROFILEPICTUREURL,
        title: row.TITLE,
        posterUrl: row.POSTERURL,
        likeCount: row.LIKECOUNT,
        commentCount: row.COMMENTCOUNT,
      })),
      countResult.rows[0].TOTAL,
      { page, limit }
    ));
  } catch (err) {
    console.error('Admin list posts error:', err);
    res.status(500).json({ error: 'Failed to load posts' });
  } finally {
    if (connection) await connection.close();
  }
}

// GET /api/admin/comments?page=&limit=&postId=&userId=&search=
async function listComments(req, res) {
  const { page, limit, offset } = parsePagination(req.query);
  const sort = resolveSort(
    req.query,
    { date: 'c.CommentDate', user: 'u.Username' },
    'date',
    'c.CommentID DESC'
  );

  let connection;
  try {
    connection = await getPool().getConnection();

    const conditions = [];
    const filterBinds = {};

    const postId = parseId(req.query.postId);
    if (postId) { conditions.push('c.PostID = :postId'); filterBinds.postId = postId; }

    const userId = parseId(req.query.userId);
    if (userId) { conditions.push('c.UserID = :userId'); filterBinds.userId = userId; }

    const search = likeTerm(req.query.search);
    if (search) {
      conditions.push(`(UPPER(u.Username) LIKE UPPER(:search) ESCAPE '\\'
                        OR UPPER(DBMS_LOB.SUBSTR(c.CommentText, 3000, 1)) LIKE UPPER(:search) ESCAPE '\\')`);
      filterBinds.search = search;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await connection.execute(
      `SELECT COUNT(*) AS Total FROM PostComment c JOIN AppUser u ON u.UserID = c.UserID ${where}`,
      filterBinds
    );

    const result = await connection.execute(
      `SELECT c.CommentID, c.PostID, c.CommentDate,
              DBMS_LOB.SUBSTR(c.CommentText, 400, 1) AS Preview,
              u.UserID, u.Username, u.DisplayName, u.ProfilePictureURL,
              DBMS_LOB.SUBSTR(p.PostText, 120, 1) AS PostPreview,
              pu.Username AS PostAuthor
       FROM PostComment c
       JOIN AppUser u ON u.UserID = c.UserID
       JOIN Post p ON p.PostID = c.PostID
       JOIN AppUser pu ON pu.UserID = p.UserID
       ${where}
       ORDER BY ${sort.clause}
       ${PAGE_CLAUSE}`,
      { ...filterBinds, offset, limit }
    );

    res.json(paginated(
      result.rows.map((row) => ({
        commentId: row.COMMENTID,
        postId: row.POSTID,
        commentDate: row.COMMENTDATE,
        preview: row.PREVIEW,
        userId: row.USERID,
        username: row.USERNAME,
        displayName: row.DISPLAYNAME,
        profilePictureUrl: row.PROFILEPICTUREURL,
        postPreview: row.POSTPREVIEW,
        postAuthor: row.POSTAUTHOR,
      })),
      countResult.rows[0].TOTAL,
      { page, limit }
    ));
  } catch (err) {
    console.error('Admin list comments error:', err);
    res.status(500).json({ error: 'Failed to load comments' });
  } finally {
    if (connection) await connection.close();
  }
}


// ---------- Reports ----------
//
// ContentReport comes from admin_dashboard_extensions.sql. When it hasn't
// been applied, these answer `available: false` with the reason, and the
// Reports page renders the migration instructions instead of an error.

// GET /api/admin/reports?page=&limit=&status=&targetType=
async function listReports(req, res) {
  const { page, limit, offset } = parsePagination(req.query);

  let connection;
  try {
    connection = await getPool().getConnection();

    if (!(await hasReports(connection))) {
      return featureUnavailable(res, 'Report queue');
    }

    const conditions = [];
    const filterBinds = {};

    if (REPORT_STATUSES.includes(req.query.status)) {
      conditions.push('cr.Status = :status');
      filterBinds.status = req.query.status;
    }
    if (['Post', 'Comment', 'Review', 'User'].includes(req.query.targetType)) {
      conditions.push('cr.TargetType = :targetType');
      filterBinds.targetType = req.query.targetType;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await connection.execute(
      `SELECT COUNT(*) AS Total FROM ContentReport cr ${where}`, filterBinds
    );

    const result = await connection.execute(
      `SELECT cr.ReportID, cr.TargetType, cr.TargetID, cr.Reason, cr.Status,
              cr.CreatedDate, cr.ResolvedDate, cr.ResolutionNote,
              DBMS_LOB.SUBSTR(cr.Details, 400, 1) AS Details,
              reporter.UserID AS ReporterID, reporter.Username AS ReporterName,
              target.UserID AS TargetUserID, target.Username AS TargetUserName,
              resolver.Username AS ResolvedByName
       FROM ContentReport cr
       JOIN AppUser reporter ON reporter.UserID = cr.ReporterID
       LEFT JOIN AppUser target ON target.UserID = cr.TargetUserID
       LEFT JOIN AppUser resolver ON resolver.UserID = cr.ResolvedBy
       ${where}
       ORDER BY CASE cr.Status WHEN 'Pending' THEN 0 ELSE 1 END,
                cr.CreatedDate DESC
       ${PAGE_CLAUSE}`,
      { ...filterBinds, offset, limit }
    );

    res.json(paginated(
      result.rows.map((row) => ({
        reportId: row.REPORTID,
        targetType: row.TARGETTYPE,
        targetId: row.TARGETID,
        reason: row.REASON,
        details: row.DETAILS,
        status: row.STATUS,
        createdDate: row.CREATEDDATE,
        resolvedDate: row.RESOLVEDDATE,
        resolutionNote: row.RESOLUTIONNOTE,
        reporterId: row.REPORTERID,
        reporterName: row.REPORTERNAME,
        targetUserId: row.TARGETUSERID,
        targetUserName: row.TARGETUSERNAME,
        resolvedByName: row.RESOLVEDBYNAME,
      })),
      countResult.rows[0].TOTAL,
      { page, limit }
    ));
  } catch (err) {
    console.error('Admin list reports error:', err);
    res.status(500).json({ error: 'Failed to load reports' });
  } finally {
    if (connection) await connection.close();
  }
}

// GET /api/admin/reports/:id/content
// Fetches the reported item itself so a moderator can read it before acting,
// rather than deciding from the reason string alone.
async function getReportedContent(req, res) {
  const reportId = parseId(req.params.id);
  if (!reportId) return res.status(400).json({ error: 'Invalid report id' });

  let connection;
  try {
    connection = await getPool().getConnection();

    if (!(await hasReports(connection))) {
      return featureUnavailable(res, 'Report queue');
    }

    const report = await connection.execute(
      `SELECT TargetType, TargetID FROM ContentReport WHERE ReportID = :reportId`,
      { reportId }
    );
    if (report.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const { TARGETTYPE: targetType, TARGETID: targetId } = report.rows[0];
    let content = null;

    if (targetType === 'Post') {
      const post = await connection.execute(
        `SELECT p.PostID, p.PostDate, u.Username,
                DBMS_LOB.SUBSTR(p.PostText, 2000, 1) AS Body, m.Title
         FROM Post p JOIN AppUser u ON u.UserID = p.UserID
         LEFT JOIN Movie m ON m.MovieID = p.MovieID
         WHERE p.PostID = :targetId`,
        { targetId }
      );
      content = post.rows[0] || null;
    } else if (targetType === 'Comment') {
      const comment = await connection.execute(
        `SELECT c.CommentID, c.CommentDate, u.Username,
                DBMS_LOB.SUBSTR(c.CommentText, 2000, 1) AS Body
         FROM PostComment c JOIN AppUser u ON u.UserID = c.UserID
         WHERE c.CommentID = :targetId`,
        { targetId }
      );
      content = comment.rows[0] || null;
    } else if (targetType === 'User') {
      const user = await connection.execute(
        `SELECT UserID, Username, DisplayName, JoinDate,
                DBMS_LOB.SUBSTR(Bio, 1000, 1) AS Body
         FROM AppUser WHERE UserID = :targetId`,
        { targetId }
      );
      content = user.rows[0] || null;
    }
    // TargetType 'Review' carries a composite key that a single TargetID
    // cannot express, so the report row records the movie and the moderator
    // opens it from the Reviews screen. Flagged here rather than guessed at.

    res.json({
      available: true,
      targetType,
      targetId,
      // A report can outlive the thing it points at -- someone may have
      // already deleted the post. That is a legitimate state, not an error.
      content,
      missing: content === null,
    });
  } catch (err) {
    console.error('Get reported content error:', err);
    res.status(500).json({ error: 'Failed to load the reported content' });
  } finally {
    if (connection) await connection.close();
  }
}

// PUT /api/admin/reports/:id   body: { status, resolutionNote? }
async function updateReportStatus(req, res) {
  const reportId = parseId(req.params.id);
  const { status, resolutionNote } = req.body;

  if (!reportId) return res.status(400).json({ error: 'Invalid report id' });
  if (!REPORT_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${REPORT_STATUSES.join(', ')}` });
  }

  let connection;
  try {
    connection = await getPool().getConnection();

    if (!(await hasReports(connection))) {
      return featureUnavailable(res, 'Report queue');
    }

    // Reopening a closed report clears the resolution stamp, so a stale
    // "resolved by X on Y" can't sit under a Pending badge.
    const isClosing = status === 'Resolved' || status === 'Rejected';

    const result = await connection.execute(
      `UPDATE ContentReport
          SET Status = :status,
              ResolutionNote = :resolutionNote,
              ResolvedDate = CASE WHEN :isClosing = 1 THEN SYSDATE ELSE NULL END,
              ResolvedBy = CASE WHEN :isClosing = 1 THEN :adminId ELSE NULL END
        WHERE ReportID = :reportId`,
      {
        status,
        resolutionNote: resolutionNote || null,
        isClosing: isClosing ? 1 : 0,
        adminId: req.user.userId,
        reportId,
      }
    );
    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    await logAdminAction(connection, {
      adminId: req.user.userId,
      action: 'report.update',
      targetType: 'Report',
      targetId: reportId,
      details: `Marked ${status}`,
    });
    await connection.commit();

    res.json({ message: `Report marked ${status.toLowerCase()}` });
  } catch (err) {
    const known = describeOracleError(err, {
      checkFailed: `Status must be one of: ${REPORT_STATUSES.join(', ')}`,
    });
    if (known) return res.status(known.status).json({ error: known.error });
    console.error('Update report status error:', err);
    res.status(500).json({ error: 'Failed to update the report' });
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = {
  REPORT_STATUSES,
  listUsers, getUserDetail, updateUser, getUserDependencies, deleteUser,
  listReviews, listPosts, listComments,
  listReports, getReportedContent, updateReportStatus,
};
