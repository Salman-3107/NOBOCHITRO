const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const oracledb = require('oracledb');
const { getPool } = require('../db');
const { JWT_SECRET } = require('../middleware/auth');

const SALT_ROUNDS = 12;
const TOKEN_TTL = '7d';

const USERNAME_PATTERN = /^[A-Za-z0-9_.]{3,50}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD_LENGTH = 8;

// A short blocklist of passwords that show up in every leaked-credential
// dump. Rejecting them costs nothing and stops the most obvious accounts
// from being guessable on the first try.
const BANNED_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwertyui', 'qwerty123', 'iloveyou', 'sunshine', 'princess', 'football',
  'baseball', 'superman', 'trustno1', 'letmein1', 'admin123', 'welcome1',
  'abc12345', 'passw0rd', 'nobochitro', 'movielover',
]);

// Every credential check runs server-side. The frontend's `required` and
// `minLength` attributes are a convenience for the person typing -- they
// are trivially removed with dev tools, so nothing here trusts them.
function validateRegistration({ username, email, password, displayName }) {
  if (typeof username !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
    return 'username, email and password are required';
  }

  const trimmedUsername = username.trim();
  const trimmedEmail = email.trim().toLowerCase();

  if (!trimmedUsername || !trimmedEmail || !password) {
    return 'username, email and password are required';
  }
  if (!USERNAME_PATTERN.test(trimmedUsername)) {
    return 'username must be 3-50 characters, using only letters, numbers, dots or underscores';
  }
  if (!EMAIL_PATTERN.test(trimmedEmail) || trimmedEmail.length > 100) {
    return 'email is not a valid address';
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (password.length > 72) {
    // bcrypt silently truncates past 72 bytes; reject rather than mislead.
    return 'password must be 72 characters or fewer';
  }
  if (BANNED_PASSWORDS.has(password.toLowerCase())) {
    return 'that password is too common -- please choose a different one';
  }
  // A password that is just the username or the email is the same thing as
  // having no password at all: both are printed next to it on every profile.
  if (password.toLowerCase() === trimmedUsername.toLowerCase()) {
    return 'password must not be the same as your username';
  }
  if (password.toLowerCase() === trimmedEmail || password.toLowerCase() === trimmedEmail.split('@')[0]) {
    return 'password must not be the same as your email';
  }
  if (displayName !== undefined && displayName !== null && typeof displayName !== 'string') {
    return 'displayName must be text';
  }
  if (typeof displayName === 'string' && displayName.length > 100) {
    return 'displayName must be 100 characters or fewer';
  }

  return null;
}

// Rows here are dead weight once the underlying token would have expired
// on its own -- the signature check rejects it at that point anyway. Runs
// opportunistically on logout so the table never needs manual pruning.
async function cleanupExpiredRevocations(connection) {
  try {
    await connection.execute(`DELETE FROM RevokedToken WHERE ExpiresAt < SYSDATE`);
  } catch (err) {
    // Housekeeping only -- never let this fail the logout itself.
    console.error('Revoked-token cleanup error:', err);
  }
}

function issueToken({ userId, username, isAdmin }) {
  return jwt.sign(
    { userId, username, isAdmin: !!isAdmin, jti: crypto.randomUUID() },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

// POST /api/auth/register
// body: { username, email, password, displayName? }
// Always creates a regular user. Role is NEVER read from the request body --
// an admin is made by an existing admin through PUT /api/admin/users/:id/role.
async function register(req, res) {
  const validationError = validateRegistration(req.body || {});
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const username = req.body.username.trim();
  const email = req.body.email.trim().toLowerCase();
  const password = req.body.password;
  const displayName = (req.body.displayName || '').trim() || username;

  let connection;
  try {
    connection = await getPool().getConnection();

    // Ask first, insert second. The UNIQUE constraints on Username and Email
    // are still the real guarantee (see the ORA-00001 branch below), but a
    // constraint violation can only say "one of these two clashed". Looking
    // the rows up first is what lets the form say WHICH field to fix.
    const clash = await connection.execute(
      `SELECT LOWER(Username) AS TakenUsername, LOWER(Email) AS TakenEmail
       FROM AppUser
       WHERE LOWER(Username) = :username OR LOWER(Email) = :email`,
      { username: username.toLowerCase(), email }
    );

    if (clash.rows.length > 0) {
      const emailTaken = clash.rows.some((row) => row.TAKENEMAIL === email);
      const usernameTaken = clash.rows.some((row) => row.TAKENUSERNAME === username.toLowerCase());

      if (emailTaken && usernameTaken) {
        return res.status(409).json({
          error: 'That username and email address are both already registered. Sign in instead?',
          field: 'email',
        });
      }
      if (emailTaken) {
        return res.status(409).json({
          error: 'An account with this email address already exists. Sign in instead?',
          field: 'email',
        });
      }
      return res.status(409).json({
        error: 'That username is already taken. Please pick another one.',
        field: 'username',
      });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await connection.execute(
      `INSERT INTO AppUser (UserID, Username, Email, PasswordHash, DisplayName, JoinDate, IsAdmin)
       VALUES (seq_appuser.NEXTVAL, :username, :email, :passwordHash, :displayName, SYSDATE, 0)
       RETURNING UserID INTO :newId`,
      {
        username,
        email,
        passwordHash,
        displayName,
        newId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );
    await connection.commit();

    const newUserId = result.outBinds.newId[0];

    // No token is returned. Registration and login are separate steps, so a
    // brand-new account still has to prove its credentials at /login.
    res.status(201).json({
      message: 'User registered successfully',
      user: { userId: newUserId, username, email, displayName, isAdmin: false },
    });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
    // ORA-00001: unique constraint violated. The pre-check above catches the
    // normal case; this only fires when two people register the same value in
    // the same instant, so the database stays the last word either way.
    if (err.errorNum === 1) {
      const violated = (err.message || '').toUpperCase();
      if (violated.includes('UQ_APPUSER_EMAIL')) {
        return res.status(409).json({
          error: 'An account with this email address already exists. Sign in instead?',
          field: 'email',
        });
      }
      return res.status(409).json({
        error: 'That username is already taken. Please pick another one.',
        field: 'username',
      });
    }
    console.error('Register error:', err);
    res.status(500).json({ error: 'Failed to register user' });
  } finally {
    if (connection) await connection.close();
  }
}

// POST /api/auth/login
// body: { username, password }
async function login(req, res) {
  const { username, password } = req.body || {};

  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  let connection;
  try {
    connection = await getPool().getConnection();

    const result = await connection.execute(
      `SELECT UserID, Username, Email, PasswordHash, DisplayName, ProfilePictureURL, IsAdmin
       FROM AppUser
       WHERE Username = :username`,
      { username: username.trim() }
    );

    // Same message and status for "no such user" and "wrong password", so the
    // response can't be used to enumerate which usernames exist.
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = result.rows[0];
    const passwordMatches = await bcrypt.compare(password, user.PASSWORDHASH);

    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // The role comes out of the database row and nowhere else. The client
    // has no say in it, and the copy placed in the token is only a hint for
    // the UI -- every protected route re-reads IsAdmin from the database.
    const isAdmin = user.ISADMIN === 1;

    const token = issueToken({ userId: user.USERID, username: user.USERNAME, isAdmin });

    res.json({
      message: 'Login successful',
      user: {
        userId: user.USERID,
        username: user.USERNAME,
        email: user.EMAIL,
        displayName: user.DISPLAYNAME,
        isAdmin,
        profilePictureUrl: user.PROFILEPICTUREURL,
      },
      token,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Failed to log in' });
  } finally {
    if (connection) await connection.close();
  }
}

// POST /api/auth/logout  (auth)
// requireAuth has already verified the token and attached its payload
// (including jti and exp) to req.user. We record that jti as revoked so
// this exact token can never be used again, even though it hasn't
// technically expired yet -- that's the part localStorage.removeItem()
// on the frontend could never do by itself.
async function logout(req, res) {
  const { jti, exp, userId } = req.user;

  let connection;
  try {
    connection = await getPool().getConnection();
    await connection.execute(
      `INSERT INTO RevokedToken (TokenJTI, UserID, ExpiresAt)
       VALUES (:jti, :userId, TO_DATE('1970-01-01', 'YYYY-MM-DD') + (:exp / 86400))`,
      { jti, userId, exp }
    );
    // Housekeeping DELETE joins the same transaction, so ONE commit covers
    // both the revocation and the cleanup. (Previously only the INSERT was
    // committed and the cleanup DELETE was silently rolled back when the
    // connection closed.)
    await cleanupExpiredRevocations(connection);
    await connection.commit();
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
    // Already revoked (e.g. double-clicked logout) -- not an error from the
    // user's point of view, the end state they want is already true.
    if (err.errorNum === 1) {
      return res.json({ message: 'Logged out successfully' });
    }
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Failed to log out' });
  } finally {
    if (connection) await connection.close();
  }
}

// GET /api/auth/me  (auth)
// Lets the frontend confirm on page load that the token it is holding is
// still live, and re-read the role straight from the database instead of
// trusting the copy it cached in localStorage.
async function getCurrentUser(req, res) {
  let connection;
  try {
    connection = await getPool().getConnection();
    const result = await connection.execute(
      `SELECT UserID, Username, Email, DisplayName, ProfilePictureURL, IsAdmin
       FROM AppUser WHERE UserID = :userId`,
      { userId: req.user.userId }
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Account no longer exists' });
    }

    const user = result.rows[0];
    res.json({
      userId: user.USERID,
      username: user.USERNAME,
      email: user.EMAIL,
      displayName: user.DISPLAYNAME,
      isAdmin: user.ISADMIN === 1,
      profilePictureUrl: user.PROFILEPICTUREURL,
    });
  } catch (err) {
    console.error('Get current user error:', err);
    res.status(500).json({ error: 'Failed to load account' });
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = { register, login, logout, getCurrentUser };
