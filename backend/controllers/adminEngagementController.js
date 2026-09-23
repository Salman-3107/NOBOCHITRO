const oracledb = require('oracledb');
const { getPool } = require('../db');
const { createNotification } = require('./notificationController');
const { logAdminAction } = require('../utils/adminAudit');
const { hasChallengeStatus } = require('../utils/adminSchema');
const {
  parsePagination, paginated, parseId, likeTerm, PAGE_CLAUSE, describeOracleError,
} = require('../utils/adminQuery');

// ============================================================
// Weekly challenges, notifications and the leaderboard.
//
// The challenge lifecycle (Draft -> Published -> Active -> Completed) needs
// Challenge.Status and Challenge.PublishedDate, added by
// admin_dashboard_extensions.sql. Where the column is missing, every
// challenge is reported as already published -- which is exactly what it was
// before the column existed, since the old createChallenge notified every
// account the moment the row was inserted.
// ============================================================

// The four criteria types challengeController.evaluateChallengeProgress
// actually understands. Offering a fifth in the admin dropdown would create
// challenges that can never make progress, because nothing increments them.
// Adding one means adding a case to that switch first.
const CRITERIA_TYPES = [
  { value: 'WatchCount', label: 'Watch X movies', needsValue: false },
  { value: 'Genre', label: 'Watch X movies from a genre', needsValue: true, valueHint: 'Genre name, e.g. Thriller' },
  { value: 'Director', label: 'Watch X movies by a director', needsValue: true, valueHint: "Director's full name" },
  { value: 'ReleaseBefore', label: 'Watch X movies released before a year', needsValue: true, valueHint: 'Year, e.g. 1980' },
];

// Derives the lifecycle label from the row. Kept in one place so the list,
// the detail page and the dashboard card can never disagree about whether
// something is Active.
function lifecycleOf(row, statusSupported) {
  const status = statusSupported ? row.STATUS : 'Published';
  if (status === 'Draft') return 'Draft';
  if (status === 'Archived') return 'Archived';

  const now = Date.now();
  const start = row.STARTDATE ? new Date(row.STARTDATE).getTime() : null;
  const end = row.ENDDATE ? new Date(row.ENDDATE).getTime() : null;

  if (start && start > now) return 'Scheduled';
  if (end && end < now) return 'Completed';
  return 'Active';
}


