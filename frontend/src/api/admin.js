import { apiRequest } from './client';

// Every function here hits an endpoint guarded by requireAuth + requireAdmin.
// A regular user's token gets 403 from the server and an anonymous request
// gets 401 -- hiding the admin UI from non-admins is presentation, the
// enforcement is server-side and re-reads IsAdmin from Oracle every request.

// Turns { page: 2, search: 'noir', genre: '' } into "?page=2&search=noir".
// Empty strings, null and undefined are dropped rather than sent as blanks,
// so a cleared filter box means "no filter" instead of "match the empty
// string" -- which is what the backend's `if (req.query.x)` checks expect.
function query(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, value);
  });
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

// ---------- Overview ----------

export function getAdminDashboard() {
  return apiRequest('/admin/dashboard');
}

export function getAnalytics(range = '30d') {
  return apiRequest(`/admin/analytics${query({ range })}`);
}

export function getPlatformActivity(limit = 20) {
  return apiRequest(`/admin/activity/platform${query({ limit })}`);
}

export function getAuditLog(params) {
  return apiRequest(`/admin/activity${query(params)}`);
}

export function adminSearch(q) {
  return apiRequest(`/admin/search${query({ q })}`);
}

// ---------- Movies ----------

export function listAdminMovies(params) {
  return apiRequest(`/admin/movies${query(params)}`);
}

export function getMovieFilters() {
  return apiRequest('/admin/movies/filters');
}

export function getAdminMovie(movieId) {
  return apiRequest(`/admin/movies/${movieId}`);
}

export function getMovieDependencies(movieId) {
  return apiRequest(`/admin/movies/${movieId}/dependencies`);
}

export function setMovieGenres(movieId, genreIds) {
  return apiRequest(`/admin/movies/${movieId}/genres`, {
    method: 'PUT',
    body: JSON.stringify({ genreIds }),
  });
}

export function deleteAdminMovie(movieId) {
  return apiRequest(`/admin/movies/${movieId}`, { method: 'DELETE' });
}

// ---------- Genres ----------

export function listAdminGenres() {
  return apiRequest('/admin/genres');
}

export function createGenre(genreName) {
  return apiRequest('/admin/genres', {
    method: 'POST',
    body: JSON.stringify({ genreName }),
  });
}

export function updateGenre(genreId, genreName) {
  return apiRequest(`/admin/genres/${genreId}`, {
    method: 'PUT',
    body: JSON.stringify({ genreName }),
  });
}

// `force` is only ever sent after the server has already refused once and
// told the UI how many movies would lose the genre. The two-step exists so a
// cascade can never happen on a single unconsidered click.
export function deleteGenre(genreId, { force = false } = {}) {
  return apiRequest(`/admin/genres/${genreId}${query({ force: force || undefined })}`, {
    method: 'DELETE',
  });
}

// ---------- People ----------

export function listAdminPeople(params) {
  return apiRequest(`/admin/people${query(params)}`);
}

export function getAdminPerson(personId) {
  return apiRequest(`/admin/people/${personId}`);
}

export function createPerson(payload) {
  return apiRequest('/admin/people', { method: 'POST', body: JSON.stringify(payload) });
}

export function updatePerson(personId, payload) {
  return apiRequest(`/admin/people/${personId}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function deletePerson(personId, { force = false } = {}) {
  return apiRequest(`/admin/people/${personId}${query({ force: force || undefined })}`, {
    method: 'DELETE',
  });
}

// ---------- Credits ----------

export function listCredits(params) {
  return apiRequest(`/admin/credits${query(params)}`);
}

export function createCredit(payload) {
  return apiRequest('/admin/credits', { method: 'POST', body: JSON.stringify(payload) });
}

// MovieCredit's key is (MovieID, PersonID, RoleType), so all three identify
// the row -- there is no single id to put in the path.
export function deleteCredit({ movieId, personId, roleType }) {
  return apiRequest(`/admin/credits${query({ movieId, personId, roleType })}`, {
    method: 'DELETE',
  });
}

// ---------- Users ----------

export function listUsers(params) {
  return apiRequest(`/admin/users${query(params)}`);
}

export function getAdminUser(userId) {
  return apiRequest(`/admin/users/${userId}`);
}

export function updateUser(userId, payload) {
  return apiRequest(`/admin/users/${userId}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function getUserDependencies(userId) {
  return apiRequest(`/admin/users/${userId}/dependencies`);
}

export function deleteUser(userId) {
  return apiRequest(`/admin/users/${userId}`, { method: 'DELETE' });
}

export function setUserRole(userId, isAdmin) {
  return apiRequest(`/admin/users/${userId}/role`, {
    method: 'PUT',
    body: JSON.stringify({ isAdmin }),
  });
}

// ---------- Moderation ----------

export function listReviews(params) {
  return apiRequest(`/admin/reviews${query(params)}`);
}

export function deleteReview(userId, movieId) {
  return apiRequest(`/admin/reviews/${userId}/${movieId}`, { method: 'DELETE' });
}

export function listPosts(params) {
  return apiRequest(`/admin/posts${query(params)}`);
}

export function deletePost(postId) {
  return apiRequest(`/admin/posts/${postId}`, { method: 'DELETE' });
}

export function listComments(params) {
  return apiRequest(`/admin/comments${query(params)}`);
}

export function deleteComment(commentId) {
  return apiRequest(`/admin/comments/${commentId}`, { method: 'DELETE' });
}

// ---------- Reports ----------

export function listReports(params) {
  return apiRequest(`/admin/reports${query(params)}`);
}

export function getReportedContent(reportId) {
  return apiRequest(`/admin/reports/${reportId}/content`);
}

export function updateReportStatus(reportId, status, resolutionNote) {
  return apiRequest(`/admin/reports/${reportId}`, {
    method: 'PUT',
    body: JSON.stringify({ status, resolutionNote }),
  });
}

// ---------- Challenges ----------

export function listChallenges(params) {
  return apiRequest(`/admin/challenges${query(params)}`);
}

export function getChallenge(challengeId) {
  return apiRequest(`/admin/challenges/${challengeId}`);
}

export function createChallenge(payload) {
  return apiRequest('/admin/challenges', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateChallenge(challengeId, payload) {
  return apiRequest(`/admin/challenges/${challengeId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function deleteChallenge(challengeId) {
  return apiRequest(`/admin/challenges/${challengeId}`, { method: 'DELETE' });
}

// Publishing is what notifies every account, so it is a separate, explicit
// call behind its own confirmation -- not a side effect of saving.
export function publishChallenge(challengeId) {
  return apiRequest(`/admin/challenges/${challengeId}/publish`, { method: 'POST' });
}

export function archiveChallenge(challengeId) {
  return apiRequest(`/admin/challenges/${challengeId}/archive`, { method: 'POST' });
}

// ---------- Notifications & leaderboard ----------

export function listNotifications(params) {
  return apiRequest(`/admin/notifications${query(params)}`);
}

export function sendAnnouncement(message) {
  return apiRequest('/admin/announcements', {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export function getLeaderboard(params) {
  return apiRequest(`/admin/leaderboard${query(params)}`);
}
