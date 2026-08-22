const API_BASE = 'http://localhost:5000/api';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    // Backend sends { error: "message" } on failure -- surface that message.
    throw new Error(data.error || 'Something went wrong. Please try again.');
  }

  return data;
}

export function registerUser({ username, email, password }) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password }),
  });
}

export function loginUser({ username, password }) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}
