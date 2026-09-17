const oracledb = require('oracledb');
const { getPool } = require('../db');
const { createNotification } = require('./notificationController');

// PUT /api/movies/:id  (admin)
// body: any subset of { title, releaseYear, runtime, language, country,
//                        synopsis, posterUrl, trailerUrl, boxOfficeCollection }
async function updateMovie(req, res) {
  const movieId = Number(req.params.id);
  const {
    title, releaseYear, runtime, language, country,
    synopsis, posterUrl, trailerUrl, boxOfficeCollection,
  } = req.body;

  let connection;
  try {
    connection = await getPool().getConnection();

    // If title and/or releaseYear are being changed, make sure the new
    // combination doesn't already belong to a different movie.
    if (title || releaseYear) {
      const current = await connection.execute(
        `SELECT Title, ReleaseYear FROM Movie WHERE MovieID = :movieId`,
        { movieId }
      );
      if (current.rows.length === 0) {
        return res.status(404).json({ error: 'Movie not found' });
      }
      const effectiveTitle = title || current.rows[0].TITLE;
      const effectiveYear = releaseYear || current.rows[0].RELEASEYEAR;

      const clash = await connection.execute(
        `SELECT MovieID FROM Movie
         WHERE Title = :effectiveTitle AND ReleaseYear = :effectiveYear AND MovieID != :movieId`,
        { effectiveTitle, effectiveYear, movieId }
      );
      if (clash.rows.length > 0) {
        return res.status(409).json({
          error: 'Another movie with this title and release year already exists',
          movieId: clash.rows[0].MOVIEID,
        });
      }
    }

    const result = await connection.execute(
      `UPDATE Movie SET
         Title = NVL(:title, Title),
         ReleaseYear = NVL(:releaseYear, ReleaseYear),
         Runtime = NVL(:runtime, Runtime),
         Language = NVL(:language, Language),
         Country = NVL(:country, Country),
         Synopsis = NVL(:synopsis, Synopsis),
         PosterURL = NVL(:posterUrl, PosterURL),
         TrailerURL = NVL(:trailerUrl, TrailerURL),
         BOX_OFFICE_COLLECTION = NVL(:boxOfficeCollection, BOX_OFFICE_COLLECTION)
       WHERE MovieID = :movieId`,
      {
        title: title || null,
        releaseYear: releaseYear || null,
        runtime: runtime || null,
        language: language || null,
        country: country || null,
        synopsis: synopsis || null,
        posterUrl: posterUrl || null,
        trailerUrl: trailerUrl || null,
        boxOfficeCollection: boxOfficeCollection || null,
        movieId,
      },
      { autoCommit: true }
    );

    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Movie not found' });
    }
    res.json({ message: 'Movie updated' });
  } catch (err) {
    console.error('Update movie error:', err);
    res.status(500).json({ error: 'Failed to update movie' });
  } finally {
    if (connection) await connection.close();
  }
}

// DELETE /api/movies/:id  (admin)
async function deleteMovie(req, res) {
  const movieId = Number(req.params.id);

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `DELETE FROM Movie WHERE MovieID = :movieId`,
      { movieId },
      { autoCommit: true }
    );
    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Movie not found' });
    }
    res.json({ message: 'Movie deleted' });
  } catch (err) {
    // ORA-02292: a child row exists somewhere WITHOUT cascade delete set up
    if (err.errorNum === 2292) {
      return res.status(409).json({
        error: 'Cannot delete this movie -- it still has related records (reviews, posts, etc.) that block deletion',
      });
    }
    console.error('Delete movie error:', err);
    res.status(500).json({ error: 'Failed to delete movie' });
  } finally {
    if (connection) await connection.close();
  }
}

// POST /api/genres  (admin)
// body: { genreName }
async function createGenre(req, res) {
  const { genreName } = req.body;
  if (!genreName) {
    return res.status(400).json({ error: 'genreName is required' });
  }

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `INSERT INTO Genre (GenreID, GenreName) VALUES (seq_genre.NEXTVAL, :genreName)
       RETURNING GenreID INTO :newId`,
      { genreName, newId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } },
      { autoCommit: true }
    );
    res.status(201).json({ message: 'Genre created', genreId: result.outBinds.newId[0] });
  } catch (err) {
    if (err.errorNum === 1) {
      return res.status(409).json({ error: 'Genre already exists' });
    }
    console.error('Create genre error:', err);
    res.status(500).json({ error: 'Failed to create genre' });
  } finally {
    if (connection) await connection.close();
  }
}

