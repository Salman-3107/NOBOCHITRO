const jwt = require('jsonwebtoken');
const { getPool } = require('../db');

// Reads "Authorization: Bearer <token>", verifies it, and attaches
// the decoded payload (userId, username, jti, exp) to req.user.
// Also rejects tokens whose jti has been explicitly revoked via
// logout, even though the signature and expiry are still valid --
// that's what makes logout an actual server-side session end, not
// just the frontend forgetting its copy of the token.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = header.split(' ')[1];

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Tokens issued before the jti/logout feature existed have nothing to
  // check against -- let them through on signature+expiry alone, same
  // as before. New tokens always have a jti.
  if (!payload.jti) {
    req.user = payload;
    return next();
  }

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `SELECT 1 FROM RevokedToken WHERE TokenJTI = :jti`,
      { jti: payload.jti }
    );
    if (result.rows.length > 0) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } catch (err) {
    console.error('Token revocation check error:', err);
    return res.status(500).json({ error: 'Failed to verify session' });
  } finally {
    if (connection) await connection.close();
  }

  req.user = payload;
  next();
}

// Like requireAuth, but never blocks the request. If a valid token
// is present, req.user gets set; otherwise req.user stays undefined
// and the request continues as an anonymous view. Useful for routes
// like "view a user's journal" that show more to the owner than to
// everyone else.
function optionalAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return next();
  }

  const token = header.split(' ')[1];

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    // Invalid/expired token on an optional route -- just treat as anonymous.
  }
  next();
}

// Must run AFTER requireAuth (needs req.user.userId already set).
// Deliberately re-checks the database instead of trusting an
// "isAdmin" flag baked into the JWT -- a token issued before someone
// was promoted (or after they were demoted) would otherwise still
// carry the old, stale permission for up to 7 days.
async function requireAdmin(req, res, next) {
  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `SELECT IsAdmin FROM AppUser WHERE UserID = :userId`,
      { userId: req.user.userId }
    );

    if (result.rows.length === 0 || result.rows[0].ISADMIN !== 1) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (err) {
    console.error('requireAdmin check error:', err);
    res.status(500).json({ error: 'Failed to verify admin status' });
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = { requireAuth, optionalAuth, requireAdmin };
