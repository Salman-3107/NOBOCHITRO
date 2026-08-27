const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { followUser, unfollowUser, getFollowers, getFollowing } = require('../controllers/followController');

router.post('/users/:id/follow', requireAuth, followUser);
router.delete('/users/:id/follow', requireAuth, unfollowUser);
router.get('/users/:id/followers', getFollowers);
router.get('/users/:id/following', getFollowing);

module.exports = router;
