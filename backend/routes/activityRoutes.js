const express = require('express');
const router = express.Router();
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { getFollowingActivityFeed, getUserActivityHistory } = require('../controllers/activityController');

router.get('/feed/activity', requireAuth, getFollowingActivityFeed);
router.get('/users/:id/activity', optionalAuth, getUserActivityHistory);

module.exports = router;
