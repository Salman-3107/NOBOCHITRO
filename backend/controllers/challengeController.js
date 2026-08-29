const { getPool } = require('../db');

// GET /api/challenges  (public) -- currently active challenges
async function listChallenges(req, res) {
  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `SELECT ChallengeID, Title, Description, CriteriaType, CriteriaValue,
              TargetCount, XPReward, StartDate, EndDate
       FROM Challenge
       WHERE (StartDate IS NULL OR StartDate <= SYSDATE)
         AND (EndDate IS NULL OR EndDate >= SYSDATE)
       ORDER BY EndDate ASC NULLS LAST`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('List challenges error:', err);
    res.status(500).json({ error: 'Failed to fetch challenges' });
  } finally {
    if (connection) await connection.close();
  }
}

// POST /api/challenges/:id/join  (auth)
async function joinChallenge(req, res) {
  const challengeId = Number(req.params.id);
  const userId = req.user.userId;

  let connection;
  try {
    connection = await getPool().getConnection();
    await connection.execute(
      `INSERT INTO UserChallengeProgress (UserID, ChallengeID, CurrentProgress, Completed)
       VALUES (:userId, :challengeId, 0, 0)`,
      { userId, challengeId },
      { autoCommit: true }
    );
    res.status(201).json({ message: 'Joined challenge' });
  } catch (err) {
    if (err.errorNum === 1) {
      return res.status(409).json({ error: 'You already joined this challenge' });
    }
    if (err.errorNum === 2291) {
      return res.status(404).json({ error: 'Challenge not found' });
    }
    console.error('Join challenge error:', err);
    res.status(500).json({ error: 'Failed to join challenge' });
  } finally {
    if (connection) await connection.close();
  }
}

// GET /api/users/:id/challenges  (public) -- a user's joined challenges + progress
async function getUserChallenges(req, res) {
  const userId = Number(req.params.id);

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `SELECT c.ChallengeID, c.Title, c.Description, c.TargetCount, c.XPReward,
              ucp.CurrentProgress, ucp.Completed, ucp.CompletionDate
       FROM UserChallengeProgress ucp
       JOIN Challenge c ON c.ChallengeID = ucp.ChallengeID
       WHERE ucp.UserID = :userId
       ORDER BY ucp.Completed ASC, c.EndDate ASC NULLS LAST`,
      { userId }
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get user challenges error:', err);
    res.status(500).json({ error: 'Failed to fetch challenge progress' });
  } finally {
    if (connection) await connection.close();
  }
}

// ---------- Auto-evaluation engine ----------
//
// Called from journalController right after a journal entry is saved.
// Checks every challenge this user has JOINED but not yet COMPLETED,
// and increments progress if the just-watched movie satisfies that
// challenge's CriteriaType. Runs on the SAME connection/transaction
// as the journal insert that triggered it, so it commits or rolls
// back together with it -- no partial state if something fails.
async function evaluateChallengeProgress(connection, userId, movieId) {
  const activeChallenges = await connection.execute(
    `SELECT c.ChallengeID, c.CriteriaType, c.CriteriaValue, c.TargetCount, ucp.CurrentProgress
     FROM UserChallengeProgress ucp
     JOIN Challenge c ON c.ChallengeID = ucp.ChallengeID
     WHERE ucp.UserID = :userId AND ucp.Completed = 0`,
    { userId }
  );

  if (activeChallenges.rows.length === 0) return;

  const movieResult = await connection.execute(
    `SELECT ReleaseYear FROM Movie WHERE MovieID = :movieId`,
    { movieId }
  );
  const releaseYear = movieResult.rows[0]?.RELEASEYEAR;

  const genreResult = await connection.execute(
    `SELECT g.GenreName FROM MovieGenre mg JOIN Genre g ON g.GenreID = mg.GenreID WHERE mg.MovieID = :movieId`,
    { movieId }
  );
  const genreNames = genreResult.rows.map((r) => r.GENRENAME);

  const directorResult = await connection.execute(
    `SELECT p.FullName FROM MovieCredit mc JOIN Person p ON p.PersonID = mc.PersonID
     WHERE mc.MovieID = :movieId AND mc.RoleType = 'Director'`,
    { movieId }
  );
  const directorNames = directorResult.rows.map((r) => r.FULLNAME);

  for (const challenge of activeChallenges.rows) {
    let matches = false;

    switch (challenge.CRITERIATYPE) {
      case 'WatchCount':
        matches = true; // any watched movie counts
        break;
      case 'Genre':
        matches = genreNames.includes(challenge.CRITERIAVALUE);
        break;
      case 'Director':
        matches = directorNames.includes(challenge.CRITERIAVALUE);
        break;
      case 'ReleaseBefore':
        matches = releaseYear != null && releaseYear < Number(challenge.CRITERIAVALUE);
        break;
      default:
        matches = false; // unrecognized criteria types are left for manual/future handling
    }

    if (!matches) continue;

    const newProgress = challenge.CURRENTPROGRESS + 1;
    const isNowComplete = newProgress >= challenge.TARGETCOUNT;

    await connection.execute(
      `UPDATE UserChallengeProgress
       SET CurrentProgress = :newProgress,
           Completed = :completed,
           CompletionDate = CASE WHEN :completed = 1 THEN SYSDATE ELSE CompletionDate END
       WHERE UserID = :userId AND ChallengeID = :challengeId`,
      {
        newProgress,
        completed: isNowComplete ? 1 : 0,
        userId,
        challengeId: challenge.CHALLENGEID,
      }
    );
  }
}

module.exports = { listChallenges, joinChallenge, getUserChallenges, evaluateChallengeProgress };
