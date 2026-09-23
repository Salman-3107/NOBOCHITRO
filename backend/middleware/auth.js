const jwt = require('jsonwebtoken');
const { getPool } = require('../db');

// Fail fast at boot rather than at the first login: a missing or
// throwaway JWT_SECRET means every token we issue is forgeable.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error(
    'JWT_SECRET is missing or too short. Set a random string of at least 32 characters in backend/.env'
  );
}

// Pulls "Authorization: Bearer <token>" out of the request.
// Returns null when the header is absent or malformed.
function readBearerToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;

  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

// Verifies the signature and expiry, then checks the jti against the
// RevokedToken table. A token is only accepted if BOTH pass.
//
// Every token we issue carries a jti, so a token without one is either
// forged or predates the logout feature -- either way it can never be
// revoked, so we reject it outright instead of waving it through.
// Anyone still holding one simply logs in again and gets a modern token.
async function verifyToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return { ok: false, status: 401, error: 'Invalid or expired token' };
  }

  if (!payload.jti || !payload.userId) {
    return { ok: false, status: 401, error: 'Invalid or expired token' };
  }

  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `SELECT 1 FROM RevokedToken WHERE TokenJTI = :jti`,
      { jti: payload.jti }
    );
    if (result.rows.length > 0) {
      // Signature and expiry are still fine, but the user logged out.
      return { ok: false, status: 401, error: 'Session has ended. Please log in again.' };
    }
  } catch (err) {
    console.error('Token revocation check error:', err);
    return { ok: false, status: 500, error: 'Failed to verify session' };
  } finally {
    if (connection) await connection.close();
  }

  return { ok: true, payload };
}

// Hard gate. 401 on anything that isn't a live, unrevoked token.
async function requireAuth(req, res, next) {
  // The global gate in server.js has usually verified this request already.
  // Skip the second RevokedToken lookup when it has.
  if (req.user) return next();

  const token = readBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const result = await verifyToken(token);
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }

  req.user = result.payload;
  next();
}

// Soft gate for routes that show more to the owner than to other users
// (a user's journal, passport, activity). Every /api route except register
// and login now sits behind the global requireAuth gate in server.js, so by
// the time this runs req.user is normally already set; it remains so these
// routes stay correct if they are ever mounted on their own. A valid token sets req.user;
// anything else -- absent, expired, or REVOKED -- falls through as an
// anonymous viewer rather than an authenticated one.
//
// The revocation check matters here as much as in requireAuth: without
// it, a logged-out token would keep unlocking the owner-only view of
// someone's private journal, which is exactly what logout is meant to stop.
async function optionalAuth(req, res, next) {
  if (req.user) return next();

  const token = readBearerToken(req);
  if (!token) return next();

  const result = await verifyToken(token);
  if (result.ok) {
    req.user = result.payload;
  }
  next();
}

// Must run AFTER requireAuth (needs req.user.userId already set).
// Deliberately re-checks the database instead of trusting an "isAdmin"
// flag baked into the JWT -- a token issued before someone was promoted
// (or after they were demoted) would otherwise still carry the old,
// stale permission for up to 7 days.
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

module.exports = { requireAuth, optionalAuth, requireAdmin, JWT_SECRET };
