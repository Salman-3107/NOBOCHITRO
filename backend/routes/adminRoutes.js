const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const {
  createChallenge, updateChallenge, deleteChallenge,
  moderateDeletePost, moderateDeleteComment, moderateDeleteReview,
  listUsers, setUserRole,
} = require('../controllers/adminController');

router.post('/admin/challenges', requireAuth, requireAdmin, createChallenge);
router.put('/admin/challenges/:id', requireAuth, requireAdmin, updateChallenge);
router.delete('/admin/challenges/:id', requireAuth, requireAdmin, deleteChallenge);

router.delete('/admin/posts/:id', requireAuth, requireAdmin, moderateDeletePost);
router.delete('/admin/comments/:id', requireAuth, requireAdmin, moderateDeleteComment);
router.delete('/admin/reviews', requireAuth, requireAdmin, moderateDeleteReview);

router.get('/admin/users', requireAuth, requireAdmin, listUsers);
router.put('/admin/users/:id/role', requireAuth, requireAdmin, setUserRole);

module.exports = router;
