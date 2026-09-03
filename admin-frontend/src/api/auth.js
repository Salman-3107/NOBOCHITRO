import { adminApiRequest } from './client';

// Always sends asAdmin: true. The backend rejects with 403 if the account
// isn't actually an admin, even with correct credentials -- this app never
// logs a regular user in.
export function adminLogin({ username, password }) {
  return adminApiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password, asAdmin: true }),
  });
}
