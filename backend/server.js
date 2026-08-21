const express = require('express');
const cors = require('cors');
const { initPool, closePool } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('NOBOCHITRO backend is running');
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