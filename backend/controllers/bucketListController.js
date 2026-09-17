const oracledb = require('oracledb');
const { getPool } = require('../db');

// Finds a user's system list of a given type (e.g. 'System-Watchlist'),
// creating it on first use. This is what makes "Add to Watchlist"
// work with a single click instead of asking the user to create a list first.
async function getOrCreateSystemList(connection, userId, listType) {
  const existing = await connection.execute(
    `SELECT ListID FROM BucketList WHERE UserID = :userId AND ListType = :listType`,
    { userId, listType }
  );

  if (existing.rows.length > 0) {
    return existing.rows[0].LISTID;
  }

  const title = listType === 'System-Watchlist' ? 'Watchlist' : 'Favorites';
  const result = await connection.execute(
    `INSERT INTO BucketList (ListID, UserID, Title, Visibility, ListType)
     VALUES (seq_bucketlist.NEXTVAL, :userId, :title, 'Private', :listType)
     RETURNING ListID INTO :newId`,
    {
      userId,
      title,
      listType,
      newId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    }
  );
  return result.outBinds.newId[0];
}

// POST /api/movies/:id/watchlist  (auth) -- add a movie to MY watchlist
async function addToWatchlist(req, res) {
  const movieId = Number(req.params.id);
  const userId = req.user.userId;

  let connection;
  try {
    connection = await getPool().getConnection();
    const listId = await getOrCreateSystemList(connection, userId, 'System-Watchlist');

    const existing = await connection.execute(
      `SELECT 1 FROM BucketListItem WHERE ListID = :listId AND MovieID = :movieId`,
      { listId, movieId }
    );

    if (existing.rows.length === 0) {
      await connection.execute(
        `INSERT INTO BucketListItem (ListID, MovieID, DateAdded) VALUES (:listId, :movieId, SYSDATE)`,
        { listId, movieId }
      );
    }
    await connection.commit();

    res.status(201).json({ message: 'Added to watchlist' });
  } catch (err) {
    if (err.errorNum === 2291) {
      return res.status(404).json({ error: 'Movie not found' });
    }
    console.error('Add to watchlist error:', err);
    res.status(500).json({ error: 'Failed to add to watchlist' });
  } finally {
    if (connection) await connection.close();
  }
}

// DELETE /api/movies/:id/watchlist  (auth)
async function removeFromWatchlist(req, res) {
  const movieId = Number(req.params.id);
  const userId = req.user.userId;

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `DELETE FROM BucketListItem
       WHERE MovieID = :movieId
       AND ListID = (SELECT ListID FROM BucketList WHERE UserID = :userId AND ListType = 'System-Watchlist')`,
      { movieId, userId },
      { autoCommit: true }
    );

    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Movie was not in your watchlist' });
    }
    res.json({ message: 'Removed from watchlist' });
  } catch (err) {
    console.error('Remove from watchlist error:', err);
    res.status(500).json({ error: 'Failed to remove from watchlist' });
  } finally {
    if (connection) await connection.close();
  }
}

// GET /api/users/:id/watchlist  (optional auth)
// You always see your own. Someone else's is only readable if they set that
// list to Public -- otherwise 403, even though the URL is guessable. Changing
// the :id in the address bar is the exact attack this blocks.
async function getWatchlist(req, res) {
  const userId = Number(req.params.id);
  const viewerId = req.user ? req.user.userId : null;

  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  let connection;
  try {
    connection = await getPool().getConnection();

    const listResult = await connection.execute(
      `SELECT ListID, Visibility FROM BucketList
       WHERE UserID = :userId AND ListType = 'System-Watchlist'`,
      { userId }
    );

    // No watchlist row yet just means they have never added anything.
    if (listResult.rows.length === 0) {
      return res.json([]);
    }

    const list = listResult.rows[0];
    const isOwner = viewerId === userId;

    if (!isOwner && list.VISIBILITY !== 'Public') {
      return res.status(403).json({ error: "This user's watchlist is private" });
    }

    const result = await connection.execute(
      `SELECT m.MovieID, m.Title, m.ReleaseYear, m.PosterURL, bli.DateAdded
       FROM BucketListItem bli
       JOIN Movie m ON m.MovieID = bli.MovieID
       WHERE bli.ListID = :listId
       ORDER BY bli.DateAdded DESC`,
      { listId: list.LISTID }
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get watchlist error:', err);
    res.status(500).json({ error: 'Failed to fetch watchlist' });
  } finally {
    if (connection) await connection.close();
  }
}

// ---------- Custom lists ----------

// POST /api/bucket-lists  (auth)
// body: { title, description?, visibility? }  -- always creates a 'Custom' list
async function createList(req, res) {
  const userId = req.user.userId;
  const { title, description, visibility } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'title is required' });
  }

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `INSERT INTO BucketList (ListID, UserID, Title, Description, Visibility, ListType)
       VALUES (seq_bucketlist.NEXTVAL, :userId, :title, :description, :visibility, 'Custom')
       RETURNING ListID INTO :newId`,
      {
        userId,
        title,
        description: description || null,
        visibility: visibility || 'Private',
        newId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
      { autoCommit: true }
    );
    res.status(201).json({ message: 'List created', listId: result.outBinds.newId[0] });
  } catch (err) {
    console.error('Create list error:', err);
    res.status(500).json({ error: 'Failed to create list' });
  } finally {
    if (connection) await connection.close();
  }
}

