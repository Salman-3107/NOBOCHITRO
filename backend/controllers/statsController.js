const { getPool } = require('../db');
const { hasReports, hasChallengeStatus } = require('../utils/adminSchema');

// Everything in this file is read-only aggregate SQL -- GROUP BY, COUNT,
// AVG, SUM over the existing schema. No new tables are needed.

// GET /api/users/:id/stats  (auth; the owner sees more than other users)
//
// Same privacy rule the journal and passport already use: the owner's numbers
// are built from ALL their journal entries, everyone else's view is built from
// the Public ones only, so a private entry never leaks through a total.
// Ratings and reviews are public by nature, so those are not filtered.
async function getUserStats(req, res) {
  const profileUserId = Number(req.params.id);
  const viewerId = req.user ? req.user.userId : null;

  if (!Number.isInteger(profileUserId) || profileUserId < 1) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  const isOwner = viewerId === profileUserId;
  const privacyFilter = isOwner ? '' : `AND j.Privacy = 'Public'`;

  let connection;
  try {
    connection = await getPool().getConnection();

    // Headline numbers. Runtime is summed off the journal so a rewatch counts
    // twice -- you really did spend those hours in front of the screen.
    const headline = await connection.execute(
      `SELECT
         (SELECT COUNT(DISTINCT r.MovieID) FROM Review r WHERE r.UserID = :profileUserId) AS MoviesRated,
         (SELECT COUNT(*) FROM Review r
           WHERE r.UserID = :profileUserId AND r.ReviewText IS NOT NULL) AS ReviewsWritten,
         (SELECT ROUND(AVG(r.RatingValue), 1) FROM Review r
           WHERE r.UserID = :profileUserId) AS AverageRating,
         (SELECT COUNT(*) FROM Post p WHERE p.UserID = :profileUserId) AS PostCount,
         (SELECT COUNT(*) FROM JournalEntry j
           WHERE j.UserID = :profileUserId ${privacyFilter}) AS EntriesLogged,
         (SELECT NVL(SUM(m.Runtime), 0) FROM JournalEntry j
            JOIN Movie m ON m.MovieID = j.MovieID
           WHERE j.UserID = :profileUserId ${privacyFilter}) AS MinutesWatched
       FROM dual`,
      { profileUserId }
    );

    // Movies per genre -- the bar chart on the stats page.
    const byGenre = await connection.execute(
      `SELECT g.GenreName, COUNT(DISTINCT j.MovieID) AS MovieCount
       FROM JournalEntry j
       JOIN MovieGenre mg ON mg.MovieID = j.MovieID
       JOIN Genre g ON g.GenreID = mg.GenreID
       WHERE j.UserID = :profileUserId ${privacyFilter}
       GROUP BY g.GenreName
       ORDER BY MovieCount DESC, g.GenreName
       FETCH FIRST 8 ROWS ONLY`,
      { profileUserId }
    );

    // Last 12 months of viewing activity, oldest first so the chart reads
    // left to right.
    const byMonth = await connection.execute(
      `SELECT TO_CHAR(j.WatchDate, 'YYYY-MM') AS Period, COUNT(*) AS MovieCount
       FROM JournalEntry j
       WHERE j.UserID = :profileUserId ${privacyFilter}
         AND j.WatchDate >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -11)
       GROUP BY TO_CHAR(j.WatchDate, 'YYYY-MM')
       ORDER BY Period`,
      { profileUserId }
    );

    // How this user spreads their own ratings across the 1-10 scale.
    const ratingSpread = await connection.execute(
      `SELECT r.RatingValue, COUNT(*) AS Total
       FROM Review r
       WHERE r.UserID = :profileUserId
       GROUP BY r.RatingValue
       ORDER BY r.RatingValue DESC`,
      { profileUserId }
    );

    // Countries, for the passport map and the stats page alike. Review-based,
    // not JournalEntry -- a country only gets stamped once you've actually
    // rated a film from it, and Review has no Privacy column so no filter
    // is needed here (a review is always public).
    const byCountry = await connection.execute(
      `SELECT m.Country, COUNT(DISTINCT r.MovieID) AS MovieCount,
              ROUND(AVG(r.RatingValue), 1) AS AvgRating
       FROM Review r
       JOIN Movie m ON m.MovieID = r.MovieID
       WHERE r.UserID = :profileUserId
         AND m.Country IS NOT NULL
       GROUP BY m.Country
       ORDER BY MovieCount DESC`,
      { profileUserId }
    );

    const totals = headline.rows[0];

    res.json({
      isOwner,
      moviesRated: totals.MOVIESRATED || 0,
      reviewsWritten: totals.REVIEWSWRITTEN || 0,
      averageRating: totals.AVERAGERATING,
      postCount: totals.POSTCOUNT || 0,
      entriesLogged: totals.ENTRIESLOGGED || 0,
      minutesWatched: totals.MINUTESWATCHED || 0,
      hoursWatched: Math.round((totals.MINUTESWATCHED || 0) / 60),
      byGenre: byGenre.rows.map((row) => ({ label: row.GENRENAME, value: row.MOVIECOUNT })),
      byMonth: byMonth.rows.map((row) => ({ label: row.PERIOD, value: row.MOVIECOUNT })),
      ratingSpread: ratingSpread.rows.map((row) => ({ rating: row.RATINGVALUE, count: row.TOTAL })),
      byCountry: byCountry.rows.map((row) => ({
        country: row.COUNTRY,
        movieCount: row.MOVIECOUNT,
        avgRating: row.AVGRATING,
      })),
    });
  } catch (err) {
    console.error('Get user stats error:', err);
    res.status(500).json({ error: 'Failed to load statistics' });
  } finally {
    if (connection) await connection.close();
  }
}

