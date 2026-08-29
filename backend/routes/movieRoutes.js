const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const {
  listMovies, getMovie, createMovie, listGenres,
} = require('../controllers/movieController');
const {
  updateMovie, deleteMovie, createGenre, createPerson, addCredit,
} = require('../controllers/adminController');

router.get('/movies', listMovies);
router.get('/movies/:id', getMovie);

// Admin-only movie management (requireAuth first to populate req.user,
// then requireAdmin checks the DB for the IsAdmin flag).
router.post('/movies', requireAuth, requireAdmin, createMovie);
router.put('/movies/:id', requireAuth, requireAdmin, updateMovie);
router.delete('/movies/:id', requireAuth, requireAdmin, deleteMovie);
router.post('/movies/:id/credits', requireAuth, requireAdmin, addCredit);

router.get('/genres', listGenres);
router.post('/genres', requireAuth, requireAdmin, createGenre);
router.post('/people', requireAuth, requireAdmin, createPerson);

module.exports = router;
