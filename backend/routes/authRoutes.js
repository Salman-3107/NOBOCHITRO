const express = require('express');
const router = express.Router();
const { register, login, logout, getCurrentUser } = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const { updateMyProfile, uploadMyProfileMedia } = require('../controllers/profileController');
const { uploadProfileMedia } = require('../middleware/profileUpload');

router.post('/register', register);
router.post('/login', login);

router.post('/logout', requireAuth, logout);
router.get('/me', requireAuth, getCurrentUser);
router.put('/profile', requireAuth, updateMyProfile);
router.post('/profile/media', requireAuth, uploadProfileMedia, uploadMyProfileMedia);

module.exports = router;
