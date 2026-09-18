const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');

const {
  createChallenge, updateChallenge, deleteChallenge,
  moderateDeletePost, moderateDeleteComment, moderateDeleteReview,
  listUsers: listUsersLegacy, setUserRole,
  updateMovie, deleteMovie, createGenre, createPerson,
} = require('../controllers/adminController');

const { createMovie } = require('../controllers/movieController');

const {
  listMovies, getMovieFilters, getMovieDetail, getMovieDependencies, setMovieGenres,
  listGenres, updateGenre, deleteGenre,
  listPeople, getPersonDetail, updatePerson, deletePerson,
  listCredits, createCredit, deleteCredit,
} = require('../controllers/adminCatalogController');

const {
  listUsers, getUserDetail, updateUser, getUserDependencies, deleteUser,
  listReviews, listPosts, listComments,
  listReports, getReportedContent, updateReportStatus,
} = require('../controllers/adminCommunityController');

const {
  listChallenges, getChallengeDetail, publishChallenge, archiveChallenge,
  listNotifications, broadcastAnnouncement, getLeaderboard,
} = require('../controllers/adminEngagementController');

const {
  getAnalytics, getPlatformActivity, getAuditLog, globalSearch,
} = require('../controllers/adminInsightsController');

// ============================================================
// Every route below is gated by requireAuth -> requireAdmin, in that order.
//
// requireAuth verifies the JWT's signature, its expiry AND its jti against
// RevokedToken. requireAdmin then re-reads IsAdmin from AppUser on every
// single request rather than trusting a claim baked into the token, so a
// demotion takes effect immediately instead of when a 7-day token expires.
// The frontend hiding the admin nav is presentation; this is the enforcement.
// A normal user's token calling any of these gets 403, and no token gets 401.
//
// The pairing is applied as router-level middleware rather than repeated on
// every line -- with forty routes, one forgotten `requireAdmin` is an open
// door, and an omission you cannot make beats one you have to review for.
// ============================================================
router.use('/admin', requireAuth, requireAdmin);


// ---------- Overview & analytics ----------
// GET /api/admin/dashboard stays in statsRoutes.js (statsController.getAdminDashboard)
// rather than being moved here, so nothing that already calls it breaks.
router.get('/admin/analytics', getAnalytics);
router.get('/admin/activity/platform', getPlatformActivity);
router.get('/admin/activity', getAuditLog);
router.get('/admin/search', globalSearch);


// ---------- Movies ----------
// The static /filters path is declared BEFORE /:id -- otherwise Express
// matches "filters" as an :id and the handler receives a movie id of NaN.
router.get('/admin/movies/filters', getMovieFilters);
router.get('/admin/movies', listMovies);
router.get('/admin/movies/:id', getMovieDetail);
router.get('/admin/movies/:id/dependencies', getMovieDependencies);
router.put('/admin/movies/:id/genres', setMovieGenres);

// Create/update/delete reuse the handlers already backing /api/movies --
// mounted at a second path, not reimplemented. One movie-writing code path
// means one place where the title/year clash check and the ORA-02292 handling
// live, and no chance of the two drifting apart.
router.post('/admin/movies', createMovie);
router.put('/admin/movies/:id', updateMovie);
router.delete('/admin/movies/:id', deleteMovie);


// ---------- Genres ----------
router.get('/admin/genres', listGenres);
router.post('/admin/genres', createGenre);
router.put('/admin/genres/:id', updateGenre);
router.delete('/admin/genres/:id', deleteGenre);


// ---------- People ----------
router.get('/admin/people', listPeople);
router.post('/admin/people', createPerson);
router.get('/admin/people/:id', getPersonDetail);
router.put('/admin/people/:id', updatePerson);
router.delete('/admin/people/:id', deletePerson);


// ---------- Credits ----------
// MovieCredit's key is (MovieID, PersonID, RoleType), so the delete takes all
// three as query params instead of pretending there is a single :id.
router.get('/admin/credits', listCredits);
router.post('/admin/credits', createCredit);
router.delete('/admin/credits', deleteCredit);


// ---------- Users ----------
// /legacy is the old unpaginated listUsers, kept so any existing caller of
// GET /api/admin/users that expects a bare array still works.
router.get('/admin/users', listUsers);
router.get('/admin/users/legacy', listUsersLegacy);
router.get('/admin/users/:id', getUserDetail);
router.put('/admin/users/:id', updateUser);
router.get('/admin/users/:id/dependencies', getUserDependencies);
router.delete('/admin/users/:id', deleteUser);
router.put('/admin/users/:id/role', setUserRole);


// ---------- Moderation ----------
router.get('/admin/reviews', listReviews);
router.get('/admin/posts', listPosts);
router.get('/admin/comments', listComments);

// Both review-delete shapes stay live: the original query-param form, and the
// path form the dashboard sends. Same handler either way.
router.delete('/admin/reviews', moderateDeleteReview);
router.delete('/admin/reviews/:userId/:movieId', moderateDeleteReview);
router.delete('/admin/posts/:id', moderateDeletePost);
router.delete('/admin/comments/:id', moderateDeleteComment);


// ---------- Reports ----------
router.get('/admin/reports', listReports);
router.get('/admin/reports/:id/content', getReportedContent);
router.put('/admin/reports/:id', updateReportStatus);


// ---------- Challenges ----------
router.get('/admin/challenges', listChallenges);
router.post('/admin/challenges', createChallenge);
router.get('/admin/challenges/:id', getChallengeDetail);
router.put('/admin/challenges/:id', updateChallenge);
router.delete('/admin/challenges/:id', deleteChallenge);
router.post('/admin/challenges/:id/publish', publishChallenge);
router.post('/admin/challenges/:id/archive', archiveChallenge);


// ---------- Notifications & leaderboard ----------
router.get('/admin/notifications', listNotifications);
router.post('/admin/announcements', broadcastAnnouncement);
router.get('/admin/leaderboard', getLeaderboard);

module.exports = router;