// GET /api/admin/challenges?page=&limit=&status=&search=
//
// Each row arrives with its participation numbers already attached -- the
// list is the analytics view, so an admin doesn't have to open six challenges
// to see which one nobody joined.
async function listChallenges(req, res) {
  const { page, limit, offset } = parsePagination(req.query);

  let connection;
  try {
    connection = await getPool().getConnection();
    const statusSupported = await hasChallengeStatus(connection);

    const conditions = [];
    const filterBinds = {};

    const search = likeTerm(req.query.search);
    if (search) {
      conditions.push(`UPPER(c.Title) LIKE UPPER(:search) ESCAPE '\\'`);
      filterBinds.search = search;
    }
    if (statusSupported && ['Draft', 'Published', 'Archived'].includes(req.query.status)) {
      conditions.push('c.Status = :status');
      filterBinds.status = req.query.status;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Selected conditionally so the same query runs against a database that
    // hasn't had the migration applied -- referencing a column that isn't
    // there is ORA-00904, not a graceful degrade.
    const statusColumns = statusSupported
      ? 'c.Status, c.PublishedDate'
      : "CAST('Published' AS VARCHAR2(12)) AS Status, c.StartDate AS PublishedDate";

    const countResult = await connection.execute(
      `SELECT COUNT(*) AS Total FROM Challenge c ${where}`, filterBinds
    );

    const result = await connection.execute(
      `SELECT c.ChallengeID, c.Title, c.CriteriaType, c.CriteriaValue,
              c.TargetCount, c.XPReward, c.StartDate, c.EndDate,
              ${statusColumns},
              DBMS_LOB.SUBSTR(c.Description, 300, 1) AS Description,
              (SELECT COUNT(*) FROM UserChallengeProgress p
                WHERE p.ChallengeID = c.ChallengeID) AS Participants,
              (SELECT COUNT(*) FROM UserChallengeProgress p
                WHERE p.ChallengeID = c.ChallengeID AND p.Completed = 1) AS CompletedCount,
              (SELECT ROUND(AVG(p.CurrentProgress), 1) FROM UserChallengeProgress p
                WHERE p.ChallengeID = c.ChallengeID) AS AvgProgress
       FROM Challenge c
       ${where}
       ORDER BY c.StartDate DESC NULLS LAST, c.ChallengeID DESC
       ${PAGE_CLAUSE}`,
      { ...filterBinds, offset, limit }
    );

    res.json({
      ...paginated(
        result.rows.map((row) => {
          const participants = row.PARTICIPANTS;
          const completed = row.COMPLETEDCOUNT;
          return {
            challengeId: row.CHALLENGEID,
            title: row.TITLE,
            description: row.DESCRIPTION,
            criteriaType: row.CRITERIATYPE,
            criteriaValue: row.CRITERIAVALUE,
            targetCount: row.TARGETCOUNT,
            xpReward: row.XPREWARD,
            startDate: row.STARTDATE,
            endDate: row.ENDDATE,
            status: statusSupported ? row.STATUS : 'Published',
            publishedDate: row.PUBLISHEDDATE,
            lifecycle: lifecycleOf(row, statusSupported),
            participants,
            completedCount: completed,
            inProgress: participants - completed,
            // Guarded: a challenge nobody joined would otherwise be 0/0.
            completionRate: participants > 0 ? Math.round((completed / participants) * 100) : 0,
            avgProgress: row.AVGPROGRESS || 0,
          };
        }),
        countResult.rows[0].TOTAL,
        { page, limit }
      ),
      // The UI hides the Draft/Publish controls when this is false and shows
      // a one-line note pointing at the migration.
      lifecycleSupported: statusSupported,
      criteriaTypes: CRITERIA_TYPES,
    });
  } catch (err) {
    console.error('Admin list challenges error:', err);
    res.status(500).json({ error: 'Failed to load challenges' });
  } finally {
    if (connection) await connection.close();
  }
}


// GET /api/admin/challenges/:id -- the challenge plus its participant board
async function getChallengeDetail(req, res) {
  const challengeId = parseId(req.params.id);
  if (!challengeId) return res.status(400).json({ error: 'Invalid challenge id' });

  let connection;
  try {
    connection = await getPool().getConnection();
    const statusSupported = await hasChallengeStatus(connection);

    const statusColumns = statusSupported
      ? 'c.Status, c.PublishedDate'
      : "CAST('Published' AS VARCHAR2(12)) AS Status, c.StartDate AS PublishedDate";

    const challenge = await connection.execute(
      `SELECT c.ChallengeID, c.Title, c.Description, c.CriteriaType, c.CriteriaValue,
              c.TargetCount, c.XPReward, c.StartDate, c.EndDate, ${statusColumns}
       FROM Challenge c WHERE c.ChallengeID = :challengeId`,
      { challengeId }
    );
    if (challenge.rows.length === 0) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    const [stats, participants] = await Promise.all([
      connection.execute(
        `SELECT COUNT(*) AS Participants,
                SUM(CASE WHEN Completed = 1 THEN 1 ELSE 0 END) AS CompletedCount,
                ROUND(AVG(CurrentProgress), 2) AS AvgProgress
         FROM UserChallengeProgress WHERE ChallengeID = :challengeId`,
        { challengeId }
      ),
      // The per-challenge leaderboard the brief asks for: furthest along
      // first, earliest finisher breaking ties among the completed.
      connection.execute(
        `SELECT u.UserID, u.Username, u.DisplayName, u.ProfilePictureURL,
                p.CurrentProgress, p.Completed, p.CompletionDate
         FROM UserChallengeProgress p
         JOIN AppUser u ON u.UserID = p.UserID
         WHERE p.ChallengeID = :challengeId
         ORDER BY p.Completed DESC, p.CurrentProgress DESC, p.CompletionDate ASC NULLS LAST
         FETCH FIRST 25 ROWS ONLY`,
        { challengeId }
      ),
    ]);

    const row = challenge.rows[0];
    const statsRow = stats.rows[0];
    const total = statsRow.PARTICIPANTS || 0;
    const completed = statsRow.COMPLETEDCOUNT || 0;

    res.json({
      lifecycleSupported: statusSupported,
      criteriaTypes: CRITERIA_TYPES,
      challenge: {
        challengeId: row.CHALLENGEID,
        title: row.TITLE,
        description: row.DESCRIPTION,
        criteriaType: row.CRITERIATYPE,
        criteriaValue: row.CRITERIAVALUE,
        targetCount: row.TARGETCOUNT,
        xpReward: row.XPREWARD,
        startDate: row.STARTDATE,
        endDate: row.ENDDATE,
        status: statusSupported ? row.STATUS : 'Published',
        publishedDate: row.PUBLISHEDDATE,
        lifecycle: lifecycleOf(row, statusSupported),
      },
      analytics: {
        participants: total,
        completed,
        inProgress: total - completed,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
        avgProgress: statsRow.AVGPROGRESS || 0,
      },
      participants: participants.rows.map((participant, index) => ({
        rank: index + 1,
        userId: participant.USERID,
        username: participant.USERNAME,
        displayName: participant.DISPLAYNAME,
        profilePictureUrl: participant.PROFILEPICTUREURL,
        currentProgress: participant.CURRENTPROGRESS,
        completed: participant.COMPLETED === 1,
        completionDate: participant.COMPLETIONDATE,
      })),
    });
  } catch (err) {
    console.error('Get challenge detail error:', err);
    res.status(500).json({ error: 'Failed to load challenge' });
  } finally {
    if (connection) await connection.close();
  }
}


// POST /api/admin/challenges/:id/publish
//
// This is where the "do not send duplicate notifications" requirement is
// actually enforced. PublishedDate is the guard: it is written in the same
// transaction as the notification rows, so a second click (or a double
// submit, or a retry after a timeout) finds it already set and is refused
// before a single extra Notification row is inserted.
async function publishChallenge(req, res) {
  const challengeId = parseId(req.params.id);
  if (!challengeId) return res.status(400).json({ error: 'Invalid challenge id' });

  let connection;
  try {
    connection = await getPool().getConnection();

    if (!(await hasChallengeStatus(connection))) {
      return res.status(409).json({
        error: 'Publishing needs the Challenge.Status column. Run database/admin_dashboard_extensions.sql, then reload.',
      });
    }

    // Stored procedure PROC_PUBLISH_CHALLENGE runs the whole workflow as ONE
    // transaction across three tables:
    //   1. Challenge        -- SELECT ... FOR UPDATE, then Status/PublishedDate
    //   2. Notification     -- one row per user (a single INSERT ... SELECT)
    //   3. AdminActivityLog -- which admin published it
    // It COMMITs when all three succeed and ROLLBACKs if any step fails, and
    // PublishedDate is what stops a second click from notifying everyone twice.
    const result = await connection.execute(
      `BEGIN PROC_PUBLISH_CHALLENGE(:challengeId, :adminId, :notified, :title); END;`,
      {
        challengeId,
        adminId: req.user.userId,
        notified: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        title: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 200 },
      }
    );

    const notified = result.outBinds.notified;
    const title = result.outBinds.title;

    res.json({
      message: `"${title}" is live. ${notified} user${notified === 1 ? '' : 's'} notified.`,
      notified,
    });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
    // Errors the procedure raises on purpose (RAISE_APPLICATION_ERROR):
    //   -20001 already published, -20002 not found, -20006 already ended.
    if (err.errorNum === 20001) return res.status(409).json({ error: 'This challenge has already been published.' });
    if (err.errorNum === 20002) return res.status(404).json({ error: 'Challenge not found' });
    if (err.errorNum === 20006) return res.status(400).json({ error: 'This challenge has already ended. Move its end date forward before publishing.' });
    console.error('Publish challenge error:', err);
    res.status(500).json({ error: 'Failed to publish the challenge' });
  } finally {
    if (connection) await connection.close();
  }
}


