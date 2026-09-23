const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { initPool, closePool } = require('./db');
const { requireAuth } = require('./middleware/auth');

const authRoutes = require('./routes/authRoutes');
const movieRoutes = require('./routes/movieRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const bucketListRoutes = require('./routes/bucketListRoutes');
const postRoutes = require('./routes/postRoutes');
const followRoutes = require('./routes/followRoutes');
const journalRoutes = require('./routes/journalRoutes');
const tasteMatchRoutes = require('./routes/tasteMatchRoutes');
const passportRoutes = require('./routes/passportRoutes');
const challengeRoutes = require('./routes/challengeRoutes');
const adminRoutes = require('./routes/adminRoutes');
const searchRoutes = require('./routes/searchRoutes');
const recommendationRoutes = require('./routes/recommendationRoutes');
const leaderboardRoutes = require('./routes/leaderboardRoutes');
const activityRoutes = require('./routes/activityRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const statsRoutes = require('./routes/statsRoutes');

const app = express();

// Only the dev frontend may call this API from a browser. `cors()` with no
// arguments answers every origin, which would let any page on the internet
// make authenticated requests on a logged-in user's behalf.
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:4173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header at all means a non-browser client (curl, Postman).
      // Those are allowed through -- they still need a valid bearer token,
      // and being able to test endpoints directly is part of the brief.
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
  })
);

app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
  res.send('NOBOCHITRO backend is running');
});

// /api/auth holds the only two endpoints that can be reached without a token
// (register and login). Logout and /me inside it carry their own requireAuth.
app.use('/api/auth', authRoutes);

// AUTHENTICATION GATE -- everything mounted below this line requires a valid,
// unrevoked JWT. Because it is one app.use() ahead of every other router, a
// route added later cannot accidentally be public: it is protected by where
// it is mounted, not by someone remembering to add requireAuth to it.
// (The routers' own requireAuth / optionalAuth calls become no-ops for
// requests that have already passed this gate -- see middleware/auth.js.)
app.use('/api', requireAuth);

app.use('/api', movieRoutes);
app.use('/api', reviewRoutes);
app.use('/api', bucketListRoutes);
app.use('/api', postRoutes);
app.use('/api', followRoutes);
app.use('/api', journalRoutes);
app.use('/api', tasteMatchRoutes);
app.use('/api', passportRoutes);
app.use('/api', challengeRoutes);
app.use('/api', adminRoutes);
app.use('/api', searchRoutes);
app.use('/api', recommendationRoutes);
app.use('/api', leaderboardRoutes);
app.use('/api', activityRoutes);
app.use('/api', notificationRoutes);
app.use('/api', statsRoutes);

// Catch-all 404 for unmatched API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Central error handler. Without it, malformed JSON bodies and rejected file
// uploads fall through to Express's default handler, which replies with an
// HTML stack trace -- the frontend then fails to parse it and shows
// "Something went wrong" instead of the real reason.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large' });
  }
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Image must be 5 MB or smaller' });
    }
    return res.status(400).json({ error: 'Upload rejected: ' + err.message });
  }
  if (err.message && err.message.startsWith('Only image files')) {
    return res.status(400).json({ error: err.message });
  }
  if (err.message && err.message.includes('not allowed by CORS')) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Unexpected server error' });
});

const PORT = process.env.PORT || 5000;

initPool()
  .then(() => {
    app.listen(PORT, () => console.log(`NOBOCHITRO backend running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to start Oracle connection pool:', err);
    process.exit(1);
  });

process.on('SIGINT', async () => {
  console.log('Shutting down NOBOCHITRO backend...');
  await closePool();
  process.exit(0);
});
