const express = require('express');
const router = express.Router();
const { getTasteMatch } = require('../controllers/tasteMatchController');

router.get('/users/:id/taste-match/:otherId', getTasteMatch);

module.exports = router;
