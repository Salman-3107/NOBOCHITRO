const { getPool } = require('../db');

// GET /api/search?q=term  (public)
async function search(req, res) {
  const { q } = req.query;

  if (!q || q.trim().length === 0) {
    return res.status(400).json({ error: 'Query parameter q is required' });
  }
  const term = `%${q.trim()}%`;

  let connection;
  try {
    connection = await getPool().getConnection();

    const [movies, people, users] = await Promise.all([
      connection.execute(
        `SELECT MovieID, Title, ReleaseYear FROM Movie WHERE UPPER(Title) LIKE UPPER(:term) FETCH FIRST 10 ROWS ONLY`,
        { term }
      ),
      connection.execute(
        `SELECT PersonID, FullName FROM Person WHERE UPPER(FullName) LIKE UPPER(:term) FETCH FIRST 10 ROWS ONLY`,
        { term }
      ),
      connection.execute(
        `SELECT UserID, Username, DisplayName FROM AppUser
         WHERE UPPER(Username) LIKE UPPER(:term) OR UPPER(DisplayName) LIKE UPPER(:term)
         FETCH FIRST 10 ROWS ONLY`,
        { term }
      ),
    ]);

    res.json({
      movies: movies.rows,
      people: people.rows,
      users: users.rows,
    });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = { search };
