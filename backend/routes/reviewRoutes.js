const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  upsertReview, getMovieReviews, deleteReview, getUserReviews,
} = require('../controllers/reviewController');

router.post('/movies/:id/reviews', requireAuth, upsertReview);
router.get('/movies/:id/reviews', getMovieReviews);
router.delete('/movies/:id/reviews', requireAuth, deleteReview);

router.get('/users/:id/reviews', getUserReviews);

module.exports = router;
