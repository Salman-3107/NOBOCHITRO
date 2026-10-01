import { apiRequest, apiUpload } from './client';

export function listMovies({ genre, year, search, sort } = {}) {
  const params = new URLSearchParams();
  if (genre) params.set('genre', genre);
  if (year) params.set('year', year);
  if (search) params.set('search', search);
  if (sort) params.set('sort', sort);

  const query = params.toString();
  return apiRequest(`/movies${query ? `?${query}` : ''}`);
}

export function listGenres() {
  return apiRequest('/genres');
}

export function getMovie(movieId) {
  return apiRequest(`/movies/${movieId}`);
}

// Admin-only movie management. requireAuth + requireAdmin on the backend
// already reject these unless the logged-in user is actually an admin --
// the frontend just needs to be logged in as one to see this UI at all.
export function createMovie(payload) {
  return apiRequest('/movies', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateMovie(movieId, payload) {
  return apiRequest(`/movies/${movieId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function deleteMovie(movieId) {
  return apiRequest(`/movies/${movieId}`, {
    method: 'DELETE',
  });
}

export function getMovieReviews(movieId) {
  return apiRequest(`/movies/${movieId}/reviews`);
}

export function saveMovieReview(movieId, { rating, reviewText }) {
  return apiRequest(`/movies/${movieId}/reviews`, {
    method: 'POST',
    body: JSON.stringify({ rating, reviewText }),
  });
}

export function getWatchlist(userId) {
  return apiRequest(`/users/${userId}/watchlist`);
}

export function addToWatchlist(movieId) {
  return apiRequest(`/movies/${movieId}/watchlist`, { method: 'POST' });
}

export function removeFromWatchlist(movieId) {
  return apiRequest(`/movies/${movieId}/watchlist`, { method: 'DELETE' });
}

export function getRecommendations() {
  return apiRequest('/recommendations');
}

export function searchMovies(query) {
  return apiRequest(`/search?q=${encodeURIComponent(query)}`);
}

// Find other members by username or display name (powers the header's
// "People" dropdown). Resolves to an array of { USERID, USERNAME, DISPLAYNAME,
// PROFILEPICTUREURL }.
export function searchMembers(query) {
  return apiRequest(`/search?q=${encodeURIComponent(query)}&only=users`).then((data) => data.users || []);
}

// `personalized` asks the backend to reorder the general feed around the
// viewer's taste (~80% posts about genres they rate highly, ~20% everything
// else) instead of plain newest-first. Only meaningful with no movieId/userId
// filter -- a single movie's wall or one person's post history should stay
// exactly what it says.
export function listPosts({ movieId, userId, personalized } = {}) {
  const params = new URLSearchParams();
  if (movieId) params.set('movieId', movieId);
  if (userId) params.set('userId', userId);
  if (personalized) params.set('personalized', 'true');
  const query = params.toString();
  return apiRequest(`/posts${query ? `?${query}` : ''}`);
}
export function getPost(postId) { return apiRequest(`/posts/${postId}`); }
export function createPost({ movieId, postText }) { return apiRequest('/posts', { method: 'POST', body: JSON.stringify({ movieId, postText }) }); }
export function deletePost(postId) { return apiRequest(`/posts/${postId}`, { method: 'DELETE' }); }
export function likePost(postId) { return apiRequest(`/posts/${postId}/like`, { method: 'POST' }); }
export function unlikePost(postId) { return apiRequest(`/posts/${postId}/like`, { method: 'DELETE' }); }
export function getPostLikes(postId) { return apiRequest(`/posts/${postId}/likes`); }
export function addPostComment(postId, commentText) { return apiRequest(`/posts/${postId}/comments`, { method: 'POST', body: JSON.stringify({ commentText }) }); }
export function deletePostComment(commentId) { return apiRequest(`/comments/${commentId}`, { method: 'DELETE' }); }
export function getUserProfile(userId) { return apiRequest(`/users/${userId}/profile`); }
export function getUserWatchlist(userId) { return apiRequest(`/users/${userId}/watchlist`); }
export function getUserJournal(userId) { return apiRequest(`/users/${userId}/journal`); }
export function getUserActivity(userId) { return apiRequest(`/users/${userId}/activity`); }
export function getFollowers(userId) { return apiRequest(`/users/${userId}/followers`); }
export function getFollowing(userId) { return apiRequest(`/users/${userId}/following`); }
export function followUser(userId) { return apiRequest(`/users/${userId}/follow`, { method: 'POST' }); }
export function unfollowUser(userId) { return apiRequest(`/users/${userId}/follow`, { method: 'DELETE' }); }
export function getPassport(userId) { return apiRequest(`/users/${userId}/passport`); }
export function getPassportCountryMovies(userId, country) {
  return apiRequest(`/users/${userId}/passport/countries/${encodeURIComponent(country)}/movies`);
}
export function listChallenges() { return apiRequest('/challenges'); }
export function getUserChallenges(userId) { return apiRequest(`/users/${userId}/challenges`); }
export function joinChallenge(challengeId) { return apiRequest(`/challenges/${challengeId}/join`, { method: 'POST' }); }
export function createJournalEntry(movieId, payload) { return apiRequest(`/movies/${movieId}/journal`, { method: 'POST', body: JSON.stringify(payload) }); }
export function updateMyProfile(payload) { return apiRequest('/auth/profile', { method: 'PUT', body: JSON.stringify(payload) }); }
export function listNotifications() { return apiRequest('/notifications'); }
export function markAllNotificationsRead() { return apiRequest('/notifications/read-all', { method: 'PUT' }); }
export function uploadProfileMedia({ profilePicture, coverPicture }) {
  const data = new FormData();
  if (profilePicture) data.append('profilePicture', profilePicture);
  if (coverPicture) data.append('coverPicture', coverPicture);
  // Goes through apiUpload rather than a hand-rolled fetch, so it picks up the
  // same bearer token, the same API base URL and the same 401 handling as
  // every other call instead of quietly diverging from them.
  return apiUpload('/auth/profile/media', data);
}