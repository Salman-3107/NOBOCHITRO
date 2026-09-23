const { getPool } = require('../db');

// GET /api/search?q=term  (auth)
// Optional: &only=movies|people|users  -> run just that one lookup. The header's
// member search uses only=users so it doesn't pay for the movie/cast queries.
async function search(req, res) {
  const { q, only } = req.query;
  const wants = (kind) => !only || only === kind;
  const skipped = { rows: [] };

  if (!q || q.trim().length === 0) {
    return res.status(400).json({ error: 'Query parameter q is required' });
  }
  const term = `%${q.trim()}%`;
  const prefix = `${q.trim()}%`;

  let connection;
  try {
    connection = await getPool().getConnection();

    const [movies, people, users] = await Promise.all([
      wants('movies')
        ? connection.execute(
          `SELECT MovieID, Title, ReleaseYear, PosterURL FROM Movie WHERE UPPER(Title) LIKE UPPER(:term) FETCH FIRST 10 ROWS ONLY`,
          { term }
        )
        : skipped,
      wants('people')
        ? connection.execute(
          `SELECT PersonID, FullName FROM Person WHERE UPPER(FullName) LIKE UPPER(:term) FETCH FIRST 10 ROWS ONLY`,
          { term }
        )
        : skipped,
      // Members: matches on username OR display name. Names that START with the
      // typed text sort first ("fah" -> fahim before shafah). Admin accounts are
      // left out -- they live in the admin console and have no public profile.
      wants('users')
        ? connection.execute(
          `SELECT UserID, Username, DisplayName, ProfilePictureURL FROM AppUser
           WHERE (UPPER(Username) LIKE UPPER(:term) OR UPPER(DisplayName) LIKE UPPER(:term))
             AND IsAdmin = 0
           ORDER BY CASE WHEN UPPER(Username) LIKE UPPER(:prefix)
                           OR UPPER(DisplayName) LIKE UPPER(:prefix) THEN 0 ELSE 1 END,
                    UPPER(Username)
           FETCH FIRST 10 ROWS ONLY`,
          { term, prefix }
        )
        : skipped,
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