// POST /api/people  (admin)
// body: { fullName, dateOfBirth? }
async function createPerson(req, res) {
  const { fullName, dateOfBirth } = req.body;
  if (!fullName) {
    return res.status(400).json({ error: 'fullName is required' });
  }

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `INSERT INTO Person (PersonID, FullName, DateOfBirth)
       VALUES (seq_person.NEXTVAL, :fullName, :dateOfBirth)
       RETURNING PersonID INTO :newId`,
      {
        fullName,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        newId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
      { autoCommit: true }
    );
    res.status(201).json({ message: 'Person created', personId: result.outBinds.newId[0] });
  } catch (err) {
    console.error('Create person error:', err);
    res.status(500).json({ error: 'Failed to create person' });
  } finally {
    if (connection) await connection.close();
  }
}

// POST /api/movies/:id/credits  (admin)
// body: { personId, roleType: 'Actor' | 'Director' | 'Writer', characterName? }
async function addCredit(req, res) {
  const movieId = Number(req.params.id);
  const { personId, roleType, characterName } = req.body;

  if (!personId || !roleType) {
    return res.status(400).json({ error: 'personId and roleType are required' });
  }
  if (!['Actor', 'Director', 'Writer'].includes(roleType)) {
    return res.status(400).json({ error: "roleType must be 'Actor', 'Director', or 'Writer'" });
  }

  let connection;
  try {
    connection = await getPool().getConnection();
    await connection.execute(
      `INSERT INTO MovieCredit (MovieID, PersonID, RoleType, CharacterName)
       VALUES (:movieId, :personId, :roleType, :characterName)`,
      { movieId, personId, roleType, characterName: characterName || null },
      { autoCommit: true }
    );
    res.status(201).json({ message: 'Credit added' });
  } catch (err) {
    if (err.errorNum === 2291) {
      return res.status(404).json({ error: 'Movie or person not found' });
    }
    console.error('Add credit error:', err);
    res.status(500).json({ error: 'Failed to add credit' });
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = {
  updateMovie, deleteMovie, createGenre, createPerson, addCredit,
  createChallenge, updateChallenge, deleteChallenge,
  moderateDeletePost, moderateDeleteComment, moderateDeleteReview,
  listUsers, setUserRole,
};

// ---------- Challenge management ----------

// POST /api/admin/challenges  (admin)
async function createChallenge(req, res) {
  const { title, description, criteriaType, criteriaValue, targetCount, xpReward, startDate, endDate } = req.body;

  if (!title || !targetCount || !xpReward) {
    return res.status(400).json({ error: 'title, targetCount, and xpReward are required' });
  }

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `INSERT INTO Challenge (ChallengeID, Title, Description, CriteriaType, CriteriaValue, TargetCount, XPReward, StartDate, EndDate)
       VALUES (seq_challenge.NEXTVAL, :title, :description, :criteriaType, :criteriaValue, :targetCount, :xpReward, :startDate, :endDate)
       RETURNING ChallengeID INTO :newId`,
      {
        title,
        description: description || null,
        criteriaType: criteriaType || null,
        criteriaValue: criteriaValue || null,
        targetCount,
        xpReward,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        newId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
      { autoCommit: false }
    );
    const recipients = await connection.execute('SELECT UserID FROM AppUser');
    for (const recipient of recipients.rows) {
      await createNotification(connection, recipient.USERID, 'WeeklyChallenge', `New weekly challenge: ${title}`, result.outBinds.newId[0]);
    }
    await connection.commit();
    res.status(201).json({ message: 'Challenge created', challengeId: result.outBinds.newId[0] });
  } catch (err) {
    console.error('Create challenge error:', err);
    res.status(500).json({ error: 'Failed to create challenge' });
  } finally {
    if (connection) await connection.close();
  }
}

// PUT /api/admin/challenges/:id  (admin)
async function updateChallenge(req, res) {
  const challengeId = Number(req.params.id);
  const { title, description, criteriaType, criteriaValue, targetCount, xpReward, startDate, endDate } = req.body;

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `UPDATE Challenge SET
         Title = NVL(:title, Title),
         Description = NVL(:description, Description),
         CriteriaType = NVL(:criteriaType, CriteriaType),
         CriteriaValue = NVL(:criteriaValue, CriteriaValue),
         TargetCount = NVL(:targetCount, TargetCount),
         XPReward = NVL(:xpReward, XPReward),
         StartDate = NVL(:startDate, StartDate),
         EndDate = NVL(:endDate, EndDate)
       WHERE ChallengeID = :challengeId`,
      {
        title: title || null,
        description: description || null,
        criteriaType: criteriaType || null,
        criteriaValue: criteriaValue || null,
        targetCount: targetCount || null,
        xpReward: xpReward || null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        challengeId,
      },
      { autoCommit: true }
    );
    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Challenge not found' });
    }
    res.json({ message: 'Challenge updated' });
  } catch (err) {
    console.error('Update challenge error:', err);
    res.status(500).json({ error: 'Failed to update challenge' });
  } finally {
    if (connection) await connection.close();
  }
}

