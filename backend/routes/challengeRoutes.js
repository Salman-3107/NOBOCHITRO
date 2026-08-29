const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { listChallenges, joinChallenge, getUserChallenges } = require('../controllers/challengeController');

router.get('/challenges', listChallenges);
router.post('/challenges/:id/join', requireAuth, joinChallenge);
router.get('/users/:id/challenges', getUserChallenges);

module.exports = router;