// POST /api/admin/challenges/:id/archive -- takes a live challenge out of
// circulation without deleting anyone's progress.
async function archiveChallenge(req, res) {
  const challengeId = parseId(req.params.id);
  if (!challengeId) return res.status(400).json({ error: 'Invalid challenge id' });

  let connection;
  try {
    connection = await getPool().getConnection();

    if (!(await hasChallengeStatus(connection))) {
      return res.status(409).json({
        error: 'Archiving needs the Challenge.Status column. Run database/admin_dashboard_extensions.sql, then reload.',
      });
    }

    const result = await connection.execute(
      `UPDATE Challenge SET Status = 'Archived' WHERE ChallengeID = :challengeId`,
      { challengeId }
    );
    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    await logAdminAction(connection, {
      adminId: req.user.userId,
      action: 'challenge.archive',
      targetType: 'Challenge',
      targetId: challengeId,
    });
    await connection.commit();

    res.json({ message: 'Challenge archived' });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
    const known = describeOracleError(err);
    if (known) return res.status(known.status).json({ error: known.error });
    console.error('Archive challenge error:', err);
    res.status(500).json({ error: 'Failed to archive the challenge' });
  } finally {
    if (connection) await connection.close();
  }
}


// ---------- Notifications ----------

// GET /api/admin/notifications?page=&limit=&type=&userId=
// Read-only inspection of what the platform has been sending.
async function listNotifications(req, res) {
  const { page, limit, offset } = parsePagination(req.query);

  let connection;
  try {
    connection = await getPool().getConnection();

    const conditions = [];
    const filterBinds = {};

    if (req.query.type) {
      conditions.push('n.NotifType = :type');
      filterBinds.type = req.query.type;
    }
    const userId = parseId(req.query.userId);
    if (userId) {
      conditions.push('n.UserID = :userId');
      filterBinds.userId = userId;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countResult, typeResult, result] = await Promise.all([
      connection.execute(`SELECT COUNT(*) AS Total FROM Notification n ${where}`, filterBinds),
      // The type filter is built from what has actually been sent, so it
      // never offers a category the backend doesn't produce.
      connection.execute(
        `SELECT NotifType, COUNT(*) AS Total FROM Notification
         GROUP BY NotifType ORDER BY NotifType`
      ),
      connection.execute(
        `SELECT n.NotificationID, n.NotifType, n.Message, n.RelatedID,
                n.IsRead, n.CreatedDate,
                u.UserID, u.Username, u.DisplayName
         FROM Notification n
         JOIN AppUser u ON u.UserID = n.UserID
         ${where}
         ORDER BY n.CreatedDate DESC, n.NotificationID DESC
         ${PAGE_CLAUSE}`,
        { ...filterBinds, offset, limit }
      ),
    ]);

    res.json({
      ...paginated(
        result.rows.map((row) => ({
          notificationId: row.NOTIFICATIONID,
          notifType: row.NOTIFTYPE,
          message: row.MESSAGE,
          relatedId: row.RELATEDID,
          isRead: row.ISREAD === 1,
          createdDate: row.CREATEDDATE,
          userId: row.USERID,
          username: row.USERNAME,
          displayName: row.DISPLAYNAME,
        })),
        countResult.rows[0].TOTAL,
        { page, limit }
      ),
      types: typeResult.rows.map((row) => ({ type: row.NOTIFTYPE, count: row.TOTAL })),
    });
  } catch (err) {
    console.error('Admin list notifications error:', err);
    res.status(500).json({ error: 'Failed to load notifications' });
  } finally {
    if (connection) await connection.close();
  }
}


