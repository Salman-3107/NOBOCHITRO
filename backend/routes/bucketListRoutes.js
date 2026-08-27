const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  addToWatchlist,
  removeFromWatchlist,
  getWatchlist,
  createList,
  getMyLists,
  getListDetail,
  addItemToList,
  removeItemFromList,
} = require('../controllers/bucketListController');

// Convenience "one-click" watchlist endpoints
router.post('/movies/:id/watchlist', requireAuth, addToWatchlist);
router.delete('/movies/:id/watchlist', requireAuth, removeFromWatchlist);
router.get('/users/:id/watchlist', getWatchlist);

// General-purpose custom lists
router.post('/bucket-lists', requireAuth, createList);
router.get('/bucket-lists', requireAuth, getMyLists);
router.get('/bucket-lists/:id', getListDetail);
router.post('/bucket-lists/:id/items', requireAuth, addItemToList);
router.delete('/bucket-lists/:id/items/:movieId', requireAuth, removeItemFromList);

module.exports = router;
