const express = require('express');
const router = express.Router();
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { createEntry, getUserJournal, getEntry, deleteEntry } = require('../controllers/journalController');

router.post('/movies/:id/journal', requireAuth, createEntry);
router.get('/users/:id/journal', optionalAuth, getUserJournal);
router.get('/journal/:id', optionalAuth, getEntry);
router.delete('/journal/:id', requireAuth, deleteEntry);

module.exports = router;
