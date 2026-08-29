const express = require('express');
const cors = require('cors');
const { initPool, closePool } = require('./db');

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

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('NOBOCHITRO backend is running');
});

app.use('/api/auth', authRoutes);
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

// Catch-all 404 for unmatched API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
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
