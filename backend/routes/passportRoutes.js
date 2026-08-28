const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');
const { getMoviePassport } = require('../controllers/passportController');

router.get('/users/:id/passport', optionalAuth, getMoviePassport);

module.exports = router;
