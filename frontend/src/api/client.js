const API_BASE = 'http://localhost:5000/api';

export async function apiRequest(path, options = {}) {
  const token = localStorage.getItem('nobochitro_token');

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
    // Backend sends { error: "message" } on failure -- surface that message.
    throw new Error(data.error || 'Something went wrong. Please try again.');
  }

  return data;
}
