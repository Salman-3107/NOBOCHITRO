const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  createPost,
  listPosts,
  getPost,
  deletePost,
  likePost,
  unlikePost,
  getPostLikes,
  addComment,
  deleteComment,
  getFollowingFeed,
} = require('../controllers/postController');

router.post('/posts', requireAuth, createPost);
router.get('/posts', listPosts);
router.get('/feed', requireAuth, getFollowingFeed);
router.get('/posts/:id', getPost);
router.delete('/posts/:id', requireAuth, deletePost);

router.post('/posts/:id/like', requireAuth, likePost);
router.delete('/posts/:id/like', requireAuth, unlikePost);
router.get('/posts/:id/likes', requireAuth, getPostLikes);

router.post('/posts/:id/comments', requireAuth, addComment);
router.delete('/comments/:id', requireAuth, deleteComment);

module.exports = router;