const express = require('express');
const router = express.Router();
const { requireAuth, optionalAuth, requireAdmin } = require('../middleware/auth');
const { getUserStats, getRatingDistribution, getAdminDashboard } = require('../controllers/statsController');

// optionalAuth: the controller needs to know whether the viewer is the owner
// before it decides whether private journal entries count toward the totals.
router.get('/users/:id/stats', optionalAuth, getUserStats);

router.get('/movies/:id/rating-distribution', getRatingDistribution);

router.get('/admin/dashboard', requireAuth, requireAdmin, getAdminDashboard);

module.exports = router;