// GET /api/movies/:id/rating-distribution  (auth)
// Feeds the histogram on the movie details page. Every rating 1-10 is
// returned even when nobody picked it, so the chart keeps a stable shape
// instead of collapsing rows that happen to be empty.
async function getRatingDistribution(req, res) {
  const movieId = Number(req.params.id);

  if (!Number.isInteger(movieId) || movieId < 1) {
    return res.status(400).json({ error: 'Invalid movie id' });
  }

  let connection;
  try {
    connection = await getPool().getConnection();

    const result = await connection.execute(
      `SELECT RatingValue, COUNT(*) AS Total
       FROM Review
       WHERE MovieID = :movieId
       GROUP BY RatingValue`,
      { movieId }
    );

    const counts = new Map(result.rows.map((row) => [row.RATINGVALUE, row.TOTAL]));
    const totalRatings = result.rows.reduce((sum, row) => sum + row.TOTAL, 0);

    const distribution = [];
    for (let rating = 10; rating >= 1; rating -= 1) {
      const count = counts.get(rating) || 0;
      distribution.push({
        rating,
        count,
        percent: totalRatings ? Math.round((count / totalRatings) * 1000) / 10 : 0,
      });
    }

    const weightedSum = result.rows.reduce((sum, row) => sum + row.RATINGVALUE * row.TOTAL, 0);

    res.json({
      movieId,
      totalRatings,
      averageRating: totalRatings ? Math.round((weightedSum / totalRatings) * 10) / 10 : null,
      distribution,
    });
  } catch (err) {
    console.error('Get rating distribution error:', err);
    res.status(500).json({ error: 'Failed to load rating distribution' });
  } finally {
    if (connection) await connection.close();
  }
}