// GET /api/bucket-lists  (auth) -- all lists belonging to ME (system + custom)
async function getMyLists(req, res) {
  const userId = req.user.userId;

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `SELECT bl.ListID, bl.Title, bl.Description, bl.Visibility, bl.ListType,
              COUNT(bli.MovieID) AS ItemCount
       FROM BucketList bl
       LEFT JOIN BucketListItem bli ON bli.ListID = bl.ListID
       WHERE bl.UserID = :userId
       GROUP BY bl.ListID, bl.Title, bl.Description, bl.Visibility, bl.ListType
       ORDER BY bl.ListType, bl.Title`,
      { userId }
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get my lists error:', err);
    res.status(500).json({ error: 'Failed to fetch lists' });
  } finally {
    if (connection) await connection.close();
  }
}

// GET /api/bucket-lists/:id  (optional auth)
// Object-level check: owning the list is what grants access, not merely
// knowing its id. A Private list belonging to someone else is 403 even for
// a logged-in user, and 403 for an anonymous one -- incrementing :id through
// /bucket-lists/1, /2, /3 reveals nothing.
async function getListDetail(req, res) {
  const listId = Number(req.params.id);
  const viewerId = req.user ? req.user.userId : null;

  if (!Number.isInteger(listId) || listId < 1) {
    return res.status(400).json({ error: 'Invalid list id' });
  }

  let connection;
  try {
    connection = await getPool().getConnection();

    const listResult = await connection.execute(
      `SELECT ListID, UserID, Title, Description, Visibility, ListType FROM BucketList WHERE ListID = :listId`,
      { listId }
    );
    if (listResult.rows.length === 0) {
      return res.status(404).json({ error: 'List not found' });
    }

    const list = listResult.rows[0];
    if (list.USERID !== viewerId && list.VISIBILITY !== 'Public') {
      return res.status(403).json({ error: 'This list is private' });
    }

    const itemsResult = await connection.execute(
      `SELECT m.MovieID, m.Title, m.ReleaseYear, m.PosterURL, bli.DateAdded
       FROM BucketListItem bli
       JOIN Movie m ON m.MovieID = bli.MovieID
       WHERE bli.ListID = :listId
       ORDER BY bli.DateAdded DESC`,
      { listId }
    );

    res.json({ ...list, items: itemsResult.rows });
  } catch (err) {
    console.error('Get list detail error:', err);
    res.status(500).json({ error: 'Failed to fetch list' });
  } finally {
    if (connection) await connection.close();
  }
}

// POST /api/bucket-lists/:id/items  (auth, must own the list)
// body: { movieId }
async function addItemToList(req, res) {
  const listId = Number(req.params.id);
  const userId = req.user.userId;
  const { movieId } = req.body;

  if (!movieId) {
    return res.status(400).json({ error: 'movieId is required' });
  }

  let connection;
  try {
    connection = await getPool().getConnection();

    const ownerCheck = await connection.execute(
      `SELECT UserID FROM BucketList WHERE ListID = :listId`,
      { listId }
    );
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'List not found' });
    }
    if (ownerCheck.rows[0].USERID !== userId) {
      return res.status(403).json({ error: 'You do not own this list' });
    }

    await connection.execute(
      `INSERT INTO BucketListItem (ListID, MovieID, DateAdded) VALUES (:listId, :movieId, SYSDATE)`,
      { listId, movieId },
      { autoCommit: true }
    );
    res.status(201).json({ message: 'Movie added to list' });
  } catch (err) {
    if (err.errorNum === 1) {
      return res.status(409).json({ error: 'Movie is already in this list' });
    }
    if (err.errorNum === 2291) {
      return res.status(404).json({ error: 'Movie not found' });
    }
    console.error('Add item to list error:', err);
    res.status(500).json({ error: 'Failed to add movie to list' });
  } finally {
    if (connection) await connection.close();
  }
}

// DELETE /api/bucket-lists/:id/items/:movieId  (auth, must own the list)
async function removeItemFromList(req, res) {
  const listId = Number(req.params.id);
  const movieId = Number(req.params.movieId);
  const userId = req.user.userId;

  let connection;
  try {
    connection = await getPool().getConnection();

    const ownerCheck = await connection.execute(
      `SELECT UserID FROM BucketList WHERE ListID = :listId`,
      { listId }
    );
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'List not found' });
    }
    if (ownerCheck.rows[0].USERID !== userId) {
      return res.status(403).json({ error: 'You do not own this list' });
    }

    await connection.execute(
      `DELETE FROM BucketListItem WHERE ListID = :listId AND MovieID = :movieId`,
      { listId, movieId },
      { autoCommit: true }
    );
    res.json({ message: 'Movie removed from list' });
  } catch (err) {
    console.error('Remove item from list error:', err);
    res.status(500).json({ error: 'Failed to remove movie from list' });
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = {
  addToWatchlist,
  removeFromWatchlist,
  getWatchlist,
  createList,
  getMyLists,
  getListDetail,
  addItemToList,
  removeItemFromList,
};