// POST /api/admin/announcements   body: { message }
//
// Target audience is All Users and nothing else. The Notification table has
// UserID and NotifType and no concept of a segment, so a "send to admins
// only" or "send to followers of X" option would be UI that the schema cannot
// honour. One real option beats four fictional ones.
const ANNOUNCEMENT_MAX = 255; // Notification.Message is VARCHAR2(255)

async function broadcastAnnouncement(req, res) {
  const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';

  if (!message) {
    return res.status(400).json({ error: 'Write a message before sending', field: 'message' });
  }
  if (message.length > ANNOUNCEMENT_MAX) {
    return res.status(400).json({
      error: `Announcements are limited to ${ANNOUNCEMENT_MAX} characters (yours is ${message.length}).`,
      field: 'message',
    });
  }

  let connection;
  try {
    connection = await getPool().getConnection();

    const recipients = await connection.execute(`SELECT UserID FROM AppUser`);

    for (const recipient of recipients.rows) {
      await createNotification(connection, recipient.USERID, 'Announcement', message, null);
    }

    await logAdminAction(connection, {
      adminId: req.user.userId,
      action: 'announcement.send',
      targetType: 'Notification',
      details: `${recipients.rows.length} recipient(s): ${message}`,
    });

    // Single commit for the whole broadcast: either everyone gets it or
    // nobody does. A partial send is worse than a failed one, because there
    // is no way to tell who already has it before retrying.
    await connection.commit();

    res.status(201).json({
      message: `Announcement sent to ${recipients.rows.length} user${recipients.rows.length === 1 ? '' : 's'}.`,
      notified: recipients.rows.length,
    });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
    console.error('Broadcast announcement error:', err);
    res.status(500).json({ error: 'Failed to send the announcement' });
  } finally {
    if (connection) await connection.close();
  }
}


