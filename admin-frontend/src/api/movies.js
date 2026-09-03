import { adminApiRequest } from './client';

export function listMovies(search = '') {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  return adminApiRequest(`/movies${query}`);
}

export function getMovie(movieId) {
  return adminApiRequest(`/movies/${movieId}`);
}

export function createMovie(payload) {
  return adminApiRequest('/movies', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateMovie(movieId, payload) {
  return adminApiRequest(`/movies/${movieId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function deleteMovie(movieId) {
  return adminApiRequest(`/movies/${movieId}`, {
    method: 'DELETE',
  });
}

export function listGenres() {
  return adminApiRequest('/genres');
}
