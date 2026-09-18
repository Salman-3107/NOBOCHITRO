const { getPool } = require('../db');
const { hasAuditLog, featureUnavailable } = require('../utils/adminSchema');
const {
  parsePagination, PAGE_CLAUSE, paginated, likeTerm,
} = require('../utils/adminQuery');

// ============================================================
// Dashboard charts, the platform activity feed, global search and
// the administrative audit log.
//
// Everything here is read-only and every number is an aggregate over
// the live Oracle schema -- there are no stored counters to drift out
// of sync, and nothing is seeded or estimated.
// ============================================================


// ---------- Time bucketing ----------
//
// The four ranges the brief asks for (7 Days / 30 Days / 3 Months / 1 Year)
// need three different bucket widths, because 365 daily points on a 700px
// chart is noise.
//
// `start` and `trunc` are SQL fragments written here, in source, and chosen
// by a key lookup -- the request string never reaches the query text. That
// matters because a bucket expression cannot be a bind variable.
const RANGES = {
  '7d': {
    points: 7,
    label: 'Last 7 days',
    start: 'TRUNC(SYSDATE) - (LEVEL - 1)',
    trunc: (column) => `TRUNC(${column})`,
    since: 'TRUNC(SYSDATE) - 6',
  },
  '30d': {
    points: 30,
    label: 'Last 30 days',
    start: 'TRUNC(SYSDATE) - (LEVEL - 1)',
    trunc: (column) => `TRUNC(${column})`,
    since: 'TRUNC(SYSDATE) - 29',
  },
  '3m': {
    points: 13,
    label: 'Last 3 months',
    start: "TRUNC(SYSDATE, 'IW') - ((LEVEL - 1) * 7)",
    trunc: (column) => `TRUNC(${column}, 'IW')`,
    since: "TRUNC(SYSDATE, 'IW') - (12 * 7)",
  },
  '1y': {
    points: 12,
    label: 'Last 12 months',
    start: "ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -(LEVEL - 1))",
    trunc: (column) => `TRUNC(${column}, 'MM')`,
    since: "ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -11)",
  },
};

const DEFAULT_RANGE = '30d';

function resolveRange(value) {
  return Object.prototype.hasOwnProperty.call(RANGES, value) ? RANGES[value] : RANGES[DEFAULT_RANGE];
}

// Produces one row per bucket for the whole window, including buckets where
// nothing happened.
//
// A plain GROUP BY would skip empty days entirely, and a line chart drawn
// from that silently compresses a quiet week into a straight line between two
// busy ones. Generating the calendar first with CONNECT BY and LEFT JOINing
// the counts onto it keeps the x-axis honest.
async function bucketSeries(connection, { table, dateColumn, where, range }) {
  const filter = where ? `AND ${where}` : '';

  const sql = `
    WITH buckets AS (
      SELECT ${range.start} AS BucketStart
      FROM dual
      CONNECT BY LEVEL <= :points
    ),
    tallies AS (
      SELECT ${range.trunc(dateColumn)} AS BucketStart, COUNT(*) AS Total
      FROM ${table}
      WHERE ${dateColumn} >= ${range.since} ${filter}
      GROUP BY ${range.trunc(dateColumn)}
    )
    SELECT b.BucketStart, NVL(t.Total, 0) AS Total
    FROM buckets b
    LEFT JOIN tallies t ON t.BucketStart = b.BucketStart
    ORDER BY b.BucketStart`;

  const result = await connection.execute(sql, { points: range.points });
  return result.rows.map((row) => ({
    date: row.BUCKETSTART,
    value: row.TOTAL,
  }));
}