// ---------- Leaderboard ----------

// GET /api/admin/leaderboard?type=most_watched|most_reviewed|most_challenges
//
// Deliberately NOT a second ranking system. The ordering metric is the same
// one leaderboardController uses for the public board -- this view simply
// shows all four numbers side by side and adds the XP total, which is summed
// from Challenge.XPReward by the stored function FN_USER_TOTAL_XP rather than
// stored on AppUser (there is no XP column, and inventing one would put a
// denormalised counter in the schema).
const LEADERBOARD_TYPES = {
  most_watched: 'MoviesWatched',
  most_reviewed: 'Reviews',
  most_challenges: 'ChallengesCompleted',
};

async function getLeaderboard(req, res) {
  const typeKey = Object.prototype.hasOwnProperty.call(LEADERBOARD_TYPES, req.query.type)
    ? req.query.type
    : 'most_watched';
  const orderColumn = LEADERBOARD_TYPES[typeKey];

  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 25, 1), 100);

  let connection;
  try {
    connection = await getPool().getConnection();

    const result = await connection.execute(
      `SELECT * FROM (
         SELECT u.UserID, u.Username, u.DisplayName, u.ProfilePictureURL,
                (SELECT COUNT(DISTINCT j.MovieID) FROM JournalEntry j
                  WHERE j.UserID = u.UserID) AS MoviesWatched,
                (SELECT COUNT(*) FROM Review r WHERE r.UserID = u.UserID) AS Reviews,
                (SELECT COUNT(*) FROM UserChallengeProgress p
                  WHERE p.UserID = u.UserID AND p.Completed = 1) AS ChallengesCompleted,
                FN_USER_TOTAL_XP(u.UserID) AS Points
         FROM AppUser u
       )
       ORDER BY ${orderColumn} DESC, Points DESC, Username ASC
       FETCH FIRST :limit ROWS ONLY`,
      { limit }
    );

    res.json({
      available: true,
      type: typeKey,
      items: result.rows.map((row, index) => ({
        rank: index + 1,
        userId: row.USERID,
        username: row.USERNAME,
        displayName: row.DISPLAYNAME,
        profilePictureUrl: row.PROFILEPICTUREURL,
        moviesWatched: row.MOVIESWATCHED,
        reviews: row.REVIEWS,
        challengesCompleted: row.CHALLENGESCOMPLETED,
        points: row.POINTS,
      })),
    });
  } catch (err) {
    console.error('Admin leaderboard error:', err);
    res.status(500).json({ error: 'Failed to load the leaderboard' });
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = {
  CRITERIA_TYPES,
  listChallenges, getChallengeDetail, publishChallenge, archiveChallenge,
  listNotifications, broadcastAnnouncement,
  getLeaderboard,
};
