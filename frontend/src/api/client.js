// Single source of truth for where the API lives. Set VITE_API_BASE in
// frontend/.env to point at a different host without editing code.
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';

const TOKEN_KEY = 'nobochitro_token';
const USER_KEY = 'nobochitro_user';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setSession({ token, user }) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // Corrupted entry -- treat it as "not logged in" rather than crashing
    // every component that reads it.
    localStorage.removeItem(USER_KEY);
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// App.jsx registers a callback here at startup. When the server tells us a
// token is no longer good -- expired, or revoked because the user logged out
// in another tab -- we clear the dead token and let the app drop back to the
// landing page. Without this the app keeps sending a token the server has
// already rejected, and every page just shows an error forever.
let onSessionExpired = null;
export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler;
}

export class ApiError extends Error {
  // `field` is optional: endpoints that can blame one specific input (the
  // registration form's username vs email clash) name it, so the UI can
  // highlight that box instead of just printing a sentence under the form.
  constructor(message, status, field = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.field = field;
  }
}

export async function apiRequest(path, options = {}) {
  const { headers: callerHeaders, body, ...rest } = options;

  // Caller options are spread FIRST so that `headers` below always wins.
  // The old order (`{ headers, ...options }`) let any caller passing its own
  // headers silently drop the Authorization header, and the request would go
  // out unauthenticated with no obvious sign of why it 401'd.
  const headers = { ...callerHeaders };

  // Only declare a JSON body when there actually is one. Sending
  // Content-Type: application/json on a bodyless GET is what triggers an
  // unnecessary CORS preflight on every read.
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...rest, body, headers });
  } catch {
    throw new ApiError('Could not reach the server. Is the backend running?', 0);
  }

  // 204 No Content has no body to parse.
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && token) {
      // The token we sent is dead. Drop it before anything else re-reads it.
      clearSession();
      if (onSessionExpired) onSessionExpired();
    }
    // Backend sends { error: "message", field?: "email" } on failure.
    throw new ApiError(
      data.error || 'Something went wrong. Please try again.',
      response.status,
      data.field || null
    );
  }

  return data;
}

// Multipart uploads go through the same path so they get the same bearer
// token and the same 401 handling. fetch sets the multipart Content-Type
// (including the boundary) itself, so we must not set it here.
export function apiUpload(path, formData) {
  return apiRequest(path, { method: 'POST', body: formData });
}
