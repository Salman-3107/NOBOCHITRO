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