// GET /api/admin/dashboard  (admin)
// The headline counters plus a short "what just happened" list.
async function getAdminDashboard(req, res) {
  let connection;
  try {
    connection = await getPool().getConnection();

    // Two of the cards the admin dashboard shows depend on the optional
    // schema additions, so what gets counted is decided first. Referencing
    // ContentReport when it hasn't been created is ORA-00942, and that would
    // take the whole dashboard down over one card.
    const [reportsInstalled, lifecycleInstalled] = await Promise.all([
      hasReports(connection),
      hasChallengeStatus(connection),
    ]);

    // "Ratings" and "Reviews" are different numbers drawn from the same table:
    // every Review row carries a RatingValue (NOT NULL), but ReviewText is
    // optional, so a written review is a strict subset of the ratings. The
    // brief asks for both, and reporting the same figure twice would be wrong.
    const reportCount = reportsInstalled
      ? `(SELECT COUNT(*) FROM ContentReport WHERE Status = 'Pending')`
      : 'CAST(NULL AS NUMBER)';

    // Without Status, "active" can only mean "inside its date window", which
    // is what the user-facing /api/challenges list has always meant by it.
    const activeChallenges = lifecycleInstalled
      ? `(SELECT COUNT(*) FROM Challenge WHERE Status = 'Published'
            AND (StartDate IS NULL OR StartDate <= SYSDATE)
            AND (EndDate IS NULL OR EndDate >= SYSDATE))`
      : `(SELECT COUNT(*) FROM Challenge
          WHERE (StartDate IS NULL OR StartDate <= SYSDATE)
            AND (EndDate IS NULL OR EndDate >= SYSDATE))`;

    const counts = await connection.execute(
      `SELECT
         (SELECT COUNT(*) FROM AppUser) AS UserCount,
         (SELECT COUNT(*) FROM AppUser WHERE IsAdmin = 1) AS AdminCount,
         (SELECT COUNT(*) FROM Movie) AS MovieCount,
         (SELECT COUNT(*) FROM Review) AS RatingCount,
         (SELECT COUNT(*) FROM Review WHERE ReviewText IS NOT NULL) AS ReviewCount,
         (SELECT COUNT(*) FROM Post) AS PostCount,
         (SELECT COUNT(*) FROM PostComment) AS CommentCount,
         (SELECT COUNT(*) FROM Genre) AS GenreCount,
         (SELECT COUNT(*) FROM Person) AS PersonCount,
         (SELECT COUNT(*) FROM JournalEntry) AS JournalCount,
         (SELECT COUNT(*) FROM Challenge) AS ChallengeCount,
         ${activeChallenges} AS ActiveChallengeCount,
         ${reportCount} AS PendingReportCount,
         (SELECT COUNT(*) FROM AppUser WHERE JoinDate >= SYSDATE - 7) AS NewUsersThisWeek,
         (SELECT COUNT(*) FROM AppUser WHERE JoinDate >= SYSDATE - 30) AS NewUsersThisMonth,
         (SELECT COUNT(*) FROM Review WHERE ReviewDate >= SYSDATE - 7) AS ReviewsThisWeek,
         (SELECT COUNT(*) FROM Review WHERE ReviewDate >= SYSDATE - 30) AS ReviewsThisMonth,
         (SELECT COUNT(*) FROM Post WHERE PostDate >= SYSDATE - 7) AS PostsThisWeek
       FROM dual`
    );

    // Movie has no CreatedDate column -- nothing records when a title was
    // added to the catalogue. MovieID comes from seq_movie, so descending
    // MovieID is the only honest proxy for "most recently added", and it is
    // returned as a short list rather than dressed up as a "+N this month"
    // trend figure that the schema cannot actually support.
    const recentMovies = await connection.execute(
      `SELECT MovieID, Title, ReleaseYear, PosterURL
       FROM Movie ORDER BY MovieID DESC FETCH FIRST 5 ROWS ONLY`
    );

    // The current challenge card. NULL when nothing is running, which the UI
    // renders as "No challenge running" rather than an empty card.
    const currentChallenge = await connection.execute(
      `SELECT * FROM (
         SELECT c.ChallengeID, c.Title, c.StartDate, c.EndDate, c.TargetCount,
                (SELECT COUNT(*) FROM UserChallengeProgress p
                  WHERE p.ChallengeID = c.ChallengeID) AS Participants,
                (SELECT COUNT(*) FROM UserChallengeProgress p
                  WHERE p.ChallengeID = c.ChallengeID AND p.Completed = 1) AS CompletedCount
         FROM Challenge c
         WHERE (c.StartDate IS NULL OR c.StartDate <= SYSDATE)
           AND (c.EndDate IS NULL OR c.EndDate >= SYSDATE)
         ORDER BY c.EndDate ASC NULLS LAST
       ) WHERE ROWNUM = 1`
    );

    // Movies with no rating yet -- a useful "needs attention" list for a
    // moderator, and it exercises an anti-join.
    const unrated = await connection.execute(
      `SELECT m.MovieID, m.Title, m.ReleaseYear
       FROM Movie m
       WHERE NOT EXISTS (SELECT 1 FROM Review r WHERE r.MovieID = m.MovieID)
       ORDER BY m.ReleaseYear DESC NULLS LAST, m.Title
       FETCH FIRST 8 ROWS ONLY`
    );

    const recentReviews = await connection.execute(
      `SELECT r.RatingValue, r.ReviewDate, u.Username, m.MovieID, m.Title
       FROM Review r
       JOIN AppUser u ON u.UserID = r.UserID
       JOIN Movie m ON m.MovieID = r.MovieID
       ORDER BY r.ReviewDate DESC
       FETCH FIRST 8 ROWS ONLY`
    );

    const row = counts.rows[0];

    res.json({
      totals: {
        users: row.USERCOUNT,
        admins: row.ADMINCOUNT,
        movies: row.MOVIECOUNT,
        ratings: row.RATINGCOUNT,
        reviews: row.REVIEWCOUNT,
        posts: row.POSTCOUNT,
        comments: row.COMMENTCOUNT,
        genres: row.GENRECOUNT,
        people: row.PERSONCOUNT,
        journalEntries: row.JOURNALCOUNT,
        challenges: row.CHALLENGECOUNT,
        activeChallenges: row.ACTIVECHALLENGECOUNT,
        // null, not 0 -- "the report table isn't installed" and "there are no
        // reports" are different states and the card says so.
        pendingReports: reportsInstalled ? row.PENDINGREPORTCOUNT : null,
      },
      features: {
        reports: reportsInstalled,
        challengeLifecycle: lifecycleInstalled,
      },
      thisWeek: {
        newUsers: row.NEWUSERSTHISWEEK,
        reviews: row.REVIEWSTHISWEEK,
        posts: row.POSTSTHISWEEK,
      },
      thisMonth: {
        newUsers: row.NEWUSERSTHISMONTH,
        reviews: row.REVIEWSTHISMONTH,
      },
      recentMovies: recentMovies.rows.map((movie) => ({
        movieId: movie.MOVIEID,
        title: movie.TITLE,
        releaseYear: movie.RELEASEYEAR,
        posterUrl: movie.POSTERURL,
      })),
      currentChallenge: currentChallenge.rows.length === 0 ? null : {
        challengeId: currentChallenge.rows[0].CHALLENGEID,
        title: currentChallenge.rows[0].TITLE,
        startDate: currentChallenge.rows[0].STARTDATE,
        endDate: currentChallenge.rows[0].ENDDATE,
        targetCount: currentChallenge.rows[0].TARGETCOUNT,
        participants: currentChallenge.rows[0].PARTICIPANTS,
        completedCount: currentChallenge.rows[0].COMPLETEDCOUNT,
        completionRate: currentChallenge.rows[0].PARTICIPANTS > 0
          ? Math.round((currentChallenge.rows[0].COMPLETEDCOUNT / currentChallenge.rows[0].PARTICIPANTS) * 100)
          : 0,
      },
      unratedMovies: unrated.rows.map((movie) => ({
        movieId: movie.MOVIEID,
        title: movie.TITLE,
        releaseYear: movie.RELEASEYEAR,
      })),
      recentReviews: recentReviews.rows.map((review) => ({
        username: review.USERNAME,
        movieId: review.MOVIEID,
        title: review.TITLE,
        rating: review.RATINGVALUE,
        reviewDate: review.REVIEWDATE,
      })),
    });
  } catch (err) {
    console.error('Get admin dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = { getUserStats, getRatingDistribution, getAdminDashboard };
