import { apiRequest } from './client';

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

export function listPosts({ movieId, userId } = {}) {
  const params = new URLSearchParams();
  if (movieId) params.set('movieId', movieId);
  if (userId) params.set('userId', userId);
  const query = params.toString();
  return apiRequest(`/posts${query ? `?${query}` : ''}`);
}
export function getPost(postId) { return apiRequest(`/posts/${postId}`); }
export function createPost({ movieId, postText }) { return apiRequest('/posts', { method: 'POST', body: JSON.stringify({ movieId, postText }) }); }
export function deletePost(postId) { return apiRequest(`/posts/${postId}`, { method: 'DELETE' }); }
export function likePost(postId) { return apiRequest(`/posts/${postId}/like`, { method: 'POST' }); }
export function unlikePost(postId) { return apiRequest(`/posts/${postId}/like`, { method: 'DELETE' }); }
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
export function listChallenges() { return apiRequest('/challenges'); }
export function getUserChallenges(userId) { return apiRequest(`/users/${userId}/challenges`); }
export function joinChallenge(challengeId) { return apiRequest(`/challenges/${challengeId}/join`, { method: 'POST' }); }
export function createJournalEntry(movieId, payload) { return apiRequest(`/movies/${movieId}/journal`, { method: 'POST', body: JSON.stringify(payload) }); }
export function updateMyProfile(payload) { return apiRequest('/auth/profile', { method: 'PUT', body: JSON.stringify(payload) }); }
export function listNotifications() { return apiRequest('/notifications'); }
export function markAllNotificationsRead() { return apiRequest('/notifications/read-all', { method: 'PUT' }); }
export async function uploadProfileMedia({ profilePicture, coverPicture }) {
  const data = new FormData();
  if (profilePicture) data.append('profilePicture', profilePicture);
  if (coverPicture) data.append('coverPicture', coverPicture);
  const token = localStorage.getItem('nobochitro_token');
  const response = await fetch('http://localhost:5000/api/auth/profile/media', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: data });
  const responseData = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(responseData.error || 'Could not upload the image.');
  return responseData;
}