// GET /api/admin/analytics?range=7d|30d|3m|1y
//
// Everything the dashboard's four charts need, in one round trip -- four
// separate endpoints would mean four connection checkouts to draw one screen.
async function getAnalytics(req, res) {
  const range = resolveRange(req.query.range);

  let connection;
  try {
    connection = await getPool().getConnection();

    const [newUsers, reviewActivity] = await Promise.all([
      bucketSeries(connection, { table: 'AppUser', dateColumn: 'JoinDate', range }),
      bucketSeries(connection, { table: 'Review', dateColumn: 'ReviewDate', range }),
    ]);

    // The user-growth chart is cumulative, so it needs the headcount that
    // already existed before the window opened -- otherwise the line starts
    // at zero and implies the platform was founded 30 days ago.
    const baseline = await connection.execute(
      `SELECT COUNT(*) AS Total FROM AppUser WHERE JoinDate < ${range.since}`
    );

    let runningTotal = baseline.rows[0].TOTAL;
    const userGrowth = newUsers.map((point) => {
      runningTotal += point.value;
      return { date: point.date, value: runningTotal, added: point.value };
    });

    // Rating distribution: every legal score 1..10, including the ones nobody
    // has used. CONNECT BY generates the scale so the histogram keeps a fixed
    // shape instead of collapsing when a score is unused.
    const ratingDistribution = await connection.execute(
      `SELECT s.Score, NVL(r.Total, 0) AS Total
       FROM (SELECT LEVEL AS Score FROM dual CONNECT BY LEVEL <= 10) s
       LEFT JOIN (
         SELECT RatingValue AS Score, COUNT(*) AS Total
         FROM Review
         GROUP BY RatingValue
       ) r ON r.Score = s.Score
       ORDER BY s.Score`
    );

    // Popular genres by catalogue size AND by how much people actually engage
    // with them -- a genre can have 200 films and no reviews.
    const genrePopularity = await connection.execute(
      `SELECT g.GenreID, g.GenreName,
              COUNT(DISTINCT mg.MovieID) AS MovieCount,
              COUNT(r.UserID) AS RatingCount,
              ROUND(AVG(r.RatingValue), 2) AS AvgRating
       FROM Genre g
       LEFT JOIN MovieGenre mg ON mg.GenreID = g.GenreID
       LEFT JOIN Review r ON r.MovieID = mg.MovieID
       GROUP BY g.GenreID, g.GenreName
       ORDER BY MovieCount DESC, g.GenreName
       FETCH FIRST 10 ROWS ONLY`
    );

    res.json({
      available: true,
      range: { key: req.query.range && RANGES[req.query.range] ? req.query.range : DEFAULT_RANGE, label: range.label },
      userGrowth,
      reviewActivity,
      ratingDistribution: ratingDistribution.rows.map((row) => ({
        score: row.SCORE,
        count: row.TOTAL,
      })),
      genrePopularity: genrePopularity.rows.map((row) => ({
        genreId: row.GENREID,
        genreName: row.GENRENAME,
        movieCount: row.MOVIECOUNT,
        ratingCount: row.RATINGCOUNT,
        avgRating: row.AVGRATING,
      })),
    });
  } catch (err) {
    console.error('Get admin analytics error:', err);
    res.status(500).json({ error: 'Failed to load analytics' });
  } finally {
    if (connection) await connection.close();
  }
}


// GET /api/admin/activity/platform?limit=20
//
// "What just happened on NOBOCHITRO" -- registrations, reviews, posts and
// challenge completions merged into one chronological feed.
//
// Each branch is limited BEFORE the union rather than after: without the inner
// FETCH FIRST, a busy site would have Oracle sort every review ever written
// just to show the newest five.
async function getPlatformActivity(req, res) {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 50);

  let connection;
  try {
    connection = await getPool().getConnection();

    const result = await connection.execute(
      `SELECT * FROM (
         -- The NULLs are CAST rather than left bare: in a UNION ALL, Oracle
         -- takes each column's datatype from the FIRST branch, and an
         -- untyped NULL comes out as CHAR -- which then collides with the
         -- NUMBER MovieID and VARCHAR2 Title supplied by the branches below
         -- (ORA-01790). Naming the types here settles it once.
         SELECT 'user.joined' AS Kind, u.JoinDate AS Occurred,
                u.UserID AS ActorID, u.Username AS ActorName,
                CAST(NULL AS NUMBER(10)) AS TargetID,
                CAST(NULL AS VARCHAR2(200)) AS TargetLabel,
                CAST(NULL AS VARCHAR2(20)) AS Detail
         FROM AppUser u
         ORDER BY u.JoinDate DESC FETCH FIRST :limit ROWS ONLY
       )
       UNION ALL
       SELECT * FROM (
         SELECT 'review.created', r.ReviewDate,
                u.UserID, u.Username,
                m.MovieID, m.Title, TO_CHAR(r.RatingValue)
         FROM Review r
         JOIN AppUser u ON u.UserID = r.UserID
         JOIN Movie m ON m.MovieID = r.MovieID
         ORDER BY r.ReviewDate DESC FETCH FIRST :limit ROWS ONLY
       )
       UNION ALL
       SELECT * FROM (
         SELECT 'post.created', p.PostDate,
                u.UserID, u.Username,
                p.PostID, m.Title, CAST(NULL AS VARCHAR2(20))
         FROM Post p
         JOIN AppUser u ON u.UserID = p.UserID
         LEFT JOIN Movie m ON m.MovieID = p.MovieID
         ORDER BY p.PostDate DESC FETCH FIRST :limit ROWS ONLY
       )
       UNION ALL
       SELECT * FROM (
         SELECT 'challenge.completed', ucp.CompletionDate,
                u.UserID, u.Username,
                c.ChallengeID, c.Title, CAST(NULL AS VARCHAR2(20))
         FROM UserChallengeProgress ucp
         JOIN AppUser u ON u.UserID = ucp.UserID
         JOIN Challenge c ON c.ChallengeID = ucp.ChallengeID
         WHERE ucp.Completed = 1 AND ucp.CompletionDate IS NOT NULL
         ORDER BY ucp.CompletionDate DESC FETCH FIRST :limit ROWS ONLY
       )
              ORDER BY 2 DESC
        FETCH FIRST :limit ROWS ONLY`,
      { limit }
    );

    res.json({
      available: true,
      items: result.rows.map((row) => ({
        kind: row.KIND,
        occurred: row.OCCURRED,
        actorId: row.ACTORID,
        actorName: row.ACTORNAME,
        targetId: row.TARGETID,
        targetLabel: row.TARGETLABEL,
        detail: row.DETAIL,
      })),
    });
  } catch (err) {
    console.error('Get platform activity error:', err);
    res.status(500).json({ error: 'Failed to load activity' });
  } finally {
    if (connection) await connection.close();
  }
}


