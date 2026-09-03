const API_BASE = 'http://localhost:5000/api';

// Deliberately a different localStorage key from the public site
// ('nobochitro_admin_token' vs 'nobochitro_token'), so an admin session
// and a regular user session can coexist in the same browser without
// clobbering each other.
export async function adminApiRequest(path, options = {}) {
  const token = localStorage.getItem('nobochitro_admin_token');

  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    headers,
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong. Please try again.');
  }

  return data;
}
