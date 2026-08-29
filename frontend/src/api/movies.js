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