// DELETE /api/admin/challenges/:id  (admin)
async function deleteChallenge(req, res) {
  const challengeId = Number(req.params.id);

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `DELETE FROM Challenge WHERE ChallengeID = :challengeId`,
      { challengeId },
      { autoCommit: true }
    );
    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Challenge not found' });
    }
    res.json({ message: 'Challenge deleted' });
  } catch (err) {
    console.error('Delete challenge error:', err);
    res.status(500).json({ error: 'Failed to delete challenge' });
  } finally {
    if (connection) await connection.close();
  }
}

// ---------- Moderation (admin can remove ANY post/comment/review, not just their own) ----------

// DELETE /api/admin/posts/:id  (admin)
async function moderateDeletePost(req, res) {
  const postId = Number(req.params.id);

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `DELETE FROM Post WHERE PostID = :postId`,
      { postId },
      { autoCommit: true }
    );
    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }
    res.json({ message: 'Post removed by moderator' });
  } catch (err) {
    console.error('Moderate delete post error:', err);
    res.status(500).json({ error: 'Failed to remove post' });
  } finally {
    if (connection) await connection.close();
  }
}

// DELETE /api/admin/comments/:id  (admin)
async function moderateDeleteComment(req, res) {
  const commentId = Number(req.params.id);

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `DELETE FROM PostComment WHERE CommentID = :commentId`,
      { commentId },
      { autoCommit: true }
    );
    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    res.json({ message: 'Comment removed by moderator' });
  } catch (err) {
    console.error('Moderate delete comment error:', err);
    res.status(500).json({ error: 'Failed to remove comment' });
  } finally {
    if (connection) await connection.close();
  }
}

// DELETE /api/admin/reviews/:id  (admin) -- :id here is the review's UserID_MovieID pair, passed as query params
// Reviews have a composite key (UserID, MovieID), not a single ID, so this takes both.
async function moderateDeleteReview(req, res) {
  const { userId, movieId } = req.query;

  if (!userId || !movieId) {
    return res.status(400).json({ error: 'userId and movieId query params are required' });
  }

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `DELETE FROM Review WHERE UserID = :userId AND MovieID = :movieId`,
      { userId: Number(userId), movieId: Number(movieId) },
      { autoCommit: true }
    );
    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Review not found' });
    }
    res.json({ message: 'Review removed by moderator' });
  } catch (err) {
    console.error('Moderate delete review error:', err);
    res.status(500).json({ error: 'Failed to remove review' });
  } finally {
    if (connection) await connection.close();
  }
}

// ---------- User management ----------

// GET /api/admin/users  (admin)
async function listUsers(req, res) {
  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `SELECT UserID, Username, Email, DisplayName, JoinDate, IsAdmin FROM AppUser ORDER BY UserID`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  } finally {
    if (connection) await connection.close();
  }
}

// PUT /api/admin/users/:id/role  (admin)
// body: { isAdmin: true | false }
async function setUserRole(req, res) {
  const targetUserId = Number(req.params.id);
  const { isAdmin } = req.body;

  if (typeof isAdmin !== 'boolean') {
    return res.status(400).json({ error: 'isAdmin (true/false) is required' });
  }

  if (!Number.isInteger(targetUserId) || targetUserId < 1) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  // Demoting yourself would drop you out of the admin area mid-session with
  // a token that still says isAdmin -- confusing, and easy to do by accident.
  if (!isAdmin && targetUserId === req.user.userId) {
    return res.status(400).json({ error: 'You cannot remove your own admin access' });
  }

  let connection;
  try {
    connection = await getPool().getConnection();

    // Guard the one irreversible case: demoting the final admin leaves nobody
    // able to promote anyone back, and the only fix is editing the database
    // by hand.
    if (!isAdmin) {
      const adminCount = await connection.execute(
        `SELECT COUNT(*) AS Total FROM AppUser WHERE IsAdmin = 1`
      );
      if (adminCount.rows[0].TOTAL <= 1) {
        return res.status(409).json({ error: 'Cannot demote the only remaining admin' });
      }
    }

    const result = await connection.execute(
      `UPDATE AppUser SET IsAdmin = :isAdmin WHERE UserID = :targetUserId`,
      { isAdmin: isAdmin ? 1 : 0, targetUserId },
      { autoCommit: true }
    );
    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: `User ${isAdmin ? 'promoted to admin' : 'demoted to regular user'}` });
  } catch (err) {
    console.error('Set user role error:', err);
    res.status(500).json({ error: 'Failed to update user role' });
  } finally {
    if (connection) await connection.close();
  }
}
