import { apiRequest } from './client';

export function registerUser({ username, email, password }) {
  return apiRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password }),
  });
}

// No `asAdmin` flag is sent. The role comes from the database row the server
// looks up -- anything the client claimed about its own role would be
// worthless, so it isn't asked for.
export function loginUser({ username, password }) {
  return apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export function logoutUser() {
  return apiRequest('/auth/logout', { method: 'POST' });
}

// Used on page load to confirm the stored token is still live and to re-read
// the role from the server rather than trusting the cached copy.
export function fetchCurrentUser() {
  return apiRequest('/auth/me');
}
