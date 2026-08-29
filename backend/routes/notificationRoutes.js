const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { listNotifications, markRead, markAllRead } = require('../controllers/notificationController');

router.get('/notifications', requireAuth, listNotifications);
router.put('/notifications/:id/read', requireAuth, markRead);
router.put('/notifications/read-all', requireAuth, markAllRead);

module.exports = router;
