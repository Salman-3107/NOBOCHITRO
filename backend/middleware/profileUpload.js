const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadDirectory = path.join(__dirname, '..', 'uploads', 'profiles');
fs.mkdirSync(uploadDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDirectory),
  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase() || '.jpg';
    callback(null, `user-${req.user.userId}-${Date.now()}${extension}`);
  },
});

const fileFilter = (_req, file, callback) => {
  if (file.mimetype.startsWith('image/')) return callback(null, true);
  callback(new Error('Only image files can be uploaded.'));
};

const uploadProfileMedia = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } }).fields([
  { name: 'profilePicture', maxCount: 1 },
  { name: 'coverPicture', maxCount: 1 },
]);

module.exports = { uploadProfileMedia };
