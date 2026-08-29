const oracledb = require('oracledb');
const { getPool } = require('../db');
const { evaluateChallengeProgress } = require('./challengeController');

// POST /api/movies/:id/journal  (auth)
// body: { watchDate?, watchTime?, watchLocation?, watchedWith?,
//         moodBefore?, moodAfter?, favoriteScene?, privacy?, journalText? }
// RewatchNumber is computed server-side, not trusted from the client --
// it's simply "how many times has this user already logged this movie?" + 1.
async function createEntry(req, res) {
  const movieId = Number(req.params.id);
  const userId = req.user.userId;
  const {
    watchDate, watchTime, watchLocation, watchedWith,
    moodBefore, moodAfter, favoriteScene, privacy, journalText,
  } = req.body;

  let connection;
  try {
    connection = await getPool().getConnection();

    const countResult = await connection.execute(
      `SELECT COUNT(*) AS PriorCount FROM JournalEntry WHERE UserID = :userId AND MovieID = :movieId`,
      { userId, movieId }
    );
    const rewatchNumber = countResult.rows[0].PRIORCOUNT + 1;

    const result = await connection.execute(
      `INSERT INTO JournalEntry (
         JournalID, UserID, MovieID, WatchDate, WatchTime, WatchLocation,
         WatchedWith, MoodBefore, MoodAfter, RewatchNumber, FavoriteScene, Privacy, JournalText
       ) VALUES (
         seq_journalentry.NEXTVAL, :userId, :movieId,
         NVL(:watchDate, SYSDATE), :watchTime, :watchLocation, :watchedWith,
         :moodBefore, :moodAfter, :rewatchNumber, :favoriteScene, :privacy, :journalText
       )
       RETURNING JournalID INTO :newId`,
      {
        userId,
        movieId,
        watchDate: watchDate ? new Date(watchDate) : null,
        watchTime: watchTime || null,
        watchLocation: watchLocation || null,
        watchedWith: watchedWith || null,
        moodBefore: moodBefore || null,
        moodAfter: moodAfter || null,
        rewatchNumber,
        favoriteScene: favoriteScene || null,
        privacy: privacy === 'Public' ? 'Public' : 'Private',
        journalText: journalText || null,
        newId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
      { autoCommit: false }
    );

    const journalId = result.outBinds.newId[0];

    // Check this movie against every challenge the user has joined,
    // updating progress in the SAME transaction as the journal insert
    // above -- so either both succeed together, or neither does.
    await evaluateChallengeProgress(connection, userId, movieId);
    await connection.commit();

    res.status(201).json({
      message: 'Journal entry saved',
      journalId,
      rewatchNumber,
    });
  } catch (err) {
    if (err.errorNum === 2291) {
      return res.status(404).json({ error: 'Movie not found' });
    }
    console.error('Create journal entry error:', err);
    res.status(500).json({ error: 'Failed to save journal entry' });
  } finally {
    if (connection) await connection.close();
  }
}

// GET /api/users/:id/journal  (optional auth)
// Shows ALL entries if the viewer IS that user; otherwise only Public ones.
async function getUserJournal(req, res) {
  const profileUserId = Number(req.params.id);
  const viewerId = req.user ? req.user.userId : null;
  const isOwner = viewerId === profileUserId;

  let connection;
  try {
    connection = await getPool().getConnection();

    let sql = `
      SELECT j.JournalID, j.WatchDate, j.WatchTime, j.WatchLocation, j.WatchedWith,
             j.MoodBefore, j.MoodAfter, j.RewatchNumber, j.FavoriteScene,
             j.Privacy, j.JournalText,
             m.MovieID, m.Title AS MovieTitle, m.PosterURL
      FROM JournalEntry j
      JOIN Movie m ON m.MovieID = j.MovieID
      WHERE j.UserID = :profileUserId
    `;
    if (!isOwner) {
      sql += ` AND j.Privacy = 'Public'`;
    }
    sql += ' ORDER BY j.WatchDate DESC';

    const result = await connection.execute(sql, { profileUserId });
    res.json(result.rows);
  } catch (err) {
    console.error('Get user journal error:', err);
    res.status(500).json({ error: 'Failed to fetch journal' });
  } finally {
    if (connection) await connection.close();
  }
}

// GET /api/journal/:id  (optional auth) -- single entry, respects privacy
async function getEntry(req, res) {
  const journalId = Number(req.params.id);
  const viewerId = req.user ? req.user.userId : null;

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `SELECT j.JournalID, j.UserID, j.WatchDate, j.WatchTime, j.WatchLocation, j.WatchedWith,
              j.MoodBefore, j.MoodAfter, j.RewatchNumber, j.FavoriteScene,
              j.Privacy, j.JournalText,
              m.MovieID, m.Title AS MovieTitle, m.PosterURL
       FROM JournalEntry j
       JOIN Movie m ON m.MovieID = j.MovieID
       WHERE j.JournalID = :journalId`,
      { journalId }
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Journal entry not found' });
    }

    const entry = result.rows[0];
    if (entry.PRIVACY === 'Private' && entry.USERID !== viewerId) {
      return res.status(403).json({ error: 'This journal entry is private' });
    }

    res.json(entry);
  } catch (err) {
    console.error('Get journal entry error:', err);
    res.status(500).json({ error: 'Failed to fetch journal entry' });
  } finally {
    if (connection) await connection.close();
  }
}

// DELETE /api/journal/:id  (auth, owner only)
async function deleteEntry(req, res) {
  const journalId = Number(req.params.id);
  const userId = req.user.userId;

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `DELETE FROM JournalEntry WHERE JournalID = :journalId AND UserID = :userId`,
      { journalId, userId },
      { autoCommit: true }
    );
    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Journal entry not found, or not yours' });
    }
    res.json({ message: 'Journal entry deleted' });
  } catch (err) {
    console.error('Delete journal entry error:', err);
    res.status(500).json({ error: 'Failed to delete journal entry' });
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = { createEntry, getUserJournal, getEntry, deleteEntry };
