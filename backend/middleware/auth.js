const jwt = require('jsonwebtoken');

// Reads "Authorization: Bearer <token>", verifies it, and attaches
// the decoded payload (userId, username) to req.user.
function requireAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = header.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { userId, username }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
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

module.exports = { requireAuth, optionalAuth };
