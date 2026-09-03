const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const oracledb = require('oracledb');
const { getPool } = require('../db');

const SALT_ROUNDS = 10;

// POST /api/auth/register
// body: { username, email, password, displayName? }
async function register(req, res) {
  const { username, email, password, displayName } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'username, email and password are required' });
  }

  let connection;
  try {
    connection = await getPool().getConnection();

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await connection.execute(
      `INSERT INTO AppUser (UserID, Username, Email, PasswordHash, DisplayName, JoinDate)
       VALUES (seq_appuser.NEXTVAL, :username, :email, :passwordHash, :displayName, SYSDATE)
       RETURNING UserID INTO :newId`,
      {
        username,
        email,
        passwordHash,
        displayName: displayName || username,
        newId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
      { autoCommit: true }
    );

    const newUserId = result.outBinds.newId[0];

    const token = jwt.sign(
      { userId: newUserId, username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      user: { userId: newUserId, username, email, displayName: displayName || username },
      token,
    });
  } catch (err) {
    // ORA-00001: unique constraint violated (username/email already taken)
    if (err.errorNum === 1) {
      return res.status(409).json({ error: 'Username or email already in use' });
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
  const { username, password, asAdmin } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  let connection;
  try {
    connection = await getPool().getConnection();

    const result = await connection.execute(
      `SELECT UserID, Username, Email, PasswordHash, DisplayName, IsAdmin
       FROM AppUser
       WHERE Username = :username`,
      { username }
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = result.rows[0];
    const passwordMatches = await bcrypt.compare(password, user.PASSWORDHASH);

    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const isAdmin = user.ISADMIN === 1;

    // If the person came in through the "Sign in as Admin" option, only let
    // actual admin accounts through -- correct credentials aren't enough on
    // their own, so a regular user can't land in the admin area by mistake.
    if (asAdmin && !isAdmin) {
      return res.status(403).json({ error: 'This account does not have admin access' });
    }

    const token = jwt.sign(
      { userId: user.USERID, username: user.USERNAME, isAdmin },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      user: {
        userId: user.USERID,
        username: user.USERNAME,
        email: user.EMAIL,
        displayName: user.DISPLAYNAME,
        isAdmin,
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

module.exports = { register, login };