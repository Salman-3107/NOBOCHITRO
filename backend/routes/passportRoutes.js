const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');
const { getMoviePassport, getPassportCountryMovies } = require('../controllers/passportController');

router.get('/users/:id/passport', optionalAuth, getMoviePassport);
router.get('/users/:id/passport/countries/:country/movies', optionalAuth, getPassportCountryMovies);

module.exports = router;