// GET /api/admin/activity?page=&limit=&action=&adminId=
//
// The administrative audit trail. Needs AdminActivityLog, which lives in
// admin_dashboard_extensions.sql -- without it this answers `available: false`
// and the page explains the migration rather than erroring.
async function getAuditLog(req, res) {
  const { page, limit, offset } = parsePagination(req.query);

  let connection;
  try {
    connection = await getPool().getConnection();

    if (!(await hasAuditLog(connection))) {
      return featureUnavailable(res, 'Admin activity log');
    }

    const conditions = [];
    const binds = { offset, limit };

    if (req.query.action) {
      conditions.push('l.Action = :action');
      binds.action = req.query.action;
    }
    const adminId = Number.parseInt(req.query.adminId, 10);
    if (Number.isInteger(adminId) && adminId > 0) {
      conditions.push('l.AdminID = :adminId');
      binds.adminId = adminId;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await connection.execute(
      `SELECT COUNT(*) AS Total FROM AdminActivityLog l ${where}`,
      // The count query has no OFFSET/FETCH, and oracledb rejects binds the
      // statement never mentions -- so the paging pair is stripped out here.
      Object.fromEntries(Object.entries(binds).filter(([key]) => key !== 'offset' && key !== 'limit'))
    );

    const result = await connection.execute(
      `SELECT l.LogID, l.Action, l.TargetType, l.TargetID, l.TargetLabel,
              l.Details, l.CreatedDate,
              l.AdminID, u.Username AS AdminUsername, u.DisplayName AS AdminDisplayName
       FROM AdminActivityLog l
       LEFT JOIN AppUser u ON u.UserID = l.AdminID
       ${where}
       ORDER BY l.CreatedDate DESC, l.LogID DESC
       ${PAGE_CLAUSE}`,
      binds
    );

    res.json(paginated(
      result.rows.map((row) => ({
        logId: row.LOGID,
        action: row.ACTION,
        targetType: row.TARGETTYPE,
        targetId: row.TARGETID,
        targetLabel: row.TARGETLABEL,
        details: row.DETAILS,
        createdDate: row.CREATEDDATE,
        adminId: row.ADMINID,
        // AdminID is ON DELETE SET NULL, so a log row can outlive its author.
        adminName: row.ADMINDISPLAYNAME || row.ADMINUSERNAME || 'Deleted admin',
      })),
      countResult.rows[0].TOTAL,
      { page, limit }
    ));
  } catch (err) {
    console.error('Get audit log error:', err);
    res.status(500).json({ error: 'Failed to load the activity log' });
  } finally {
    if (connection) await connection.close();
  }
}


// GET /api/admin/search?q=...
//
// One box, six categories. Deliberately capped at five hits each: this is a
// jump-to navigator, not a report, and the full lists already have their own
// filtered pages.
async function globalSearch(req, res) {
  const term = likeTerm(req.query.q);

  if (!term) {
    return res.json({
      available: true, query: '', movies: [], users: [], people: [], genres: [], reviews: [], posts: [],
    });
  }

  let connection;
  try {
    connection = await getPool().getConnection();
    const binds = { term };

    const [movies, users, people, genres, reviews, posts] = await Promise.all([
      connection.execute(
        `SELECT MovieID, Title, ReleaseYear, PosterURL
         FROM Movie
         WHERE UPPER(Title) LIKE UPPER(:term) ESCAPE '\\'
         ORDER BY ReleaseYear DESC NULLS LAST, Title
         FETCH FIRST 5 ROWS ONLY`, binds),

      connection.execute(
        `SELECT UserID, Username, DisplayName, Email, ProfilePictureURL, IsAdmin
         FROM AppUser
         WHERE UPPER(Username) LIKE UPPER(:term) ESCAPE '\\'
            OR UPPER(Email) LIKE UPPER(:term) ESCAPE '\\'
            OR UPPER(DisplayName) LIKE UPPER(:term) ESCAPE '\\'
         ORDER BY Username
         FETCH FIRST 5 ROWS ONLY`, binds),

      connection.execute(
        `SELECT PersonID, FullName, PhotoURL
         FROM Person
         WHERE UPPER(FullName) LIKE UPPER(:term) ESCAPE '\\'
         ORDER BY FullName
         FETCH FIRST 5 ROWS ONLY`, binds),

      connection.execute(
        `SELECT GenreID, GenreName
         FROM Genre
         WHERE UPPER(GenreName) LIKE UPPER(:term) ESCAPE '\\'
         ORDER BY GenreName
         FETCH FIRST 5 ROWS ONLY`, binds),

      // ReviewText is a CLOB. Oracle will not accept LIKE directly against a
      // CLOB in every version/configuration, so it is narrowed with
      // DBMS_LOB.SUBSTR -- which also keeps the scan off the LOB segment.
      connection.execute(
        `SELECT r.UserID, r.MovieID, r.RatingValue, r.ReviewDate,
                u.Username, m.Title,
                DBMS_LOB.SUBSTR(r.ReviewText, 160, 1) AS Snippet
         FROM Review r
         JOIN AppUser u ON u.UserID = r.UserID
         JOIN Movie m ON m.MovieID = r.MovieID
         WHERE UPPER(DBMS_LOB.SUBSTR(r.ReviewText, 3000, 1)) LIKE UPPER(:term) ESCAPE '\\'
         ORDER BY r.ReviewDate DESC
         FETCH FIRST 5 ROWS ONLY`, binds),

      connection.execute(
        `SELECT p.PostID, p.PostDate, u.Username, m.Title,
                DBMS_LOB.SUBSTR(p.PostText, 160, 1) AS Snippet
         FROM Post p
         JOIN AppUser u ON u.UserID = p.UserID
         LEFT JOIN Movie m ON m.MovieID = p.MovieID
         WHERE UPPER(DBMS_LOB.SUBSTR(p.PostText, 3000, 1)) LIKE UPPER(:term) ESCAPE '\\'
         ORDER BY p.PostDate DESC
         FETCH FIRST 5 ROWS ONLY`, binds),
    ]);

    res.json({
      available: true,
      query: req.query.q,
      movies: movies.rows.map((row) => ({
        movieId: row.MOVIEID, title: row.TITLE, releaseYear: row.RELEASEYEAR, posterUrl: row.POSTERURL,
      })),
      users: users.rows.map((row) => ({
        userId: row.USERID, username: row.USERNAME, displayName: row.DISPLAYNAME,
        email: row.EMAIL, profilePictureUrl: row.PROFILEPICTUREURL, isAdmin: row.ISADMIN === 1,
      })),
      people: people.rows.map((row) => ({
        personId: row.PERSONID, fullName: row.FULLNAME, photoUrl: row.PHOTOURL,
      })),
      genres: genres.rows.map((row) => ({ genreId: row.GENREID, genreName: row.GENRENAME })),
      reviews: reviews.rows.map((row) => ({
        userId: row.USERID, movieId: row.MOVIEID, rating: row.RATINGVALUE,
        reviewDate: row.REVIEWDATE, username: row.USERNAME, title: row.TITLE, snippet: row.SNIPPET,
      })),
      posts: posts.rows.map((row) => ({
        postId: row.POSTID, postDate: row.POSTDATE, username: row.USERNAME,
        title: row.TITLE, snippet: row.SNIPPET,
      })),
    });
  } catch (err) {
    console.error('Admin global search error:', err);
    res.status(500).json({ error: 'Search failed' });
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = { getAnalytics, getPlatformActivity, getAuditLog, globalSearch };
