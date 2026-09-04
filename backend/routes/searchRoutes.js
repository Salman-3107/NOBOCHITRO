const express = require('express');
const router = express.Router();
const { search } = require('../controllers/searchController');
const { getUserProfile } = require('../controllers/userController');

router.get('/search', search);
router.get('/users/:id/profile', getUserProfile);

module.exports = router;
