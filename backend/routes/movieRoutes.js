const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  listMovies, getMovie, createMovie, listGenres,
} = require('../controllers/movieController');

router.get('/movies', listMovies);
router.get('/movies/:id', getMovie);
// Later: restrict this to admin users specifically, not just "any logged-in user".
router.post('/movies', requireAuth, createMovie);

router.get('/genres', listGenres);

module.exports = router;
